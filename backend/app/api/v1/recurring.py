"""
Recurring schedule CRUD + instance listing.
Mounted under /campaigns/{slug}/schedule and /campaigns/{slug}/instances.
Also /recurring for the dashboard view.
"""

import uuid
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.campaign import Campaign
from app.models.recurring import (
    InstanceStatus,
    RecurringInstance,
    RecurringSchedule,
    compute_initial_due_date,
    compute_next_due_date,
    schedule_next_run_at,
)
from app.models.user import User
from app.schemas.recurring import (
    RecurringInstanceResponse,
    RecurringScheduleCreate,
    RecurringScheduleResponse,
    RecurringScheduleUpdate,
    RecurringScheduleWithCampaign,
)

router = APIRouter(tags=["recurring"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_campaign_or_404(slug: str, owner_id: uuid.UUID, db: AsyncSession) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.slug == slug, Campaign.owner_id == owner_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


async def _get_schedule_for_campaign(campaign_id: uuid.UUID, db: AsyncSession) -> Optional[RecurringSchedule]:
    result = await db.execute(
        select(RecurringSchedule).where(RecurringSchedule.campaign_id == campaign_id)
    )
    return result.scalar_one_or_none()


# ── Schedule CRUD ─────────────────────────────────────────────────────────────

@router.post(
    "/campaigns/{slug}/schedule",
    response_model=RecurringScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_schedule(
    slug: str,
    body: RecurringScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)

    existing = await _get_schedule_for_campaign(campaign.id, db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This campaign already has a recurring schedule. PATCH to update it.",
        )

    first_due = compute_initial_due_date(
        body.frequency, body.start_date, body.day_of_month, body.day_of_week
    )
    next_run = schedule_next_run_at(first_due, body.auto_create_days_before)

    schedule = RecurringSchedule(
        campaign_id=campaign.id,
        org_id=campaign.org_id,
        frequency=body.frequency,
        day_of_month=body.day_of_month,
        day_of_week=body.day_of_week,
        start_date=body.start_date,
        end_date=body.end_date,
        auto_create_days_before=body.auto_create_days_before,
        auto_remind_days_before=body.auto_remind_days_before,
        next_run_at=next_run,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.get("/campaigns/{slug}/schedule", response_model=Optional[RecurringScheduleResponse])
async def get_schedule(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    return await _get_schedule_for_campaign(campaign.id, db)


@router.patch("/campaigns/{slug}/schedule", response_model=RecurringScheduleResponse)
async def update_schedule(
    slug: str,
    body: RecurringScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    schedule = await _get_schedule_for_campaign(campaign.id, db)
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No schedule found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)

    # Recalculate next_run_at if auto_create_days_before changed
    if body.auto_create_days_before is not None:
        current_due = schedule.next_run_at.date() + timedelta(days=schedule.auto_create_days_before)
        schedule.next_run_at = schedule_next_run_at(current_due, schedule.auto_create_days_before)

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/campaigns/{slug}/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    schedule = await _get_schedule_for_campaign(campaign.id, db)
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No schedule found")
    schedule.is_active = False
    await db.commit()


# ── Instance listing ──────────────────────────────────────────────────────────

@router.get(
    "/campaigns/{slug}/instances",
    response_model=list[RecurringInstanceResponse],
)
async def list_instances(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = await _get_campaign_or_404(slug, current_user.id, db)
    schedule = await _get_schedule_for_campaign(campaign.id, db)
    if not schedule:
        return []

    result = await db.execute(
        select(RecurringInstance)
        .where(RecurringInstance.schedule_id == schedule.id)
        .order_by(RecurringInstance.due_date.desc())
    )
    return result.scalars().all()


# ── Recurring dashboard ───────────────────────────────────────────────────────

@router.get("/recurring", response_model=list[RecurringScheduleWithCampaign])
async def list_all_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All recurring schedules across all campaigns owned by the user."""
    result = await db.execute(
        select(RecurringSchedule)
        .join(Campaign, Campaign.id == RecurringSchedule.campaign_id)
        .where(Campaign.owner_id == current_user.id)
        .options(
            selectinload(RecurringSchedule.campaign),
            selectinload(RecurringSchedule.instances),
        )
        .order_by(RecurringSchedule.next_run_at.asc())
    )
    schedules = result.scalars().all()

    out = []
    for s in schedules:
        c = s.campaign
        recent = sorted(s.instances, key=lambda i: i.due_date, reverse=True)[:5]
        out.append(
            RecurringScheduleWithCampaign(
                id=s.id,
                campaign_id=s.campaign_id,
                campaign_slug=c.slug,
                campaign_title=c.title,
                campaign_emoji=c.emoji,
                frequency=s.frequency,
                day_of_month=s.day_of_month,
                day_of_week=s.day_of_week,
                start_date=s.start_date,
                end_date=s.end_date,
                auto_create_days_before=s.auto_create_days_before,
                auto_remind_days_before=s.auto_remind_days_before,
                is_active=s.is_active,
                last_run_at=s.last_run_at,
                next_run_at=s.next_run_at,
                recent_instances=[RecurringInstanceResponse.model_validate(i) for i in recent],
            )
        )
    return out
