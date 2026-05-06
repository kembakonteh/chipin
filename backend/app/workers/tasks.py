import json
import logging
import uuid
from decimal import Decimal
from typing import Optional

import httpx
from arq.connections import RedisSettings
from arq.cron import cron as arq_cron
from sqlalchemy import func, select
from sqlalchemy import nullslast

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, VisibilityMode
from app.models.contributor import Contributor
from app.models.user import User
from app.workers.cards import generate_milestone_card
from app.workers.deadlines import process_campaign_deadlines
from app.workers.recurring import process_recurring_schedules, send_recurring_reminders
from app.workers.susu import process_susu_cycles
from app.workers.susu_reminders import send_susu_cycle_reminders
from app.workers.whatsapp import (
    check_campaign_completion,
    notify_payout_completion,
    send_payment_confirmation,
    send_payment_reminder,
    send_reminder_blast,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Legacy raw-text helper (kept for internal use only)
# ---------------------------------------------------------------------------

async def _send_whatsapp_text(phone: str, message: str) -> None:
    """Send a plain-text (non-template) WhatsApp message. Internal use only."""
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        return
    url = f"https://graph.facebook.com/v18.0/{settings.META_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message},
    }
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}"},
                timeout=10,
            )
            resp.raise_for_status()
        except Exception as exc:
            logger.warning("WhatsApp text send failed to %s: %s", phone, exc)


# ---------------------------------------------------------------------------
# notify_organizer_whatsapp (plain text — used for join notifications)
# ---------------------------------------------------------------------------

async def notify_organizer_whatsapp(ctx: dict, *, organizer_phone: str, message: str) -> None:
    """Generic plain-text notification to the organiser's WhatsApp number."""
    await _send_whatsapp_text(organizer_phone, message)


# ---------------------------------------------------------------------------
# broadcast_campaign_update — SSE publish + organiser WhatsApp text
# ---------------------------------------------------------------------------

async def broadcast_campaign_update(ctx: dict, *, campaign_id: str) -> None:
    """Publish live stats to the Redis SSE channel and notify the organiser."""
    async with AsyncSessionLocal() as db:
        campaign = await db.get(Campaign, uuid.UUID(campaign_id))
        if not campaign:
            return

        total_result = await db.execute(
            select(func.sum(Contributor.amount)).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        total: Decimal = total_result.scalar_one_or_none() or Decimal("0")

        paid_count_result = await db.execute(
            select(func.count()).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        paid_count = paid_count_result.scalar_one()

        contributor_count_result = await db.execute(
            select(func.count()).where(Contributor.campaign_id == campaign.id)
        )
        contributor_count = contributor_count_result.scalar_one()

        latest_result = await db.execute(
            select(Contributor)
            .where(Contributor.campaign_id == campaign.id, Contributor.paid.is_(True))
            .order_by(nullslast(Contributor.paid_at.desc()))
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()

        latest_payer: Optional[str] = None
        if latest:
            if latest.is_anonymous:
                latest_payer = "Anonymous"
            elif campaign.visibility_mode == VisibilityMode.full_name:
                latest_payer = latest.name
            elif campaign.visibility_mode == VisibilityMode.first_name_only:
                latest_payer = latest.name.split()[0]
            else:
                latest_payer = "Anonymous"

        goal = campaign.goal_amount
        progress_pct = round(min(float(total / goal) * 100, 100.0), 2) if goal > 0 else 0.0

        payload = json.dumps({
            "total_raised": str(total),
            "paid_count": paid_count,
            "contributor_count": contributor_count,
            "latest_payer_display_name": latest_payer,
            "progress_pct": progress_pct,
        })
        await ctx["redis"].publish(f"chipin:campaign:{campaign_id}", payload)

        # Milestone detection — fire card generation once per milestone per campaign
        for milestone in [25, 50, 75, 100]:
            if progress_pct >= milestone:
                flag_key = f"chipin:milestone:{campaign_id}:{milestone}"
                already_sent = await ctx["redis"].exists(flag_key)
                if not already_sent:
                    await ctx["redis"].set(flag_key, "1")
                    await ctx["redis"].enqueue_job(
                        "generate_milestone_card",
                        campaign_id=campaign_id,
                        milestone_pct=milestone,
                    )

        if campaign.whatsapp_reminders_enabled:
            owner = await db.get(User, campaign.owner_id)
            if owner and owner.phone:
                await _send_whatsapp_text(
                    owner.phone,
                    (
                        f"💰 New payment on '{campaign.title}'! "
                        f"{paid_count} paid — total: {campaign.currency} {total:.2f}"
                        f" / {campaign.currency} {campaign.goal_amount:.2f}"
                    ),
                )


# ---------------------------------------------------------------------------
# Worker settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    functions = [
        # Broadcast / organiser notifications
        notify_organizer_whatsapp,
        broadcast_campaign_update,
        # Template-based WhatsApp tasks (imported from whatsapp.py)
        send_payment_confirmation,
        send_payment_reminder,
        send_reminder_blast,
        check_campaign_completion,
        notify_payout_completion,
        # Viral growth cards
        generate_milestone_card,
        # Recurring collections
        process_recurring_schedules,
        send_recurring_reminders,
        # Susu / tontine
        process_susu_cycles,
        send_susu_cycle_reminders,  # Feature 2: WhatsApp reminders
        # Campaign deadlines
        process_campaign_deadlines,
    ]
    cron_jobs = [
        arq_cron(process_recurring_schedules, hour=8, minute=0),
        arq_cron(send_recurring_reminders, hour=9, minute=0),
        arq_cron(process_susu_cycles, hour=8, minute=30),
        arq_cron(send_susu_cycle_reminders, hour=8, minute=0),  # Feature 2
        arq_cron(process_campaign_deadlines, hour=8, minute=15),
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 60
