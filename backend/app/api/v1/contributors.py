import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_arq, get_current_user
from app.core.security import create_invite_token, decode_invite_token
from app.models.campaign import Campaign
from app.models.contributor import Contributor, ContributorStatus
from app.models.org import OrgMember
from app.models.user import User
from app.schemas.contributor import (
    ContributorCreate,
    ContributorResponse,
    ContributorUpdate,
    InviteNewRequest,
    InviteRequest,
    MarkPaidRequest,
)
from app.workers.whatsapp import send_invite_whatsapp

router = APIRouter(tags=["contributors"])


async def _get_campaign_scoped(slug: str, owner_id: uuid.UUID, db: AsyncSession) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.slug == slug, Campaign.owner_id == owner_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


async def _get_contributor_or_404(
    contributor_id: uuid.UUID, campaign_id: uuid.UUID, db: AsyncSession
) -> Contributor:
    result = await db.execute(
        select(Contributor).where(
            Contributor.id == contributor_id,
            Contributor.campaign_id == campaign_id,
        )
    )
    contributor = result.scalar_one_or_none()
    if not contributor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contributor not found")
    return contributor


@router.post(
    "/campaigns/{slug}/contributors",
    response_model=ContributorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_contributor(
    slug: str,
    body: ContributorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)

    name = body.name
    phone = body.phone
    email = body.email

    if body.org_member_id:
        member_result = await db.execute(
            select(OrgMember).where(OrgMember.id == body.org_member_id)
        )
        member = member_result.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org member not found")
        if not name:
            name = member.name
        if phone is None:
            phone = member.phone
        if email is None:
            email = member.email

    if phone:
        dup_result = await db.execute(
            select(Contributor).where(
                Contributor.campaign_id == campaign.id,
                Contributor.phone == phone,
            )
        )
        if dup_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A contributor with this phone number is already on the campaign.",
            )

    is_paid = body.paid_via is not None
    amount = body.amount if body.amount is not None else (campaign.amount_per_person or 0)
    now = datetime.now(timezone.utc) if is_paid else None
    contributor = Contributor(
        campaign_id=campaign.id,
        name=name,
        phone=phone,
        email=email,
        amount=amount,
        is_anonymous=body.is_anonymous,
        added_by_organizer=True,
        paid=is_paid,
        paid_via=body.paid_via,
        paid_at=now,
        payment_note=body.note,
        status=ContributorStatus.paid if is_paid else ContributorStatus.pending,
    )
    db.add(contributor)
    await db.commit()
    await db.refresh(contributor)
    return contributor


@router.get("/campaigns/{slug}/contributors", response_model=list[ContributorResponse])
async def list_contributors(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    result = await db.execute(
        select(Contributor)
        .where(Contributor.campaign_id == campaign.id)
        .order_by(Contributor.created_at.asc())
    )
    return result.scalars().all()


@router.get("/campaigns/{slug}/contributors/export")
async def export_contributors_csv(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    result = await db.execute(
        select(Contributor)
        .where(Contributor.campaign_id == campaign.id)
        .order_by(Contributor.paid.desc(), Contributor.created_at.asc())
    )
    contributors = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Name", "Phone", "Email", "Amount", "Status",
        "Payment Method", "Date Paid", "Reference / Note", "Anonymous", "Added At",
    ])
    for c in contributors:
        writer.writerow([
            c.name,
            c.phone or "",
            c.email or "",
            str(c.amount),
            c.status.value,
            c.paid_via.value if c.paid_via else "",
            c.paid_at.strftime("%Y-%m-%d %H:%M") if c.paid_at else "",
            c.payment_note or "",
            "Yes" if c.is_anonymous else "No",
            c.created_at.strftime("%Y-%m-%d"),
        ])

    filename = f"{slug}-contributors.csv"
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/campaigns/{slug}/contributors/{contributor_id}",
    response_model=ContributorResponse,
)
async def update_contributor(
    slug: str,
    contributor_id: uuid.UUID,
    body: ContributorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contributor, field, value)
    await db.commit()
    await db.refresh(contributor)
    return contributor


@router.delete(
    "/campaigns/{slug}/contributors/{contributor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_contributor(
    slug: str,
    contributor_id: uuid.UUID,
    confirm_remove_paid: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)
    if contributor.paid and not confirm_remove_paid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contributor has already paid. Pass confirm_remove_paid=true to confirm deletion.",
        )
    await db.delete(contributor)
    await db.commit()


