import asyncio
import csv
import io
import logging
import random
import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sa_delete, select
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
    SusuJoinRequest,
    SusuJoinRequestStatus,
    SusuMember,
    SusuPayoutOrder,
    SusuPaidVia,
    SusuStatus,
    compute_susu_due_date,
)
from app.models.user import User
from app.schemas.susu import (
    MarkPaidRequest,
    MarkPayoutRequest,
    SusuCheckoutResponse,
    SusuContributeRequest,
    SusuContributionResponse,
    SusuCycleResponse,
    SusuCycleSummary,
    SusuDetailResponse,
    SusuGroupCreate,
    SusuGroupResponse,
    SusuGroupUpdate,
    SusuJoinRequestCreate,
    SusuJoinRequestResponse,
    SusuMemberCreate,
    SusuMemberResponse,
    SusuMemberStanding,
    SusuMemberUpdate,
    SusuOfflinePayRequest,
    SusuPaymentSettingsUpdate,
    SusuPayPageInfo,
    SusuStandingsResponse,
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
            missed=c.missed,
            pending_verification=c.pending_verification,
            split_primary_paid=c.split_primary_paid,
            split_partner_paid=c.split_partner_paid,
            split_partner_paid_via=c.split_partner_paid_via,
            split_partner_pending_verification=c.split_partner_pending_verification,
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
        payout_method=cycle.payout_method,
        payout_reference=cycle.payout_reference,
        status=cycle.status,
        contributions=contribs,
    )


def _build_detail(group: SusuGroup) -> SusuDetailResponse:
    members = [SusuMemberResponse.model_validate(m) for m in group.members]

    current_cycle_detail = None
    summaries = []
    # For split members, show "Primary & Partner (split)" as recipient name
    recipient_map = {}
    for m in group.members:
        if m.is_split and m.split_partner_name:
            recipient_map[m.id] = f"{m.name} & {m.split_partner_name} (split)"
        else:
            recipient_map[m.id] = m.name

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
            payout_method=cycle.payout_method,
            payout_reference=cycle.payout_reference,
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
        missed_policy=group.missed_policy,
        late_fee_pct=group.late_fee_pct,
        rules=group.rules,
        allow_card=group.allow_card,
        allow_cashapp=group.allow_cashapp,
        allow_zelle=group.allow_zelle,
        cashapp_handle=group.cashapp_handle,
        zelle_handle=group.zelle_handle,
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
        missed_policy=body.missed_policy,
        late_fee_pct=body.late_fee_pct,
        rules=body.rules,
        allow_card=body.allow_card,
        allow_cashapp=body.allow_cashapp,
        allow_zelle=body.allow_zelle,
        cashapp_handle=body.cashapp_handle,
        zelle_handle=body.zelle_handle,
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
    update_data = body.model_dump(exclude_unset=True)
    # Rules and missed policy can be updated at any time;
    # other fields (name, payout_order) require the group to still be forming
    restricted_fields = {k for k in update_data if k not in ('rules', 'missed_policy', 'late_fee_pct')}
    if restricted_fields and group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only update group details in forming state")

    for k, v in update_data.items():
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
# DELETE /susu/{slug}/permanent — hard delete any group, explicit cascade order
# ---------------------------------------------------------------------------

