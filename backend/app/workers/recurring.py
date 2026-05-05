"""
ARQ cron tasks for recurring collection schedules.

process_recurring_schedules — daily 08:00 UTC
  Creates new campaign instances for schedules that are due.

send_recurring_reminders — daily 09:00 UTC
  Sends WhatsApp reminder blasts for instances due soon.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from slugify import slugify
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.org import OrgMember
from app.models.recurring import (
    Frequency,
    InstanceStatus,
    RecurringInstance,
    RecurringSchedule,
    compute_next_due_date,
    schedule_next_run_at,
)

logger = logging.getLogger(__name__)

_DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_FREQ_LABELS = {
    Frequency.weekly: "weekly",
    Frequency.biweekly: "biweekly",
    Frequency.monthly: "monthly",
    Frequency.quarterly: "quarterly",
    Frequency.annual: "annual",
}


async def _make_slug(title: str, db) -> str:
    base = slugify(title)
    slug, counter = base, 1
    while True:
        hit = await db.execute(select(Campaign).where(Campaign.slug == slug))
        if not hit.scalar_one_or_none():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


async def process_recurring_schedules(ctx: dict) -> None:
    """Daily 08:00 UTC — create campaign instances for due schedules."""
    now = datetime.now(timezone.utc)
    today = now.date()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RecurringSchedule)
            .where(
                RecurringSchedule.is_active.is_(True),
                RecurringSchedule.next_run_at <= now,
            )
            .options(
                selectinload(RecurringSchedule.campaign),
                selectinload(RecurringSchedule.org),
            )
        )
        schedules = result.scalars().all()

        for schedule in schedules:
            try:
                # Deactivate if past end_date
                if schedule.end_date and today > schedule.end_date:
                    schedule.is_active = False
                    logger.info("Deactivated expired schedule %s", schedule.id)
                    continue

                template = schedule.campaign
                due_date = (schedule.next_run_at + timedelta(
                    days=schedule.auto_create_days_before
                )).date()

                # Build title with period label
                month_label = due_date.strftime("%B %Y")
                new_title = f"{template.title} - {month_label}"

                new_slug = await _make_slug(new_title, db)

                # Create campaign clone
                new_campaign = Campaign(
                    title=new_title,
                    slug=new_slug,
                    description=template.description,
                    emoji=template.emoji,
                    campaign_type=template.campaign_type,
                    goal_amount=template.goal_amount,
                    amount_per_person=template.amount_per_person,
                    currency=template.currency,
                    visibility_mode=template.visibility_mode,
                    allow_anonymous_contributions=template.allow_anonymous_contributions,
                    whatsapp_reminders_enabled=template.whatsapp_reminders_enabled,
                    owner_id=template.owner_id,
                    org_id=schedule.org_id or template.org_id,
                    status=CampaignStatus.active,
                )
                db.add(new_campaign)
                await db.flush()

                # Copy contributors from org or template
                if schedule.org_id:
                    members_result = await db.execute(
                        select(OrgMember).where(
                            OrgMember.org_id == schedule.org_id,
                            OrgMember.is_active.is_(True),
                        )
                    )
                    for m in members_result.scalars().all():
                        db.add(Contributor(
                            campaign_id=new_campaign.id,
                            name=m.name,
                            phone=m.phone,
                            email=m.email,
                            amount=template.amount_per_person or 0,
                            added_by_organizer=True,
                        ))
                else:
                    contribs_result = await db.execute(
                        select(Contributor).where(Contributor.campaign_id == template.id)
                    )
                    for c in contribs_result.scalars().all():
                        db.add(Contributor(
                            campaign_id=new_campaign.id,
                            name=c.name,
                            phone=c.phone,
                            email=c.email,
                            amount=c.amount,
                            added_by_organizer=True,
                        ))

                # Create instance record
                instance = RecurringInstance(
                    schedule_id=schedule.id,
                    campaign_id=new_campaign.id,
                    due_date=due_date,
                    status=InstanceStatus.active,
                )
                db.add(instance)

                # Advance schedule
                schedule.last_run_at = now
                next_due = compute_next_due_date(
                    schedule.frequency, due_date,
                    schedule.day_of_month, schedule.day_of_week,
                )
                schedule.next_run_at = schedule_next_run_at(next_due, schedule.auto_create_days_before)

                # Notify organizer via WhatsApp (non-blocking)
                from app.core.config import settings
                if settings.META_WHATSAPP_TOKEN and template.whatsapp_reminders_enabled:
                    from app.workers.tasks import _send_whatsapp_text
                    from app.models.user import User
                    owner = await db.get(User, template.owner_id)
                    if owner and owner.phone:
                        freq_label = _FREQ_LABELS.get(schedule.frequency, "recurring")
                        campaign_url = f"{settings.FRONTEND_URL}/p/{new_slug}"
                        await _send_whatsapp_text(
                            owner.phone,
                            (
                                f"📅 New {freq_label} collection created: {new_title}.\n"
                                f"Due: {due_date.strftime('%b %d, %Y')}.\n"
                                f"Share: {campaign_url}"
                            ),
                        )

                logger.info(
                    "Created recurring instance campaign=%s due=%s next_run=%s",
                    new_slug, due_date, schedule.next_run_at,
                )

            except Exception as exc:
                logger.error("Failed to process schedule %s: %s", schedule.id, exc, exc_info=True)

        await db.commit()


async def send_recurring_reminders(ctx: dict) -> None:
    """Daily 09:00 UTC — blast WhatsApp reminders for instances due soon."""
    today = date.today()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RecurringInstance)
            .join(RecurringSchedule, RecurringSchedule.id == RecurringInstance.schedule_id)
            .where(
                RecurringInstance.status == InstanceStatus.active,
                RecurringSchedule.is_active.is_(True),
            )
            .options(selectinload(RecurringInstance.schedule))
        )
        instances = result.scalars().all()

        queued = 0
        for instance in instances:
            remind_date = instance.due_date - timedelta(
                days=instance.schedule.auto_remind_days_before
            )
            if remind_date == today:
                await ctx["redis"].enqueue_job(
                    "send_reminder_blast", campaign_id=str(instance.campaign_id)
                )
                queued += 1

    logger.info("send_recurring_reminders: queued %d reminder blasts", queued)
