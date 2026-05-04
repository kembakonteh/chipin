import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.campaign import Campaign
from app.models.contributor import Contributor
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
    amount = body.amount if body.amount is not None else (campaign.amount_per_person or 0)
    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        amount=amount,
        is_anonymous=body.is_anonymous,
        added_by_organizer=True,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_scoped(slug, current_user.id, db)
    contributor = await _get_contributor_or_404(contributor_id, campaign.id, db)
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

    await db.commit()
    await db.refresh(contributor)
    return contributor