@router.delete("/susu/{slug}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanent_delete_susu_group(
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

    # Explicit cascade order avoids RESTRICT violation on SusuCycle.recipient_member_id
    cycle_ids = select(SusuCycle.id).where(SusuCycle.group_id == group.id)
    await db.execute(sa_delete(SusuContribution).where(SusuContribution.cycle_id.in_(cycle_ids)))
    await db.execute(sa_delete(SusuCycle).where(SusuCycle.group_id == group.id))
    await db.execute(sa_delete(SusuJoinRequest).where(SusuJoinRequest.group_id == group.id))
    await db.execute(sa_delete(SusuMember).where(SusuMember.group_id == group.id))
    await db.delete(group)
    await db.commit()


# ---------------------------------------------------------------------------
# POST /susu/{slug}/share-standings — WhatsApp standings to organizer
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/share-standings")
async def share_susu_standings(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SusuGroup)
        .options(
            selectinload(SusuGroup.members),
            selectinload(SusuGroup.cycles).selectinload(SusuCycle.contributions),
            selectinload(SusuGroup.owner),
        )
        .where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    owner_phone = group.owner.phone if group.owner else None
    if not owner_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No phone number on your account. Add one in your profile to receive standings.",
        )

    cycles_sorted = sorted(group.cycles, key=lambda c: c.cycle_number)
    standings = []
    for m in group.members:
        paid = sum(
            1 for cycle in cycles_sorted
            if cycle.cycle_number <= group.current_cycle
            and any(c.member_id == m.id and c.paid for c in cycle.contributions)
        )
        standings.append((m.name, m.total_contributed, paid, m.has_received_payout))
    standings.sort(key=lambda s: s[1], reverse=True)

    lines = [f"📊 {group.name} Standings — Cycle {group.current_cycle}/{group.total_cycles}", ""]
    for i, (name, total, paid_cycles, received) in enumerate(standings, 1):
        payout_flag = " 🏆" if received else ""
        lines.append(f"{i}. {name}: ${total:.2f} ({paid_cycles} paid){payout_flag}")

    lines += ["", f"Full standings: {settings.FRONTEND_URL}/s/{slug}/standings", "Powered by ChipIn 🤝"]

    message = "\n".join(lines)
    try:
        from app.workers.tasks import _send_whatsapp_text
        await _send_whatsapp_text(owner_phone, message)
    except Exception as exc:
        logger.warning("Failed to send standings WhatsApp: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send WhatsApp message")

    return {"sent": True}


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

    split_amount = None
    if body.is_split:
        split_amount = group.contribution_amount / 2

    member = SusuMember(
        group_id=group.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        payout_position=body.payout_position,
        slots=body.slots,
        is_split=body.is_split,
        split_partner_name=body.split_partner_name if body.is_split else None,
        split_partner_phone=body.split_partner_phone if body.is_split else None,
        split_amount=split_amount,
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

    # Feature 1: calculate total slots and pot amount based on slots
    total_slots = sum(m.slots for m in members)
    pot_amount = sum(m.slots * group.contribution_amount for m in members)

    # Override total_cycles to equal total_slots so each slot gets a payout
    group.total_cycles = total_slots

    # Determine payout order — build a slot-expanded list for recipient assignment
    if group.payout_order == SusuPayoutOrder.random:
        random.shuffle(members)
        for i, m in enumerate(members, start=1):
            m.payout_position = i
        # Expand by slots for recipient assignment
        payout_slots: List[SusuMember] = []
        for m in members:
            payout_slots.extend([m] * m.slots)
    elif group.payout_order == SusuPayoutOrder.fixed:
        # Sort by payout_position (nulls go to end), then assign sequentially
        members_with_pos = sorted(members, key=lambda m: (m.payout_position is None, m.payout_position or 0))
        unassigned = [m for m in members_with_pos if m.payout_position is None]
        next_pos = max((m.payout_position or 0 for m in members if m.payout_position), default=0) + 1
        for m in unassigned:
            m.payout_position = next_pos
            next_pos += 1
        members = sorted(members, key=lambda m: m.payout_position or 999)
        # Expand by slots for recipient assignment
        payout_slots = []
        for m in members:
            payout_slots.extend([m] * m.slots)
    else:
        # bid or other — treat like fixed
        payout_slots = []
        for m in members:
            payout_slots.extend([m] * m.slots)

    cycle_records = []
    for cycle_num in range(1, group.total_cycles + 1):
        recipient = payout_slots[(cycle_num - 1) % total_slots]
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

    # Create contribution records for cycle 1 (each member contributes slots × base amount)
    cycle1 = cycle_records[0]
    for member in group.members:
        db.add(SusuContribution(
            cycle_id=cycle1.id,
            member_id=member.id,
            amount=member.slots * group.contribution_amount,
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

    member_result = await db.execute(select(SusuMember).where(SusuMember.id == member_id))
    member = member_result.scalar_one_or_none()

    if member and member.is_split:
        # For split: organiser "mark paid" marks BOTH halves at once.
        # Calculate how much still needs to be added (avoid double-counting already-confirmed halves).
        already_collected = (
            (member.split_amount if contrib.split_primary_paid else Decimal("0")) +
            (member.split_amount if contrib.split_partner_paid else Decimal("0"))
        )
        amount_to_add = contrib.amount - already_collected

        contrib.split_primary_paid = True
        contrib.split_partner_paid = True
        contrib.paid = True
        contrib.paid_via = body.paid_via
        contrib.paid_at = datetime.now(timezone.utc)
        contrib.pending_verification = False
        contrib.split_partner_pending_verification = False

        cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + amount_to_add
        if member:
            member.total_contributed += amount_to_add
    else:
        already_counted = contrib.pending_verification
        contrib.paid = True
        contrib.paid_via = body.paid_via
        contrib.paid_at = datetime.now(timezone.utc)
        contrib.pending_verification = False

        if not already_counted:
            cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + contrib.amount
            if member:
                member.total_contributed += contrib.amount

    # Auto-collect cycle if all contributions are fully paid
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
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/cycles/{cycle_number}/mark-paid-out
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/cycles/{cycle_number}/mark-paid-out", response_model=SusuCycleSummary)
async def mark_payout_sent(
    slug: str,
    cycle_number: int,
    body: MarkPayoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SusuGroup)
        .options(selectinload(SusuGroup.members))
        .where(SusuGroup.slug == slug)
    )
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
    cycle.payout_method = body.payout_method
    cycle.payout_reference = body.payout_reference

    # Mark recipient as having received payout
    recipient_result = await db.execute(select(SusuMember).where(SusuMember.id == cycle.recipient_member_id))
    recipient = recipient_result.scalar_one_or_none()
    if recipient:
        recipient.has_received_payout = True

    # Find next cycle due date for the summary message
    next_cycle_result = await db.execute(
        select(SusuCycle).where(
            SusuCycle.group_id == group.id,
            SusuCycle.cycle_number == cycle_number + 1,
        )
    )
    next_cycle = next_cycle_result.scalar_one_or_none()
    next_due_str = str(next_cycle.due_date) if next_cycle else "N/A"

    await db.commit()
    await db.refresh(cycle)

    # Get recipient name
    rname = recipient.name if recipient else "Unknown"
    pot = cycle.pot_amount
    currency = "$"

    # Feature 7: Personal payout receipt to recipient
    method_label = body.payout_method.capitalize() if body.payout_method else "transfer"
    ref_part = f" (ref: {body.payout_reference})" if body.payout_reference else ""
    if recipient and recipient.phone:
        receipt_msg = (
            f"Hi {rname}! Your Susu payout of {currency}{pot:.2f} from '{group.name}' "
            f"has been sent via {method_label}{ref_part}. Enjoy!"
        )
        try:
            from app.workers.tasks import _send_whatsapp_text
            await _send_whatsapp_text(recipient.phone, receipt_msg)
        except Exception as exc:
            logger.warning("Failed to send payout receipt WhatsApp to %s: %s", recipient.phone, exc)

    # Feature 6: Cycle summary to all members
    summary_msg = (
        f"Cycle {cycle_number} complete! {rname} received {currency}{pot:.2f} via {method_label}. "
        f"Next cycle due {next_due_str}. Keep it up!"
    )
    for member in group.members:
        if member.phone and member.id != (recipient.id if recipient else None):
            try:
                from app.workers.tasks import _send_whatsapp_text
                await _send_whatsapp_text(member.phone, summary_msg)
            except Exception as exc:
                logger.warning("Failed to send cycle summary WhatsApp to %s: %s", member.phone, exc)

    return SusuCycleSummary(
        id=cycle.id,
        cycle_number=cycle.cycle_number,
        due_date=cycle.due_date,
        pot_amount=cycle.pot_amount,
        collected_amount=cycle.collected_amount,
        recipient_member_id=cycle.recipient_member_id,
        recipient_name=rname,
        payout_sent_at=cycle.payout_sent_at,
        payout_method=cycle.payout_method,
        payout_reference=cycle.payout_reference,
        status=cycle.status,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-missed
# Feature 4: Mark a contribution as missed
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-missed", response_model=SusuContributionResponse)
async def mark_contribution_missed(
    slug: str,
    cycle_number: int,
    member_id: uuid.UUID,
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

    contrib.missed = True
    contrib.paid = False

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
        missed=contrib.missed,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/advance — move to the next cycle
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/advance", response_model=SusuDetailResponse)
async def advance_cycle(
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
    if group.status != SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group is not active")

    # Verify current cycle is paid out
    cycle_result = await db.execute(
        select(SusuCycle).where(
            SusuCycle.group_id == group.id,
            SusuCycle.cycle_number == group.current_cycle,
        )
    )
    current_cycle = cycle_result.scalar_one_or_none()
    if not current_cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Current cycle not found")
    if current_cycle.status != SusuCycleStatus.paid_out:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current cycle must be fully paid out before advancing",
        )

    next_cycle_number = group.current_cycle + 1

    # All cycles done → complete the group
    if next_cycle_number > group.total_cycles:
        group.status = SusuStatus.completed
        group.next_contribution_date = None
        group.next_payout_date = None
        await db.commit()
        group = await _get_group_or_404(slug, db)
        return _build_detail(group)

    # Find the next cycle record
    next_cycle_result = await db.execute(
        select(SusuCycle).where(
            SusuCycle.group_id == group.id,
            SusuCycle.cycle_number == next_cycle_number,
        )
    )
    next_cycle = next_cycle_result.scalar_one_or_none()
    if not next_cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Next cycle record not found")

    # Create contribution records for next cycle if they don't exist yet
    existing_contribs = await db.execute(
        select(SusuContribution).where(SusuContribution.cycle_id == next_cycle.id)
    )
    if not existing_contribs.scalars().first():
        for member in group.members:
            db.add(SusuContribution(
                cycle_id=next_cycle.id,
                member_id=member.id,
                amount=member.slots * group.contribution_amount,  # Feature 1: slots
            ))

    group.current_cycle = next_cycle_number
    group.next_contribution_date = next_cycle.due_date
    group.next_payout_date = next_cycle.due_date

    await db.commit()
    group = await _get_group_or_404(slug, db)
    return _build_detail(group)


# ---------------------------------------------------------------------------
# GET /susu/{slug}/history — per-member contribution history across all cycles
# ---------------------------------------------------------------------------

@router.get("/susu/{slug}/history")
async def susu_member_history(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await _get_group_or_404(slug, db)
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    # Build member map
    members = sorted(group.members, key=lambda m: m.payout_position or 999)

    # Build cycle × member payment matrix
    # cycles are already loaded via selectinload
    cycles_sorted = sorted(group.cycles, key=lambda c: c.cycle_number)

    # contrib lookup: (cycle_id, member_id) → contribution
    contrib_lookup: dict[tuple, SusuContribution] = {}
    for cycle in cycles_sorted:
        for c in cycle.contributions:
            contrib_lookup[(cycle.id, c.member_id)] = c

    rows = []
    for m in members:
        paid_cycles = []
        # Feature 3: reliability score — cycles due so far vs paid on time
        due_so_far = 0
        paid_on_time = 0
        for cycle in cycles_sorted:
            contrib = contrib_lookup.get((cycle.id, m.id))
            is_due = cycle.cycle_number <= group.current_cycle
            c_paid = contrib.paid if contrib else False
            c_missed = contrib.missed if contrib else False
            paid_cycles.append({
                "cycle_number": cycle.cycle_number,
                "paid": c_paid,
                "missed": c_missed,
                "paid_via": contrib.paid_via.value if contrib and contrib.paid_via else None,
            })
            if is_due:
                due_so_far += 1
                if c_paid:
                    paid_on_time += 1
        reliability_pct = round((paid_on_time / due_so_far) * 100) if due_so_far > 0 else None
        rows.append({
            "member_id": str(m.id),
            "member_name": m.name,
            "payout_position": m.payout_position,
            "total_contributed": str(m.total_contributed),
            "reliability_pct": reliability_pct,
            "cycles": paid_cycles,
        })

    return {
        "total_cycles": group.total_cycles,
        "current_cycle": group.current_cycle,
        "members": rows,
    }


# ---------------------------------------------------------------------------
# GET /susu/{slug}/export — CSV export of all contributions (Feature 9)
# ---------------------------------------------------------------------------

@router.get("/susu/{slug}/export")
async def export_susu_csv(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = await _get_group_or_404(slug, db)
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    cycles_sorted = sorted(group.cycles, key=lambda c: c.cycle_number)
    member_map = {m.id: m for m in group.members}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Cycle #", "Due Date", "Member Name", "Phone",
        "Amount", "Paid", "Paid Via", "Paid At", "Missed",
    ])

    for cycle in cycles_sorted:
        for contrib in cycle.contributions:
            member = member_map.get(contrib.member_id)
            writer.writerow([
                cycle.cycle_number,
                str(cycle.due_date),
                member.name if member else "Unknown",
                member.phone if member else "",
                str(contrib.amount),
                "Yes" if contrib.paid else "No",
                contrib.paid_via.value if contrib.paid_via else "",
                contrib.paid_at.strftime("%Y-%m-%d %H:%M") if contrib.paid_at else "",
                "Yes" if contrib.missed else "No",
            ])

    today_str = date.today().isoformat()
    safe_name = re.sub(r"[^\w\s-]", "", group.name).strip().replace(" ", "-")
    filename = f"susu-{safe_name}-{today_str}.csv"

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# GET /susu/{slug}/join-requests — list join requests (organizer only)
# ---------------------------------------------------------------------------

@router.get("/susu/{slug}/join-requests", response_model=List[SusuJoinRequestResponse])
async def list_join_requests(
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

    requests_result = await db.execute(
        select(SusuJoinRequest)
        .where(SusuJoinRequest.group_id == group.id)
        .order_by(SusuJoinRequest.created_at.desc())
    )
    return requests_result.scalars().all()


# ---------------------------------------------------------------------------
# POST /susu/{slug}/join-requests/{request_id}/approve
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/join-requests/{request_id}/approve", response_model=SusuJoinRequestResponse)
async def approve_join_request(
    slug: str,
    request_id: uuid.UUID,
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
    if group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only approve join requests while group is forming")

    req_result = await db.execute(
        select(SusuJoinRequest).where(SusuJoinRequest.id == request_id, SusuJoinRequest.group_id == group.id)
    )
    join_req = req_result.scalar_one_or_none()
    if not join_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join request not found")
    if join_req.status != SusuJoinRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already processed")

    existing_phones = {m.phone for m in group.members}
    if join_req.phone in existing_phones:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member with this phone already exists in group")

    member = SusuMember(
        group_id=group.id,
        name=join_req.name,
        phone=join_req.phone,
        email=join_req.email,
    )
    db.add(member)
    group.total_members += 1
    join_req.status = SusuJoinRequestStatus.approved
    await db.commit()
    await db.refresh(join_req)
    return join_req


# ---------------------------------------------------------------------------
# POST /susu/{slug}/join-requests/{request_id}/reject
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/join-requests/{request_id}/reject", response_model=SusuJoinRequestResponse)
async def reject_join_request(
    slug: str,
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group or group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    req_result = await db.execute(
        select(SusuJoinRequest).where(SusuJoinRequest.id == request_id, SusuJoinRequest.group_id == group.id)
    )
    join_req = req_result.scalar_one_or_none()
    if not join_req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join request not found")
    if join_req.status != SusuJoinRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already processed")

    join_req.status = SusuJoinRequestStatus.rejected
    await db.commit()
    await db.refresh(join_req)
    return join_req


# ---------------------------------------------------------------------------
# PATCH /susu/{slug}/settings — update payment method settings (organizer)
# ---------------------------------------------------------------------------

@router.patch("/susu/{slug}/settings", response_model=SusuGroupResponse)
async def update_susu_settings(
    slug: str,
    body: SusuPaymentSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(group, k, v)

    # Ensure at least one payment method is enabled
    if not group.allow_card and not group.allow_cashapp and not group.allow_zelle:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one payment method must be enabled")

    await db.commit()
    await db.refresh(group)
    return group


# ---------------------------------------------------------------------------
# GET /s/{slug}/pay/{member_id} — public payment page info
# ---------------------------------------------------------------------------

@public_router.get("/s/{slug}/pay/{member_id}", response_model=SusuPayPageInfo)
async def get_susu_pay_info(
    slug: str,
    member_id: uuid.UUID,
    partner: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.status != SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group is not currently active")

    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    cycle_result = await db.execute(
        select(SusuCycle).where(SusuCycle.group_id == group.id, SusuCycle.cycle_number == group.current_cycle)
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

    if partner and member.is_split:
        # Partner's view: show split_amount, check partner-specific fields
        display_name = member.split_partner_name or "Partner"
        partner_name = member.name  # from partner's perspective, partner_name is the primary
        amount = member.split_amount or (group.contribution_amount / 2)
        already_paid = contrib.split_partner_paid if contrib else False
        pending_verification = contrib.split_partner_pending_verification if contrib else False
        pending_paid_via = (
            contrib.split_partner_paid_via.value
            if contrib and contrib.split_partner_pending_verification and contrib.split_partner_paid_via
            else None
        )
    else:
        display_name = member.name
        partner_name = member.split_partner_name if member.is_split else None
        amount = (member.split_amount or (group.contribution_amount / 2)) if member.is_split else (
            contrib.amount if contrib else member.slots * group.contribution_amount
        )
        already_paid = contrib.split_primary_paid if (contrib and member.is_split) else (contrib.paid if contrib else False)
        pending_verification = contrib.pending_verification if contrib else False
        pending_paid_via = (
            contrib.paid_via.value if contrib and contrib.pending_verification and contrib.paid_via else None
        )

    return SusuPayPageInfo(
        group_name=group.name,
        slug=group.slug,
        member_id=str(member.id),
        member_name=display_name,
        cycle_number=group.current_cycle,
        amount=amount,
        already_paid=already_paid,
        pending_verification=pending_verification,
        pending_paid_via=pending_paid_via,
        allow_card=group.allow_card,
        allow_cashapp=group.allow_cashapp,
        allow_zelle=group.allow_zelle,
        cashapp_handle=group.cashapp_handle,
        zelle_handle=group.zelle_handle,
        is_split=member.is_split,
        split_partner_name=partner_name,
        is_partner_view=partner and member.is_split,
    )


# ---------------------------------------------------------------------------
# POST /s/{slug}/pay/{member_id}/stripe — public Stripe checkout per member
# ---------------------------------------------------------------------------

@public_router.post("/s/{slug}/pay/{member_id}/stripe", response_model=SusuCheckoutResponse, status_code=status.HTTP_201_CREATED)
async def susu_member_stripe_pay(
    slug: str,
    member_id: uuid.UUID,
    partner: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SusuGroup).options(selectinload(SusuGroup.owner)).where(SusuGroup.slug == slug)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.status != SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group is not currently active")
    if not group.allow_card:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Card payments are not enabled for this group")

    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    cycle_result = await db.execute(
        select(SusuCycle).where(SusuCycle.group_id == group.id, SusuCycle.cycle_number == group.current_cycle)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contribution record for this member")
    if partner and member.is_split:
        if contrib.split_partner_paid:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner already paid for this cycle")
        amount_cents = int((member.split_amount or group.contribution_amount / 2) * 100)
        payer_name = member.split_partner_name or "Partner"
        success_url = f"{settings.FRONTEND_URL}/s/{slug}/pay/{member_id}?partner=1&paid=1"
        cancel_url = f"{settings.FRONTEND_URL}/s/{slug}/pay/{member_id}?partner=1"
        is_partner_payment = True
    else:
        already_paid = contrib.split_primary_paid if member.is_split else contrib.paid
        if already_paid:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already paid for this cycle")
        amount_cents = int((member.split_amount or member.slots * group.contribution_amount) * 100) if member.is_split else int(member.slots * group.contribution_amount * 100)
        payer_name = member.name
        success_url = f"{settings.FRONTEND_URL}/s/{slug}/pay/{member_id}?paid=1"
        cancel_url = f"{settings.FRONTEND_URL}/s/{slug}/pay/{member_id}"
        is_partner_payment = False

    session_params: dict = {
        "mode": "payment",
        "line_items": [{
            "price_data": {
                "currency": "usd",
                "unit_amount": amount_cents,
                "product_data": {
                    "name": f"{group.name} — Cycle {group.current_cycle} contribution",
                    "description": f"Susu contribution for {payer_name}",
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
            "susu_is_partner": "1" if is_partner_payment else "0",
        },
    }
    if member.email:
        session_params["customer_email"] = member.email

    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, **session_params)
    except stripe.StripeError as exc:
        logger.error("Stripe error for susu %s member %s: %s", slug, member_id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Payment provider error")

    contrib.stripe_payment_intent_id = session.payment_intent
    await db.commit()

    return SusuCheckoutResponse(checkout_url=session.url)


# ---------------------------------------------------------------------------
# POST /s/{slug}/pay/{member_id}/offline — public offline payment notification
# ---------------------------------------------------------------------------

@public_router.post("/s/{slug}/pay/{member_id}/offline")
async def susu_member_offline_pay(
    slug: str,
    member_id: uuid.UUID,
    body: SusuOfflinePayRequest,
    partner: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.status != SusuStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group is not currently active")

    if body.paid_via == SusuPaidVia.cashapp and not group.allow_cashapp:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CashApp payments are not enabled for this group")
    if body.paid_via == SusuPaidVia.zelle and not group.allow_zelle:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Zelle payments are not enabled for this group")

    member_result = await db.execute(
        select(SusuMember).where(SusuMember.id == member_id, SusuMember.group_id == group.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    cycle_result = await db.execute(
        select(SusuCycle).where(SusuCycle.group_id == group.id, SusuCycle.cycle_number == group.current_cycle)
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contribution record for this member")

    if partner and member.is_split:
        if contrib.split_partner_paid:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner already paid for this cycle")
        if contrib.split_partner_pending_verification:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner payment already submitted and awaiting organiser confirmation")
        display_amount = str(member.split_amount or group.contribution_amount / 2)
        contrib.split_partner_pending_verification = True
        contrib.split_partner_paid_via = body.paid_via
        contrib.split_partner_paid_at = datetime.now(timezone.utc)
        await db.commit()
        return {"pending_verification": True, "amount": display_amount, "paid_via": body.paid_via.value}

    # Primary payment
    primary_already_paid = contrib.split_primary_paid if member.is_split else contrib.paid
    if primary_already_paid:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already paid for this cycle")
    if contrib.pending_verification:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment already submitted and awaiting organiser confirmation")

    contrib.pending_verification = True
    contrib.paid_via = body.paid_via
    contrib.paid_at = datetime.now(timezone.utc)

    display_amount = str(member.split_amount or group.contribution_amount / 2) if member.is_split else str(contrib.amount)
    await db.commit()
    return {"pending_verification": True, "amount": display_amount, "paid_via": body.paid_via.value}


# ---------------------------------------------------------------------------
# POST /susu/{slug}/contributions/{contribution_id}/confirm — organizer confirms offline payment
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/contributions/{contribution_id}/confirm", response_model=SusuContributionResponse)
async def confirm_offline_payment(
    slug: str,
    contribution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    contrib_result = await db.execute(
        select(SusuContribution)
        .options(selectinload(SusuContribution.member), selectinload(SusuContribution.cycle))
        .where(SusuContribution.id == contribution_id)
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib or contrib.cycle.group_id != group.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found")
    if not contrib.pending_verification:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contribution is not pending verification")

    contrib.pending_verification = False
    if not contrib.paid_at:
        contrib.paid_at = datetime.now(timezone.utc)

    member_result = await db.execute(select(SusuMember).where(SusuMember.id == contrib.member_id))
    member = member_result.scalar_one_or_none()

    if member and member.is_split:
        # Confirm primary's half only; mark fully paid only when partner also confirmed
        contrib.split_primary_paid = True
        contrib.cycle.collected_amount = (contrib.cycle.collected_amount or Decimal("0")) + member.split_amount
        member.total_contributed += member.split_amount
        if contrib.split_partner_paid:
            contrib.paid = True
    else:
        contrib.paid = True
        contrib.cycle.collected_amount = (contrib.cycle.collected_amount or Decimal("0")) + contrib.amount
        if member:
            member.total_contributed += contrib.amount

    all_contribs_result = await db.execute(
        select(SusuContribution).where(SusuContribution.cycle_id == contrib.cycle_id, SusuContribution.paid == False)
    )
    if not all_contribs_result.scalars().first():
        contrib.cycle.status = SusuCycleStatus.collected

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
        missed=contrib.missed,
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/contributions/{contribution_id}/reject — organizer rejects offline payment
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/contributions/{contribution_id}/reject", response_model=SusuContributionResponse)
async def reject_offline_payment(
    slug: str,
    contribution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    contrib_result = await db.execute(
        select(SusuContribution)
        .options(selectinload(SusuContribution.member), selectinload(SusuContribution.cycle))
        .where(SusuContribution.id == contribution_id)
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib or contrib.cycle.group_id != group.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found")
    if not contrib.pending_verification:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Contribution is not pending verification")

    contrib.pending_verification = False
    contrib.paid_via = None
    contrib.paid_at = None

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
        missed=contrib.missed,
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/contributions/{contribution_id}/confirm-partner — organizer confirms partner's offline payment
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/contributions/{contribution_id}/confirm-partner", response_model=SusuContributionResponse)
async def confirm_partner_payment(
    slug: str,
    contribution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    contrib_result = await db.execute(
        select(SusuContribution)
        .options(selectinload(SusuContribution.member), selectinload(SusuContribution.cycle))
        .where(SusuContribution.id == contribution_id)
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib or contrib.cycle.group_id != group.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found")
    if not contrib.split_partner_pending_verification:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner payment is not pending verification")

    member_result = await db.execute(select(SusuMember).where(SusuMember.id == contrib.member_id))
    member = member_result.scalar_one_or_none()
    if not member or not member.is_split:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member is not a split hand")

    contrib.split_partner_paid = True
    contrib.split_partner_pending_verification = False
    if not contrib.split_partner_paid_at:
        contrib.split_partner_paid_at = datetime.now(timezone.utc)

    contrib.cycle.collected_amount = (contrib.cycle.collected_amount or Decimal("0")) + member.split_amount
    member.total_contributed += member.split_amount

    if contrib.split_primary_paid:
        contrib.paid = True

    all_contribs_result = await db.execute(
        select(SusuContribution).where(SusuContribution.cycle_id == contrib.cycle_id, SusuContribution.paid == False)
    )
    if not all_contribs_result.scalars().first():
        contrib.cycle.status = SusuCycleStatus.collected

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
        missed=contrib.missed,
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/contributions/{contribution_id}/reject-partner
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/contributions/{contribution_id}/reject-partner", response_model=SusuContributionResponse)
async def reject_partner_payment(
    slug: str,
    contribution_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorised")

    contrib_result = await db.execute(
        select(SusuContribution)
        .options(selectinload(SusuContribution.member), selectinload(SusuContribution.cycle))
        .where(SusuContribution.id == contribution_id)
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib or contrib.cycle.group_id != group.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution not found")
    if not contrib.split_partner_pending_verification:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Partner payment is not pending verification")

    contrib.split_partner_pending_verification = False
    contrib.split_partner_paid_via = None
    contrib.split_partner_paid_at = None

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
        missed=contrib.missed,
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
    )


# ---------------------------------------------------------------------------
# POST /susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-partner-paid
# ---------------------------------------------------------------------------

@router.post("/susu/{slug}/cycles/{cycle_number}/members/{member_id}/mark-partner-paid", response_model=SusuContributionResponse)
async def mark_partner_paid(
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contribution record not found")

    member_result = await db.execute(select(SusuMember).where(SusuMember.id == member_id))
    member = member_result.scalar_one_or_none()
    if not member or not member.is_split:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member is not a split hand")

    if not contrib.split_partner_paid:
        cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + member.split_amount
        member.total_contributed += member.split_amount

    contrib.split_partner_paid = True
    contrib.split_partner_paid_via = body.paid_via
    contrib.split_partner_paid_at = datetime.now(timezone.utc)
    contrib.split_partner_pending_verification = False

    if contrib.split_primary_paid:
        contrib.paid = True

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
        missed=contrib.missed,
        pending_verification=contrib.pending_verification,
        split_primary_paid=contrib.split_primary_paid,
        split_partner_paid=contrib.split_partner_paid,
        split_partner_paid_via=contrib.split_partner_paid_via,
        split_partner_pending_verification=contrib.split_partner_pending_verification,
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

    amount_cents = int(member.slots * group.contribution_amount * 100)  # Feature 1: slots
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


# ---------------------------------------------------------------------------
# GET /s/{slug}/standings — public standings page
# ---------------------------------------------------------------------------

@public_router.get("/s/{slug}/standings", response_model=SusuStandingsResponse)
async def public_susu_standings(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group_or_404(slug, db)

    cycles_sorted = sorted(group.cycles, key=lambda c: c.cycle_number)
    current_cycle_obj = next((c for c in cycles_sorted if c.cycle_number == group.current_cycle), None)
    standings = []
    for m in group.members:
        due_so_far = 0
        paid_cycles = 0
        for cycle in cycles_sorted:
            if cycle.cycle_number <= group.current_cycle:
                due_so_far += 1
                if any(c.member_id == m.id and c.paid for c in cycle.contributions):
                    paid_cycles += 1
        reliability_pct = round((paid_cycles / due_so_far) * 100) if due_so_far > 0 else None

        # Split: check current cycle payment status for each partner
        current_primary_paid = False
        current_partner_paid = False
        if current_cycle_obj:
            contrib = next((c for c in current_cycle_obj.contributions if c.member_id == m.id), None)
            if contrib:
                current_primary_paid = contrib.split_primary_paid if m.is_split else contrib.paid
                current_partner_paid = contrib.split_partner_paid if m.is_split else False

        standings.append(SusuMemberStanding(
            id=m.id,
            name=m.name,
            total_contributed=m.total_contributed,
            paid_cycles=paid_cycles,
            reliability_pct=reliability_pct,
            has_received_payout=m.has_received_payout,
            payout_position=m.payout_position,
            is_split=m.is_split,
            split_partner_name=m.split_partner_name,
            current_cycle_primary_paid=current_primary_paid,
            current_cycle_partner_paid=current_partner_paid,
        ))

    standings.sort(key=lambda s: s.total_contributed, reverse=True)

    return SusuStandingsResponse(
        id=group.id,
        name=group.name,
        slug=group.slug,
        status=group.status,
        current_cycle=group.current_cycle,
        total_cycles=group.total_cycles,
        contribution_amount=group.contribution_amount,
        frequency=group.frequency,
        total_members=group.total_members,
        members=standings,
    )


# ---------------------------------------------------------------------------
# POST /s/{slug}/join — public join request submission
# ---------------------------------------------------------------------------

@public_router.post("/s/{slug}/join", response_model=SusuJoinRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_join_request(
    slug: str,
    body: SusuJoinRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SusuGroup).where(SusuGroup.slug == slug))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Susu group not found")
    if group.status != SusuStatus.forming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This group is no longer accepting join requests")

    existing = await db.execute(
        select(SusuJoinRequest).where(
            SusuJoinRequest.group_id == group.id,
            SusuJoinRequest.phone == body.phone,
            SusuJoinRequest.status == SusuJoinRequestStatus.pending,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A pending request with this phone already exists")

    join_req = SusuJoinRequest(
        group_id=group.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        message=body.message,
    )
    db.add(join_req)
    await db.commit()
    await db.refresh(join_req)
    return join_req
