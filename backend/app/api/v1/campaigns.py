import asyncio
import math
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from slugify import slugify
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_arq, get_current_user
from app.core.r2 import upload_bytes
from app.models.beneficiary import Beneficiary
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.org import Org, OrgMember
from app.models.payment import Payment
from app.models.payout import Payout
from app.models.recurring import RecurringInstance, RecurringSchedule
from app.models.template import CampaignTemplate
from app.models.user import User
from app.schemas.beneficiary import BeneficiaryResponse
from app.schemas.campaign import (
    CampaignCreate,
    CampaignResponse,
    CampaignUpdate,
    PaginatedResponse,
)
from app.schemas.contributor import (
    OrgMemberResponse,
    SyncOrgMembersRequest,
    SyncOrgMembersResponse,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


async def _unique_slug(title: str, db: AsyncSession) -> str:
    base = slugify(title)
    slug, counter = base, 1
    while True:
        hit = await db.execute(select(Campaign).where(Campaign.slug == slug))
        if not hit.scalar_one_or_none():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def _get_campaign_or_404(slug: str, owner_id: uuid.UUID, db: AsyncSession) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.slug == slug, Campaign.owner_id == owner_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    data.pop("template_id", None)

    if body.template_id:
        template = await db.get(CampaignTemplate, body.template_id)
        if template:
            explicit = body.model_dump(exclude_unset=True)
            if "emoji" not in explicit:
                data["emoji"] = template.emoji
            if "campaign_type" not in explicit:
                data["campaign_type"] = template.campaign_type
            if "description" not in explicit:
                data["description"] = template.description_template
            if "amount_per_person" not in explicit:
                data["amount_per_person"] = template.default_amount_per_person
            if "visibility_mode" not in explicit:
                data["visibility_mode"] = template.default_visibility_mode
            if "allow_anonymous_contributions" not in explicit:
                data["allow_anonymous_contributions"] = template.default_anonymous

    # Verify org ownership/admin before attaching
    if body.org_id:
        org_result = await db.execute(
            select(Org).where(Org.id == body.org_id)
        )
        org = org_result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org not found")
        if org.owner_id != current_user.id:
            admin_check = await db.execute(
                select(OrgMember).where(
                    OrgMember.org_id == org.id,
                    OrgMember.user_id == current_user.id,
                    OrgMember.role.in_(["admin", "treasurer"]),
                    OrgMember.is_active.is_(True),
                )
            )
            if not admin_check.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an org admin")

    slug = await _unique_slug(body.title, db)
    campaign = Campaign(**data, owner_id=current_user.id, slug=slug)
    db.add(campaign)
    await db.flush()  # get campaign.id

    # Auto-import active org members as contributors
    if body.org_id:
        members_result = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == body.org_id,
                OrgMember.is_active.is_(True),
            )
        )
        org_members = members_result.scalars().all()
        amount = campaign.amount_per_person or campaign.goal_amount
        for m in org_members:
            contributor = Contributor(
                campaign_id=campaign.id,
                name=m.name,
                phone=m.phone,
                email=m.email,
                amount=amount,
                added_by_organizer=True,
            )
            db.add(contributor)

    await db.commit()

    result = await db.execute(
        select(Campaign)
        .where(Campaign.id == campaign.id)
        .options(selectinload(Campaign.beneficiary))
    )
    campaign = result.scalar_one()
    return campaign


@router.get("", response_model=PaginatedResponse[CampaignResponse])
async def list_campaigns(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(Campaign).where(Campaign.owner_id == current_user.id)
    total_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = total_result.scalar_one()

    offset = (page - 1) * size
    result = await db.execute(
        base_q.options(selectinload(Campaign.beneficiary))
        .order_by(Campaign.created_at.desc()).offset(offset).limit(size)
    )
    items = result.scalars().all()

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.get("/{slug}", response_model=CampaignResponse)
async def get_campaign(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign)
        .where(Campaign.slug == slug, Campaign.owner_id == current_user.id)
        .options(selectinload(Campaign.beneficiary))
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@router.patch("/{slug}", response_model=CampaignResponse)
async def update_campaign(
    slug: str,
    body: CampaignUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)
    await db.commit()
    result = await db.execute(
        select(Campaign)
        .where(Campaign.id == campaign.id)
        .options(selectinload(Campaign.beneficiary))
    )
    return result.scalar_one()


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    campaign.status = CampaignStatus.archived
    await db.commit()


@router.delete("/{slug}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign_permanent(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    cid = campaign.id
    # Explicit cascade in dependency order — don't rely on DB-level ON DELETE CASCADE
    # (Alembic-generated migrations may omit it). All deletes share the session
    # transaction; any failure auto-rolls back via get_db.
    await db.execute(sa_delete(Payment).where(Payment.campaign_id == cid))
    await db.execute(sa_delete(Payout).where(Payout.campaign_id == cid))
    await db.execute(sa_delete(RecurringInstance).where(RecurringInstance.campaign_id == cid))
    await db.execute(sa_delete(RecurringSchedule).where(RecurringSchedule.campaign_id == cid))
    await db.execute(sa_delete(Beneficiary).where(Beneficiary.campaign_id == cid))
    await db.execute(sa_delete(Contributor).where(Contributor.campaign_id == cid))
    await db.execute(sa_delete(Campaign).where(Campaign.id == cid))
    await db.commit()


# --- Org member sync ---

@router.get("/{slug}/unsynced-members", response_model=list[OrgMemberResponse])
async def unsynced_members(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    if not campaign.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This campaign is not linked to an org.",
        )

    # Phones already on this campaign
    existing_phones = select(Contributor.phone).where(
        Contributor.campaign_id == campaign.id,
        Contributor.phone.isnot(None),
    )

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == campaign.org_id,
            OrgMember.is_active.is_(True),
            OrgMember.phone.notin_(existing_phones),
        )
    )
    return result.scalars().all()


