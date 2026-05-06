import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_arq, get_current_user
from app.models.campaign import Campaign
from app.models.contributor import Contributor
from app.models.org import OrgMember
from app.models.user import User
from app.schemas.contributor import (
    ContributorCreate,
    ContributorResponse,
    ContributorUpdate,
    MarkPaidRequest,
)

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

    # If org_member_id provided, pull data from org directory
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

    # Deduplicate by phone
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

    amount = body.amount if body.amount is not None else (campaign.amount_per_person or 0)
    now = datetime.now(timezone.utc) if body.paid_via else None
    contributor = Contributor(
        campaign_id=campaign.id,
        name=name,
        phone=phone,
        email=email,
        amount=amount,
        is_anonymous=body.is_anonymous,
        added_by_organizer=True,
        paid=body.paid_via is not None,
        paid_via=body.paid_via,
        paid_at=now,
        payment_note=body.note,
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
        "Name", "Phone", "Email", "Amount", "Paid",
        "Payment Method", "Date Paid", "Reference / Note", "Anonymous", "Added At",
    ])
    for c in contributors:
        writer.writerow([
            c.name,
            c.phone or "",
            c.email or "",
            str(c.amount),
            "Yes" if c.paid else "No",
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
