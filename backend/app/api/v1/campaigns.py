import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from slugify import slugify
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.org import Org, OrgMember
from app.models.user import User
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
    slug = await _unique_slug(body.title, db)
    campaign = Campaign(
        **body.model_dump(),
        owner_id=current_user.id,
        slug=slug,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
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
        base_q.order_by(Campaign.created_at.desc()).offset(offset).limit(size)
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
    return await _get_campaign_or_404(slug, current_user.id, db)


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
    await db.refresh(campaign)
    return campaign


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    campaign.status = CampaignStatus.archived
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