@router.post("/{slug}/sync-org-members", response_model=SyncOrgMembersResponse)
async def sync_org_members(
    slug: str,
    body: SyncOrgMembersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    if not campaign.org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This campaign is not linked to an org.",
        )

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == campaign.org_id,
            OrgMember.id.in_(body.member_ids),
            OrgMember.is_active.is_(True),
        )
    )
    members = result.scalars().all()

    new_contributors = [
        Contributor(
            campaign_id=campaign.id,
            name=m.name,
            phone=m.phone,
            email=m.email,
            amount=campaign.amount_per_person or 0,
            added_by_organizer=True,
        )
        for m in members
    ]
    db.add_all(new_contributors)
    await db.commit()

    return SyncOrgMembersResponse(added=len(new_contributors))


# --- WhatsApp reminder blast ---

@router.post("/{slug}/remind-all", status_code=status.HTTP_202_ACCEPTED)
async def remind_all(
    slug: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    """Enqueue a WhatsApp reminder blast for all unpaid contributors."""
    campaign = await _get_campaign_or_404(slug, current_user.id, db)

    total_result = await db.execute(
        select(func.count()).where(
            Contributor.campaign_id == campaign.id,
            Contributor.paid.is_(False),
        )
    )
    total_unpaid = total_result.scalar_one()

    phone_result = await db.execute(
        select(func.count()).where(
            Contributor.campaign_id == campaign.id,
            Contributor.paid.is_(False),
            Contributor.phone.isnot(None),
        )
    )
    with_phone = phone_result.scalar_one()
    queued = min(with_phone, 50)
    skipped = total_unpaid - with_phone

    await arq.enqueue_job("send_reminder_blast", campaign_id=str(campaign.id))
    return {"queued": queued, "skipped": skipped}


# --- Printable QR collection card ---

@router.get("/{slug}/qr-card")
async def qr_card(
    slug: str,
    format: Literal["png", "pdf"] = Query("png"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a printable A5 QR collection card as PNG or PDF."""
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    campaign_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"

    from app.workers.cards import generate_qr_card as _gen_qr

    as_pdf = format == "pdf"
    card_bytes = await asyncio.to_thread(
        _gen_qr,
        title=campaign.title,
        emoji=campaign.emoji or "🎯",
        slug=campaign.slug,
        campaign_url=campaign_url,
        as_pdf=as_pdf,
    )

    if as_pdf:
        media_type = "application/pdf"
        filename = f"chipin-{campaign.slug}-qr.pdf"
    else:
        media_type = "image/png"
        filename = f"chipin-{campaign.slug}-qr.png"

    return Response(
        content=card_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Beneficiary profile ---

@router.post(
    "/{slug}/beneficiary",
    response_model=BeneficiaryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_beneficiary(
    slug: str,
    display_name: str = Form(...),
    story: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)

    existing = await db.execute(
        select(Beneficiary).where(Beneficiary.campaign_id == campaign.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This campaign already has a beneficiary profile. Use PATCH to update.",
        )

    photo_url: Optional[str] = None
    if photo and photo.size:
        content = await photo.read()
        ext = (photo.filename or "photo").rsplit(".", 1)[-1].lower()
        key = f"chipin/beneficiaries/{campaign.id}/{uuid.uuid4()}.{ext}"
        photo_url = await upload_bytes(key, content, photo.content_type or "image/jpeg")

    beneficiary = Beneficiary(
        campaign_id=campaign.id,
        display_name=display_name,
        story=story,
        location=location,
        photo_url=photo_url,
    )
    db.add(beneficiary)
    await db.commit()
    await db.refresh(beneficiary)
    return beneficiary


@router.get("/{slug}/beneficiary", response_model=Optional[BeneficiaryResponse])
async def get_beneficiary(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    result = await db.execute(
        select(Beneficiary).where(Beneficiary.campaign_id == campaign.id)
    )
    return result.scalar_one_or_none()


@router.patch("/{slug}/beneficiary", response_model=BeneficiaryResponse)
async def update_beneficiary(
    slug: str,
    display_name: Optional[str] = Form(None),
    story: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    result = await db.execute(
        select(Beneficiary).where(Beneficiary.campaign_id == campaign.id)
    )
    beneficiary = result.scalar_one_or_none()
    if not beneficiary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No beneficiary profile found."
        )

    if display_name is not None:
        beneficiary.display_name = display_name
    if story is not None:
        beneficiary.story = story
    if location is not None:
        beneficiary.location = location

    if photo and photo.size:
        content = await photo.read()
        ext = (photo.filename or "photo").rsplit(".", 1)[-1].lower()
        key = f"chipin/beneficiaries/{campaign.id}/{uuid.uuid4()}.{ext}"
        new_url = await upload_bytes(key, content, photo.content_type or "image/jpeg")
        if new_url:
            beneficiary.photo_url = new_url

    await db.commit()
    await db.refresh(beneficiary)
    return beneficiary


@router.delete("/{slug}/beneficiary", status_code=status.HTTP_204_NO_CONTENT)
async def delete_beneficiary(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    result = await db.execute(
        select(Beneficiary).where(Beneficiary.campaign_id == campaign.id)
    )
    beneficiary = result.scalar_one_or_none()
    if not beneficiary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No beneficiary profile found."
        )
    await db.delete(beneficiary)
    await db.commit()
