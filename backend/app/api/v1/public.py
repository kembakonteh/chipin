from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_arq
from app.models.campaign import Campaign, CampaignStatus, VisibilityMode
from app.models.contributor import Contributor
from app.models.user import User
from app.schemas.contributor import (
    JoinCampaignRequest,
    JoinCampaignResponse,
    MembershipResponse,
)
from app.schemas.public import PublicCampaignResponse, PublicContributorItem

router = APIRouter(tags=["public"])


def _resolve_display_name(name: str, is_anonymous: bool, visibility_mode: VisibilityMode) -> str:
    """Two-layer name resolution.
    Layer 1: individual is_anonymous flag (highest priority).
    Layer 2: campaign visibility_mode.
    """
    if is_anonymous:
        return "Anonymous"
    if visibility_mode == VisibilityMode.full_name:
        return name
    if visibility_mode == VisibilityMode.first_name_only:
        return name.split()[0]
    # anonymous mode
    return "Anonymous"


@router.get("/p/{slug}", response_model=PublicCampaignResponse)
async def public_campaign(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    contrib_result = await db.execute(
        select(Contributor)
        .where(Contributor.campaign_id == campaign.id)
        .order_by(Contributor.created_at.asc())
    )
    contributors = contrib_result.scalars().all()

    total_raised = sum(
        (c.amount for c in contributors if c.paid), start=Decimal("0")
    )
    paid_count = sum(1 for c in contributors if c.paid)

    public_contributors = [
        PublicContributorItem(
            display_name=_resolve_display_name(
                c.name, c.is_anonymous, campaign.visibility_mode
            ),
            amount=c.amount,
            paid=c.paid,
            paid_at=c.paid_at,
        )
        for c in contributors
    ]

    return PublicCampaignResponse(
        slug=campaign.slug,
        title=campaign.title,
        description=campaign.description,
        emoji=campaign.emoji,
        campaign_type=campaign.campaign_type,
        goal_amount=campaign.goal_amount,
        amount_per_person=campaign.amount_per_person,
        currency=campaign.currency,
        allow_anonymous_contributions=campaign.allow_anonymous_contributions,
        total_raised=total_raised,
        contributor_count=len(contributors),
        paid_count=paid_count,
        contributors=public_contributors,
        status=campaign.status,
    )


@router.post("/p/{slug}/join", response_model=JoinCampaignResponse, status_code=status.HTTP_201_CREATED)
async def join_campaign(
    slug: str,
    body: JoinCampaignRequest,
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != CampaignStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign is not accepting new contributors.",
        )

    # Duplicate check by phone
    dup_result = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == body.phone,
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already on this campaign.",
        )

    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        amount=campaign.amount_per_person or Decimal("0"),
        added_by_organizer=False,
    )
    db.add(contributor)
    await db.commit()
    await db.refresh(contributor)

    # Notify organizer via WhatsApp (fire-and-forget ARQ task)
    owner_result = await db.execute(select(User).where(User.id == campaign.owner_id))
    owner = owner_result.scalar_one_or_none()
    if owner and owner.phone and campaign.whatsapp_reminders_enabled:
        await arq.enqueue_job(
            "notify_organizer_whatsapp",
            organizer_phone=owner.phone,
            message=f"{body.name} just added themselves to {campaign.title}.",
        )

    return JoinCampaignResponse(
        contributor_id=contributor.id,
        message="You have been added!",
    )


@router.get("/p/{slug}/check-membership", response_model=MembershipResponse)
async def check_membership(
    slug: str,
    phone: str = Query(..., description="Phone number to check"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    contrib_result = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == phone,
        )
    )
    contributor = contrib_result.scalar_one_or_none()
    if not contributor:
        return MembershipResponse(is_member=False)

    return MembershipResponse(
        is_member=True,
        contributor_id=contributor.id,
        paid=contributor.paid,
    )
