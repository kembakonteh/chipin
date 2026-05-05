import asyncio
import logging
import random
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.susu import (
    SusuContribution,
    SusuCycle,
    SusuCycleStatus,
    SusuFrequency,
    SusuGroup,
    SusuMember,
    SusuPayoutOrder,
    SusuPaidVia,
    SusuStatus,
    compute_susu_due_date,
)
from app.models.user import User
from app.schemas.susu import (
    MarkPaidRequest,
    SusuCheckoutResponse,
    SusuContributeRequest,
    SusuContributionResponse,
    SusuCycleResponse,
    SusuCycleSummary,
    SusuDetailResponse,
    SusuGroupCreate,
    SusuGroupResponse,
    SusuGroupUpdate,
    SusuMemberCreate,
    SusuMemberResponse,
    SusuMemberUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["susu"])
public_router = APIRouter(tags=["susu-public"])

stripe.api_key = settings.STRIPE_SECRET_KEY


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug[:80]


async def _get_group_or_404(slug: str, db: AsyncSession) -> SusuGroup:
    result = await db.execute(
        select(SusuGroup)
        .options(
            selectinload(SusuGroup.members),
            selectinload(SusuGroup.cycles).selectinload(SusuCycle.contributions).selectinload(SusuContribution.member),
        )
        .where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    return group


def _build_cycle_response(cycle: SusuCycle) -> SusuCycleResponse:
    recipient_name = cycle.recipient.name if cycle.recipient else "Unknown"
    contribs = [
        SusuContributionResponse(
            id=c.id,
            cycle_id=c.cycle_id,
            member_id=c.member_id,
            member_name=c.member.name if c.member else "Unknown",
            amount=c.amount,
            paid=c.paid,
            paid_via=c.paid_via,
            paid_at=c.paid_at,
        )
        for c in cycle.contributions
    ]
    return SusuCycleResponse(
        id=cycle.id,
        group_id=cycle.group_id,
        cycle_number=cycle.cycle_number,
        due_date=cycle.due_date,
        pot_amount=cycle.pot_amount,
        collected_amount=cycle.collected_amount,
        recipient_member_id=cycle.recipient_member_id,
        recipient_name=recipient_name,
        payout_sent_at=cycle.payout_sent_at,
        status=cycle.status,
        contributions=contribs,
    )


def _build_detail(group: SusuGroup) -> SusuDetailResponse:
    members = [SusuMemberResponse.model_validate(m) for m in group.members]

    current_cycle_detail = None
    summaries = []
    recipient_map = {m.id: m.name for m in group.members}

    for cycle in group.cycles:
        rname = recipient_map.get(cycle.recipient_member_id, "Unknown")
        if cycle.cycle_number == group.current_cycle:
            current_cycle_detail = _build_cycle_response(cycle)
        summaries.append(SusuCycleSummary(
            id=cycle.id,
            cycle_number=cycle.cycle_number,
            due_date=cycle.due_date,
            pot_amount=cycle.pot_amount,
            collected_amount=cycle.collected_amount,
            recipient_member_id=cycle.recipient_member_id,
            recipient_name=rname,
            payout_sent_at=cycle.payout_sent_at,
            status=cycle.status,
        ))

    return SusuDetailResponse(
        id=group.id,
        org_id=group.org_id,
        owner_id=group.owner_id,
        name=group.name,
        slug=group.slug,
        contribution_amount=group.contribution_amount,
        frequency=group.frequency,
        total_members=group.total_members,
        current_cycle=group.current_cycle,
        total_cycles=group.total_cycles,
        status=group.status,
        payout_order=group.payout_order,
        start_date=group.start_date,
        next_contribution_date=group.next_contribution_date,
        next_payout_date=group.next_payout_date,
        created_at=group.created_at,
        members=members,
        current_cycle_detail=current_cycle_detail,
        cycle_summaries=summaries,
    )


# ---------------------------------------------------------------------------
# POST /susu — create susu group
# ---------------------------------------------------------------------------

@router.post("/susu", response_model=SusuGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_susu_group(
    body: SusuGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slug = body.slug or _slugify(body.name)

    # Ensure slug uniqueness
    base_slug = slug
    counter = 1
    while True:
        existing = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
        if not existing.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    group = SusuGroup(
        owner_id=current_user.id,
        org_id=body.org_id,
        name=body.name,
        slug=slug,
        contribution_amount=body.contribution_amount,
        frequency=body.frequency,
        total_cycles=body.total_cycles,
        payout_order=body.payout_order,
        start_date=body.start_date,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


# ---------------------------------------------------------------------------
# GET /susu — list my susu groups
# ---------------------------------------------------------------------------

@router.get("/susu", response_model=List[SusuGroupResponse])
async def list_susu_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SusuGroup)
        .where(SusuGroup.owner_id == current_user.id)
        .order_by(SusuGroup.created_at.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# GET /susu/{slug} — group detail (auth)
# ---------------------------------------------------------------------------

@router.get("/susu/{slug}", response_model=SusuDetailResponse)
async def get_susu_group(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await _get_group_or_404(slug, db)
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    return _build_detail(group)


# ---------------------------------------------------------------------------
# PATCH /susu/{slug} — update group (forming only)
# ---------------------------------------------------------------------------

@router.patch("/susu/{slug}", response_model=SusuGroupResponse)
async def update_susu_group(
    slug: str,
    body: SusuGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only update groups in forming state")

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(group, k, v)
    await db.commit()
    await db.refresh(group)
    return group


# ---------------------------------------------------------------------------
# DELETE /susu/{slug}
# ---------------------------------------------------------------------------

@router.delete("/susu/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_susu_group(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if group.status == SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete an active group")
    await db.delete(group)
    await db.commit()


# ---------------------------------------------------------------------------
# POST /susu/{slug}/members
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/members", response_model=SusuMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_susu_member(
    slug: str,
    body: SusuMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SusuGroup).options(selectinload(SusuGroup.members)).where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if group.status == SusuStatus.completed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group is completed")

    # Phone dedup within group
    existing_phones = {m.phone for m in group.members}
    if body.phone in existing_phones:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member with this phone already exists in group")

    member = SusuMember(
        group_id=group.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        payout_position=body.payout_position,
    )
    db.add(member)
    group.total_members += 1
    await db.commit()
    await db.refresh(member)
    return member


# ---------------------------------------------------------------------------
# PATCH /susu/{slug}/members/{member_id}
# ---------------------------------------------------------------------------

@router.patch("/susu/{slug}/members/{member_id}", response_model=SusuMemberResponse)
async def update_susu_member(
    slug: str,
    member_id: uuid.UUID,
    body: SusuMemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group or group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(member, k, v)
    await db.commit()
    await db.refresh(member)
    return member


# ---------------------------------------------------------------------------
# DELETE /susu/{slug}/members/{member_id}
# ---------------------------------------------------------------------------

@router.delete("/susu/{slug}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_susu_member(
    slug: str,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group or group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only remove members from forming groups")

    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.delete(member)
    group.total_members = max(0, group.total_members - 1)
    await db.commit()


# ---------------------------------------------------------------------------
# POST /susu/{slug}/start — activate the group, create all cycles
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/start", response_model=SusuDetailResponse)
async def start_susu(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SusuGroup)
        .options(selectinload(SusuGroup.members))
        .where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")
    if group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group is already started")

    members = list(group.members)
    n = len(members)
    if n < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Need at least 2 members to start")
    if n > group.total_cycles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="More members than total cycles")

    # Determine payout order
    if group.payout_order == SusuPayoutOrder.random:
        random.shuffle(members)
        for i, m in enumerate(members, start=1):
            m.payout_position = i
    elif group.payout_order == SusuPayoutOrder.fixed:
        # Sort by payout_position (nulls go to end), then assign sequentially
        members_with_pos = sorted(members, key=lambda m: (m.payout_position is None, m.payout_position or 0))
        unassigned = [m for m in members_with_pos if m.payout_position is None]
        next_pos = max((m.payout_position or 0 for m in members if m.payout_position), default=0) + 1
        for m in unassigned:
            m.payout_position = next_pos
            next_pos += 1
        members = sorted(members, key=lambda m: m.payout_position or 999)

    # Build cycle → recipient mapping (cycles wrap around if n < total_cycles)
    pot_amount = group.contribution_amount * n

    cycle_records = []
    for cycle_num in range(1, group.total_cycles + 1):
        recipient = members[(cycle_num - 1) % n]
        due_date = compute_susu_due_date(group.start_date, group.frequency, cycle_num - 1)
        cycle = SusuCycle(
            group_id=group.id,
            cycle_number=cycle_num,
            due_date=due_date,
            pot_amount=pot_amount,
            recipient_member_id=recipient.id,
        )
        db.add(cycle)
        cycle_records.append(cycle)

    await db.flush()  # get cycle IDs

    # Create contribution records for cycle 1
    cycle1 = cycle_records[0]
    for member in group.members:
        db.add(SusuContribution(
            cycle_id=cycle1.id,
            member_id=member.id,
            amount=group.contribution_amount,
        ))

    group.status = SusuStatus.active
    group.total_members = n
    group.current_cycle = 1
    group.next_contribution_date = cycle_records[0].due_date
    group.next_payout_date = cycle_records[0].due_date

    await db.commit()

    # Re-fetch with all relationships
    group = await _get_group_or_404(slug, db)
    return _build_detail(group)


# ---------------------------------------------------------------------------
# POST /susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-paid
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-paid", response_model=SusuContributionResponse)
async def mark_contribution_paid(
    slug: str,
    cycle_number: int,
    member_id: uuid.UUID,
    body: MarkPaidRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group or group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    cycle_result = await db.execute(
        select(SusuCycle)
        .options(selectinload(SusuCycle.contributions).selectinload(SusuContribution.member))
        .where(SusuCycle.group_id == group.id, SusuCycle.cycle_number == cycle_number)
    )
    cycle = cycle_result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")

    contrib = next((c for c in cycle.contributions if c.member_id == member_id), None)
    if not contrib:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution record not found for member")

    contrib.paid = True
    contrib.paid_via = body.paid_via
    contrib.paid_at = datetime.now(timezone.utc)

    # Update cycle collected amount
    cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + contrib.amount

    # Update member total
    member_result = await db.execute(select(SusuMember).where(SusuMember.id == member_id))
    member = member_result.scalar_one_or_none()
    if member:
        member.total_contributed += contrib.amount

    # Auto-collect cycle if all paid
    unpaid = [c for c in cycle.contributions if not c.paid]
    if not unpaid:
        cycle.status = SusuCycleStatus.collected

    await db.commit()
    await db.refresh(contrib)

    return SusuContributionResponse(
        id=contrib.id,
        cycle_id=contrib.cycle_id,
        member_id=contrib.member_id,
        member_name=contrib.member.name if contrib.member else "Unknown",
        amount=contrib.amount,
        paid=contrib.paid,
        paid_via=contrib.paid_via,
        paid_at=contrib.paid_at,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/cycles/{cycle_number}/mark-paid-out
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/cycles/{cycle_number}/mark-paid-out", response_model=SusuCycleSummary)
async def mark_payout_sent(
    slug: str,
    cycle_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group or group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    cycle_result = await db.execute(
        select(SusuCycle).where(SusuCycle.group_id == group.id, SusuCycle.cycle_number == cycle_number)
    )
    cycle = cycle_result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")

    cycle.payout_sent_at = datetime.now(timezone.utc)
    cycle.status = SusuCycleStatus.paid_out

    # Mark recipient as having received payout
    recipient_result = await db.execute(select(SusuMember).where(SusuMember.id == cycle.recipient_member_id))
    recipient = recipient_result.scalar_one_or_none()
    if recipient:
        recipient.has_received_payout = True

    await db.commit()
    await db.refresh(cycle)

    # Get recipient name
    rname = recipient.name if recipient else "Unknown"
    return SusuCycleSummary(
        id=cycle.id,
        cycle_number=cycle.cycle_number,
        due_date=cycle.due_date,
        pot_amount=cycle.pot_amount,
        collected_amount=cycle.collected_amount,
        recipient_member_id=cycle.recipient_member_id,
        recipient_name=rname,
        payout_sent_at=cycle.payout_sent_at,
        status=cycle.status,
    )


# ---------------------------------------------------------------------------
# POST /s/{slug}/pay — public Stripe checkout for susu contribution
# ---------------------------------------------------------------------------

@public_router.post("/s/{slug}/pay", response_model=SusuCheckoutResponse, status_code=status.HTTP_201_CREATED)
async def initiate_susu_payment(
    slug: str,
    body: SusuContributeRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SusuGroup)
        .options(selectinload(SusuGroup.owner))
        .where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.status != SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group is not currently active")

    # Find the member
    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == body.member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Find the current cycle contribution for this member
    cycle_result = await db.execute(
        select(SusuCycle).where(
            SusuCycle.group_id == group.id,
            SusuCycle.cycle_number == group.current_cycle,
        )
    )
    cycle = cycle_result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Current cycle not found")

    contrib_result = await db.execute(
        select(SusuContribution).where(
            SusuContribution.cycle_id == cycle.id,
            SusuContribution.member_id == member.id,
        )
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contribution record for this member in current cycle")
    if contrib.paid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already paid for this cycle")

    amount_cents = int(group.contribution_amount * 100)
    currency = "usd"

    success_url = f"{settings.FRONTEND_URL}/s/{slug}?paid=1"
    cancel_url = f"{settings.FRONTEND_URL}/s/{slug}"

    session_params: dict = {
        "mode": "payment",
        "line_items": [{
            "price_data": {
                "currency": currency,
                "unit_amount": amount_cents,
                "product_data": {
                    "name": f"{group.name} — Cycle {group.current_cycle} contribution",
                    "description": f"Susu contribution for {member.name}",
                },
            },
            "quantity": 1,
        }],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {
            "susu_contribution_id": str(contrib.id),
            "susu_group_id": str(group.id),
            "susu_member_id": str(member.id),
        },
    }

    if body.email:
        session_params["customer_email"] = body.email

    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, **session_params)
    except stripe.StripeError as exc:
        logger.error("Stripe error for susu %s: %s", slug, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Payment provider error")

    contrib.stripe_payment_intent_id = session.payment_intent
    await db.commit()

    return SusuCheckoutResponse(checkout_url=session.url)


# ---------------------------------------------------------------------------
# GET /s/{slug} — public susu page
# ---------------------------------------------------------------------------

@public_router.get("/s/{slug}", response_model=SusuDetailResponse)
async def public_susu_page(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(slug, db)
    return _build_detail(group)