@router.post(
    "/campaigns/{slug}/contributors/{contributor_id}/mark-paid",
    response_model=ContributorResponse,
)
async def mark_paid(
    slug: str,
    contributor_id: uuid.UUID,
    body: MarkPaidRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)

    contributor.paid = True
    contributor.paid_at = datetime.now(timezone.utc)
    contributor.paid_via = body.paid_via
    contributor.status = ContributorStatus.paid
    if body.is_anonymous is not None:
        contributor.is_anonymous = body.is_anonymous
    if body.note is not None:
        contributor.payment_note = body.note.strip() or None
    if body.message is not None:
        contributor.message = body.message.strip() or None

    await db.commit()
    await db.refresh(contributor)
    return contributor


@router.post(
    "/campaigns/{slug}/contributors/{contributor_id}/remind",
    status_code=status.HTTP_202_ACCEPTED,
)
async def remind_contributor(
    slug: str,
    contributor_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    """Enqueue a WhatsApp payment reminder for one unpaid contributor."""
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)

    if contributor.paid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contributor has already paid.",
        )

    await arq.enqueue_job("send_payment_reminder", contributor_id=str(contributor.id))
    return {"queued": 1}


# ---------------------------------------------------------------------------
# Invite — existing contributor
# ---------------------------------------------------------------------------

@router.post(
    "/campaigns/{slug}/contributors/{contributor_id}/invite",
    response_model=ContributorResponse,
)
async def invite_contributor(
    slug: str,
    contributor_id: uuid.UUID,
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)

    if contributor.paid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contributor has already paid.")
    if not contributor.phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contributor has no phone number.")

    token = create_invite_token(str(contributor.id), campaign.slug)
    payment_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"
    decline_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}/decline?token={token}"
    first_name = contributor.name.split()[0]

    sent = await send_invite_whatsapp(
        phone=contributor.phone,
        first_name=first_name,
        organizer_name=current_user.name,
        campaign_title=campaign.title,
        custom_message=body.custom_message or "",
        payment_url=payment_url,
        decline_url=decline_url,
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send WhatsApp invite. Check the phone number format (must include country code) and try again.",
        )

    contributor.status = ContributorStatus.invited
    await db.commit()
    await db.refresh(contributor)
    return contributor


# ---------------------------------------------------------------------------
# Invite — new person (creates contributor + sends invite atomically)
# ---------------------------------------------------------------------------

@router.post(
    "/campaigns/{slug}/invite-new",
    response_model=ContributorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_new(
    slug: str,
    body: InviteNewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number is required.",
        )

    campaign = await _get_campaign_scoped(slug, current_user.id, db)

    dup = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == body.phone.strip(),
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A contributor with this phone number is already on the campaign.",
        )

    amount = campaign.amount_per_person or 0
    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name.strip(),
        phone=body.phone.strip(),
        amount=amount,
        added_by_organizer=True,
        status=ContributorStatus.invited,
    )
    db.add(contributor)
    await db.flush()

    token = create_invite_token(str(contributor.id), campaign.slug)
    payment_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"
    decline_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}/decline?token={token}"
    first_name = body.name.strip().split()[0]

    sent = await send_invite_whatsapp(
        phone=body.phone.strip(),
        first_name=first_name,
        organizer_name=current_user.name,
        campaign_title=campaign.title,
        custom_message=body.custom_message or "",
        payment_url=payment_url,
        decline_url=decline_url,
    )
    if not sent:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send WhatsApp invite. Check the phone number format (must include country code) and try again.",
        )

    await db.commit()
    await db.refresh(contributor)
    return contributor


# ---------------------------------------------------------------------------
# Decline — public endpoint (no auth), token-protected
# ---------------------------------------------------------------------------

@router.post("/campaigns/{slug}/decline")
async def decline_invite(
    slug: str,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        contributor_id_str, decoded_slug = decode_invite_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This decline link is invalid or has expired: {exc}",
        )

    if decoded_slug != slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token does not match this campaign.",
        )

    campaign_result = await db.execute(
        select(Campaign).where(Campaign.slug == slug)
    )
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")

    try:
        contributor_id = uuid.UUID(contributor_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token.")

    result = await db.execute(
        select(Contributor).where(
            Contributor.id == contributor_id,
            Contributor.campaign_id == campaign.id,
        )
    )
    contributor = result.scalar_one_or_none()
    if not contributor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contributor not found.")

    if contributor.status != ContributorStatus.declined:
        contributor.status = ContributorStatus.declined
        await db.commit()

    return {
        "message": "Decline recorded.",
        "campaign_title": campaign.title,
        "campaign_slug": campaign.slug,
    }
