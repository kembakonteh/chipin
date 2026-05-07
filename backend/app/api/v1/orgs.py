"""
Organization CRUD + member management.
All endpoints require authentication unless noted.
"""

import csv
import io
import uuid
from decimal import Decimal
from typing import Optional

import sqlalchemy as sa
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from slugify import slugify
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.r2 import upload_bytes
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.org import Org, OrgMember, OrgMemberRole
from app.models.user import User
from app.schemas.org import (
    AddMembersResponse,
    CampaignBrief,
    CampaignBriefWithPaid,
    ContributorBrief,
    CsvImportResponse,
    InviteTokenResponse,
    JoinOrgResponse,
    MemberCampaignRecord,
    MemberHistoryResponse,
    MembershipStatusResponse,
    OrgCreate,
    OrgMemberBrief,
    OrgMemberCreate,
    OrgMemberResponse,
    OrgMemberUpdate,
    OrgResponse,
    OrgStatsResponse,
    OrgUpdate,
    PublicOrgCampaign,
    PublicOrgInviteResponse,
    PublicOrgResponse,
    UpdateMemberResponse,
)

router = APIRouter(prefix="/orgs", tags=["orgs"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _unique_org_slug(name: str, db: AsyncSession) -> str:
    base = slugify(name)
    slug, counter = base, 1
    while True:
        hit = await db.execute(select(Org).where(Org.slug == slug))
        if not hit.scalar_one_or_none():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def _get_org_or_404(slug: str, db: AsyncSession) -> Org:
    result = await db.execute(select(Org).where(Org.slug == slug))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org not found")
    return org


async def _require_org_admin(org: Org, user: User, db: AsyncSession) -> None:
    """Raise 403 unless user is org owner or has admin/treasurer member record."""
    if org.owner_id == user.id:
        return
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org.id,
            OrgMember.user_id == user.id,
            OrgMember.role.in_([OrgMemberRole.admin, OrgMemberRole.treasurer]),
            OrgMember.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


async def _require_org_access(org: Org, user: User, db: AsyncSession) -> None:
    """Raise 403 unless user is org owner OR any active member."""
    if org.owner_id == user.id:
        return
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.org_id == org.id,
            OrgMember.user_id == user.id,
            OrgMember.is_active.is_(True),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _org_response(org: Org, member_count: int = 0) -> OrgResponse:
    return OrgResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        description=org.description,
        logo_url=org.logo_url,
        org_type=org.org_type,
        owner_id=org.owner_id,
        phone=org.phone,
        whatsapp_group_name=org.whatsapp_group_name,
        created_at=org.created_at,
        member_count=member_count,
    )


# ── Org CRUD ──────────────────────────────────────────────────────────────────

@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_org(
    body: OrgCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug = await _unique_org_slug(body.name, db)
    org = Org(
        name=body.name,
        slug=slug,
        description=body.description,
        org_type=body.org_type,
        whatsapp_group_name=body.whatsapp_group_name,
        owner_id=current_user.id,
        invite_token=uuid.uuid4(),
    )
    db.add(org)
    await db.flush()  # get org.id

    # Auto-add owner as admin member
    admin_member = OrgMember(
        org_id=org.id,
        user_id=current_user.id,
        name=current_user.email,
        role=OrgMemberRole.admin,
        is_active=True,
    )
    db.add(admin_member)
    await db.commit()
    await db.refresh(org)
    return _org_response(org, member_count=1)


@router.get("", response_model=list[OrgResponse])
async def list_orgs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all orgs where user is owner or active member."""
    member_org_ids_result = await db.execute(
        select(OrgMember.org_id).where(
            OrgMember.user_id == current_user.id,
            OrgMember.is_active.is_(True),
        )
    )
    member_org_ids = [r[0] for r in member_org_ids_result.all()]

    result = await db.execute(
        select(Org).where(
            or_(
                Org.owner_id == current_user.id,
                Org.id.in_(member_org_ids),
            )
        ).order_by(Org.created_at.desc())
    )
    orgs = result.scalars().all()

    # Count members per org
    counts_result = await db.execute(
        select(OrgMember.org_id, func.count().label("cnt"))
        .where(
            OrgMember.org_id.in_([o.id for o in orgs]),
            OrgMember.is_active.is_(True),
        )
        .group_by(OrgMember.org_id)
    )
    counts = {r[0]: r[1] for r in counts_result.all()}

    return [_org_response(o, counts.get(o.id, 0)) for o in orgs]


@router.get("/{slug}", response_model=OrgResponse)
async def get_org(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_access(org, current_user, db)

    count_result = await db.execute(
        select(func.count()).where(
            OrgMember.org_id == org.id, OrgMember.is_active.is_(True)
        )
    )
    return _org_response(org, count_result.scalar_one())


@router.patch("/{slug}", response_model=OrgResponse)
async def update_org(
    slug: str,
    body: OrgUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(org, field, value)

    # Sync org contact phone to the owner's own member record
    if body.phone is not None:
        owner_member = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org.id,
                OrgMember.user_id == current_user.id,
            )
        )
        member = owner_member.scalar_one_or_none()
        if member:
            member.phone = body.phone or None

    await db.commit()
    await db.refresh(org)
    count_result = await db.execute(
        select(func.count()).where(
            OrgMember.org_id == org.id, OrgMember.is_active.is_(True)
        )
    )
    return _org_response(org, count_result.scalar_one())


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    if org.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the org owner can delete it")

    # Unlink campaigns so they become standalone rather than vanishing
    await db.execute(
        sa.update(Campaign).where(Campaign.org_id == org.id).values(org_id=None)
    )
    # Use a raw DELETE so PostgreSQL's ON DELETE CASCADE removes org_members cleanly
    await db.execute(sa.delete(Org).where(Org.id == org.id))
    await db.commit()


@router.post("/{slug}/logo", response_model=OrgResponse)
async def upload_org_logo(
    slug: str,
    logo: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    content = await logo.read()
    ext = (logo.filename or "logo").rsplit(".", 1)[-1].lower()
    key = f"chipin/org-logos/{org.id}/{uuid.uuid4()}.{ext}"
    logo_url = await upload_bytes(key, content, logo.content_type or "image/png")
    if logo_url:
        org.logo_url = logo_url
        await db.commit()
        await db.refresh(org)

    count_result = await db.execute(
        select(func.count()).where(
            OrgMember.org_id == org.id, OrgMember.is_active.is_(True)
        )
    )
    return _org_response(org, count_result.scalar_one())


# ── Member management ─────────────────────────────────────────────────────────

async def _enrich_members(members: list, org_id: uuid.UUID, db: AsyncSession) -> list[OrgMemberResponse]:
    """Add payment stats to member records."""
    if not members:
        return []

    # For each member: count total campaigns and paid campaigns (matched by phone)
    member_phones = [m.phone for m in members if m.phone]
    if member_phones:
        stats_result = await db.execute(
            select(
                Contributor.phone,
                func.count(func.distinct(Contributor.campaign_id)).label("total"),
                func.sum(func.cast(Contributor.paid, sa.Integer())).label("paid_count"),
            )
            .join(Campaign, Campaign.id == Contributor.campaign_id)
            .where(
                Campaign.org_id == org_id,
                Contributor.phone.in_(member_phones),
            )
            .group_by(Contributor.phone)
        )
        stats = {r.phone: (r.total, r.paid_count or 0) for r in stats_result.all()}
    else:
        stats = {}

    responses = []
    for m in members:
        total, paid = stats.get(m.phone, (0, 0)) if m.phone else (0, 0)
        r = OrgMemberResponse(
            id=m.id,
            org_id=m.org_id,
            user_id=m.user_id,
            name=m.name,
            phone=m.phone,
            email=m.email,
            role=m.role,
            is_active=m.is_active,
            joined_at=m.joined_at,
            total_campaigns=total,
            paid_campaigns=paid,
        )
        responses.append(r)
    return responses


@router.post("/{slug}/members", response_model=AddMembersResponse, status_code=status.HTTP_201_CREATED)
async def add_members(
    slug: str,
    body: list[OrgMemberCreate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    created = []
    for m in body:
        # Deduplicate by phone
        if m.phone:
            dup = await db.execute(
                select(OrgMember).where(
                    OrgMember.org_id == org.id, OrgMember.phone == m.phone
                )
            )
            if dup.scalar_one_or_none():
                continue
        member = OrgMember(
            org_id=org.id,
            name=m.name,
            phone=m.phone,
            email=m.email,
            role=m.role,
        )
        db.add(member)
        created.append(member)

    await db.commit()
    for m in created:
        await db.refresh(m)

    # Find active campaigns this org is running (for notification prompt)
    campaigns_result = await db.execute(
        select(Campaign).where(
            Campaign.org_id == org.id,
            Campaign.status == CampaignStatus.active,
        )
    )
    active_campaigns = [
        CampaignBrief(slug=c.slug, title=c.title)
        for c in campaigns_result.scalars().all()
    ]

    return AddMembersResponse(
        members=await _enrich_members(created, org.id, db),
        active_campaigns=active_campaigns,
    )


@router.get("/{slug}/members", response_model=list[OrgMemberResponse])
async def list_members(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_access(org, current_user, db)

    result = await db.execute(
        select(OrgMember)
        .where(OrgMember.org_id == org.id)
        .order_by(OrgMember.name)
    )
    members = result.scalars().all()
    return await _enrich_members(list(members), org.id, db)


@router.patch("/{slug}/members/{member_id}", response_model=UpdateMemberResponse)
async def update_member(
    slug: str,
    member_id: uuid.UUID,
    body: OrgMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.id == member_id, OrgMember.org_id == org.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    was_active = member.is_active
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    await db.commit()
    await db.refresh(member)

    # If member was deactivated, find their active campaign presence
    on_active_campaigns: list[CampaignBriefWithPaid] = []
    if was_active and not member.is_active and member.phone:
        campaigns_result = await db.execute(
            select(Campaign, Contributor.paid)
            .join(Contributor, Contributor.campaign_id == Campaign.id)
            .where(
                Campaign.org_id == org.id,
                Campaign.status == CampaignStatus.active,
                Contributor.phone == member.phone,
            )
        )
        for campaign, paid in campaigns_result.all():
            on_active_campaigns.append(
                CampaignBriefWithPaid(slug=campaign.slug, title=campaign.title, paid=paid)
            )

    member_response = (await _enrich_members([member], org.id, db))[0]
    return UpdateMemberResponse(member=member_response, on_active_campaigns=on_active_campaigns)


@router.delete("/{slug}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    slug: str,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.id == member_id, OrgMember.org_id == org.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Soft delete
    member.is_active = False
    await db.commit()


@router.get("/{slug}/members/{member_id}/history", response_model=MemberHistoryResponse)
async def member_payment_history(
    slug: str,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    result = await db.execute(
        select(OrgMember).where(OrgMember.id == member_id, OrgMember.org_id == org.id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # All campaigns for this org, newest first
    campaigns_result = await db.execute(
        select(Campaign)
        .where(Campaign.org_id == org.id)
        .order_by(Campaign.created_at.desc())
    )
    campaigns = campaigns_result.scalars().all()

    # All contributors matching this member's phone across org campaigns
    contributor_map: dict[uuid.UUID, Contributor] = {}
    if member.phone and campaigns:
        campaign_ids = [c.id for c in campaigns]
        contrib_result = await db.execute(
            select(Contributor).where(
                Contributor.campaign_id.in_(campaign_ids),
                Contributor.phone == member.phone,
            )
        )
        for c in contrib_result.scalars().all():
            contributor_map[c.campaign_id] = c

    records: list[MemberCampaignRecord] = []
    for c in campaigns:
        contrib = contributor_map.get(c.id)
        records.append(MemberCampaignRecord(
            campaign_slug=c.slug,
            campaign_title=c.title,
            campaign_emoji=c.emoji,
            campaign_created_at=c.created_at,
            amount_expected=contrib.amount if contrib else (c.amount_per_person or Decimal("0")),
            paid=contrib.paid if contrib else False,
            paid_via=contrib.paid_via.value if contrib and contrib.paid_via else None,
            paid_at=contrib.paid_at if contrib else None,
            amount_paid=contrib.amount if (contrib and contrib.paid) else None,
        ))

    paid_count = sum(1 for r in records if r.paid)
    return MemberHistoryResponse(
        member_id=member.id,
        member_name=member.name,
        member_phone=member.phone,
        total=len(records),
        paid=paid_count,
        campaigns=records,
    )


@router.post("/{slug}/members/import-csv", response_model=CsvImportResponse)
async def import_csv(
    slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)

    content = await file.read()
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))

    # Normalise header names to lowercase
    rows = [{k.lower().strip(): v.strip() for k, v in row.items()} for row in reader]

    # Existing phones in this org (for dedup)
    existing_result = await db.execute(
        select(OrgMember.phone).where(
            OrgMember.org_id == org.id, OrgMember.phone.isnot(None)
        )
    )
    existing_phones = {r[0] for r in existing_result.all()}

    imported, skipped = 0, 0
    for row in rows:
        name = row.get("name", "").strip()
        if not name:
            skipped += 1
            continue
        phone = row.get("phone", "").strip() or None
        email = row.get("email", "").strip() or None

        if phone and phone in existing_phones:
            skipped += 1
            continue

        member = OrgMember(
            org_id=org.id,
            name=name,
            phone=phone,
            email=email,
            role=OrgMemberRole.member,
        )
        db.add(member)
        if phone:
            existing_phones.add(phone)
        imported += 1

    await db.commit()
    return CsvImportResponse(imported=imported, skipped=skipped)


# ── Org campaigns ─────────────────────────────────────────────────────────────

@router.get("/{slug}/campaigns")
async def org_campaigns(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.schemas.campaign import CampaignResponse
    from sqlalchemy.orm import selectinload

    org = await _get_org_or_404(slug, db)
    await _require_org_access(org, current_user, db)

    result = await db.execute(
        select(Campaign)
        .where(Campaign.org_id == org.id)
        .options(selectinload(Campaign.beneficiary))
        .order_by(Campaign.created_at.desc())
    )
    campaigns = result.scalars().all()

    # Aggregate stats
    total_result = await db.execute(
        select(func.sum(Contributor.amount))
        .join(Campaign, Campaign.id == Contributor.campaign_id)
        .where(Campaign.org_id == org.id, Contributor.paid.is_(True))
    )
    total_raised = total_result.scalar_one_or_none() or Decimal("0")

    active = sum(1 for c in campaigns if c.status == CampaignStatus.active)

    return {
        "campaigns": [CampaignResponse.model_validate(c) for c in campaigns],
        "stats": OrgStatsResponse(
            total_raised=total_raised,
            total_campaigns=len(campaigns),
            active_campaigns=active,
        ),
    }


# ── Membership status (campaign ↔ org sync) ───────────────────────────────────

@router.get("/{slug}/campaigns/{campaign_slug}/membership-status", response_model=MembershipStatusResponse)
async def membership_status(
    slug: str,
    campaign_slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """3-way diff: contributors not in org, org members not on campaign, deactivated members on campaign."""
    org = await _get_org_or_404(slug, db)
    await _require_org_access(org, current_user, db)

    campaign_result = await db.execute(
        select(Campaign).where(Campaign.slug == campaign_slug, Campaign.org_id == org.id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    # All contributors on campaign
    contrib_result = await db.execute(
        select(Contributor).where(Contributor.campaign_id == campaign.id)
    )
    contributors = contrib_result.scalars().all()

    # All org members
    members_result = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org.id)
    )
    members = members_result.scalars().all()

    active_member_phones = {m.phone for m in members if m.is_active and m.phone}
    all_member_phones = {m.phone for m in members if m.phone}
    deactivated_phones = {m.phone for m in members if not m.is_active and m.phone}

    contrib_phones = {c.phone for c in contributors if c.phone}

    on_campaign_not_in_org = [
        ContributorBrief(
            contributor_id=c.id,
            name=c.name,
            phone=c.phone,
            paid=c.paid,
        )
        for c in contributors
        if c.phone not in all_member_phones
    ]

    in_org_not_on_campaign = [
        OrgMemberBrief(
            member_id=m.id,
            name=m.name,
            phone=m.phone,
            email=m.email,
        )
        for m in members
        if m.is_active and m.phone not in contrib_phones
    ]

    deactivated_on_campaign = [
        ContributorBrief(
            contributor_id=c.id,
            name=c.name,
            phone=c.phone,
            paid=c.paid,
        )
        for c in contributors
        if c.phone in deactivated_phones
    ]

    return MembershipStatusResponse(
        on_campaign_not_in_org=on_campaign_not_in_org,
        in_org_not_on_campaign=in_org_not_on_campaign,
        deactivated_on_campaign=deactivated_on_campaign,
    )


# ── Invite token ──────────────────────────────────────────────────────────────

@router.get("/{slug}/invite-token", response_model=InviteTokenResponse)
async def get_invite_token(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)
    invite_url = f"{settings.FRONTEND_URL}/join/{org.invite_token}"
    return InviteTokenResponse(invite_token=str(org.invite_token), invite_url=invite_url)


@router.post("/{slug}/invite-token/rotate", response_model=InviteTokenResponse)
async def rotate_invite_token(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org_or_404(slug, db)
    await _require_org_admin(org, current_user, db)
    org.invite_token = uuid.uuid4()
    await db.commit()
    await db.refresh(org)
    invite_url = f"{settings.FRONTEND_URL}/join/{org.invite_token}"
    return InviteTokenResponse(invite_token=str(org.invite_token), invite_url=invite_url)


# ── Public org page ───────────────────────────────────────────────────────────

public_router = APIRouter(tags=["public"])


@public_router.get("/o/{slug}", response_model=PublicOrgResponse)
async def public_org(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Org).where(Org.slug == slug))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org not found")

    campaigns_result = await db.execute(
        select(Campaign).where(Campaign.org_id == org.id).order_by(Campaign.created_at.desc())
    )
    campaigns = campaigns_result.scalars().all()

    # Compute per-campaign stats
    campaign_ids = [c.id for c in campaigns]
    stats_result = await db.execute(
        select(
            Contributor.campaign_id,
            func.sum(Contributor.amount).label("raised"),
            func.count().filter(Contributor.paid.is_(True)).label("paid_count"),
        )
        .where(Contributor.campaign_id.in_(campaign_ids), Contributor.paid.is_(True))
        .group_by(Contributor.campaign_id)
    )
    campaign_stats = {r.campaign_id: (r.raised or Decimal("0"), r.paid_count) for r in stats_result.all()}

    active_campaigns = []
    past_campaigns = []
    total_raised = Decimal("0")

    for c in campaigns:
        raised, paid_count = campaign_stats.get(c.id, (Decimal("0"), 0))
        total_raised += raised
        item = PublicOrgCampaign(
            slug=c.slug,
            title=c.title,
            emoji=c.emoji,
            status=c.status.value,
            total_raised=raised,
            goal_amount=c.goal_amount,
            paid_count=paid_count,
        )
        if c.status == CampaignStatus.active:
            active_campaigns.append(item)
        else:
            past_campaigns.append(item)

    return PublicOrgResponse(
        name=org.name,
        slug=org.slug or slug,
        description=org.description,
        logo_url=org.logo_url,
        org_type=org.org_type,
        whatsapp_group_name=org.whatsapp_group_name,
        active_campaigns=active_campaigns,
        past_campaigns=past_campaigns,
        stats=OrgStatsResponse(
            total_raised=total_raised,
            total_campaigns=len(campaigns),
            active_campaigns=len(active_campaigns),
        ),
    )


@public_router.get("/o/invite/{token}", response_model=PublicOrgInviteResponse)
async def public_org_invite_preview(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Org).where(Org.invite_token == token))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link")

    count_result = await db.execute(
        select(func.count()).where(OrgMember.org_id == org.id, OrgMember.is_active.is_(True))
    )
    return PublicOrgInviteResponse(
        org_name=org.name,
        description=org.description,
        member_count=count_result.scalar_one(),
        slug=org.slug or "",
    )


@public_router.post("/o/invite/{token}/join", response_model=JoinOrgResponse)
async def join_org_via_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Org).where(Org.invite_token == token))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite link")

    # Check if already a member
    existing = await db.execute(
        select(OrgMember).where(OrgMember.org_id == org.id, OrgMember.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        return JoinOrgResponse(message="already_member", org_slug=org.slug or "")

    # Try to link to an existing unlinked member row matched by email or phone
    matched = None
    if current_user.email:
        res = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org.id,
                OrgMember.user_id.is_(None),
                OrgMember.email == current_user.email,
            )
        )
        matched = res.scalar_one_or_none()

    if not matched and current_user.phone:
        res = await db.execute(
            select(OrgMember).where(
                OrgMember.org_id == org.id,
                OrgMember.user_id.is_(None),
                OrgMember.phone == current_user.phone,
            )
        )
        matched = res.scalar_one_or_none()

    if matched:
        matched.user_id = current_user.id
        matched.is_active = True
    else:
        name = current_user.email or current_user.phone or "Member"
        new_member = OrgMember(
            org_id=org.id,
            user_id=current_user.id,
            name=name,
            email=current_user.email,
            phone=current_user.phone,
            role=OrgMemberRole.member,
            is_active=True,
        )
        db.add(new_member)

    await db.commit()
    return JoinOrgResponse(message="joined", org_slug=org.slug or "")
