"""
Daily cron: process campaign due dates.

- Auto-complete active campaigns whose due_date has passed
- Send escalating WhatsApp reminders at 7 / 3 / 1 days before due
"""
import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.user import User

logger = logging.getLogger(__name__)

_ESCALATION_DAYS = [7, 3, 1]


async def _send_whatsapp_text(phone: str, message: str) -> None:
    from app.core.config import settings
    import httpx
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        return
    url = f"https://graph.facebook.com/v18.0/{settings.META_PHONE_NUMBER_ID}/messages"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(
                url,
                json={"messaging_product": "whatsapp", "to": phone, "type": "text",
                      "text": {"body": message}},
                headers={"Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}"},
            )
        except Exception as exc:
            logger.warning("WhatsApp send failed to %s: %s", phone, exc)


async def process_campaign_deadlines(ctx: dict) -> None:
    """
    Runs once daily (08:00). Two actions:

    1. Auto-complete: active campaigns where due_date < today → status = completed
    2. Escalating reminders: send WhatsApp blast to unpaid contributors
       at 7, 3, and 1 day(s) before due_date.
    """
    today = date.today()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Campaign).where(
                Campaign.status == CampaignStatus.active,
                Campaign.due_date.isnot(None),
            )
        )
        campaigns = result.scalars().all()

    logger.info("process_campaign_deadlines: checking %d campaigns with due dates", len(campaigns))

    for campaign in campaigns:
        days_left = (campaign.due_date - today).days

        # ── Auto-complete past-due campaigns ──────────────────────────────
        if days_left < 0:
            async with AsyncSessionLocal() as db:
                c = await db.get(Campaign, campaign.id)
                if c and c.status == CampaignStatus.active:
                    c.status = CampaignStatus.completed
                    await db.commit()
                    logger.info("Auto-completed campaign %s (due %s)", c.slug, c.due_date)

                    # Notify organiser
                    owner = await db.get(User, c.owner_id)
                    if owner and owner.phone:
                        await _send_whatsapp_text(
                            owner.phone,
                            f"📋 Your campaign \"{c.title}\" has been automatically completed "
                            f"— its payment deadline ({c.due_date}) has passed.",
                        )
            continue

        # ── Escalating reminders ─────────────────────────────────────────
        if days_left not in _ESCALATION_DAYS:
            continue

        async with AsyncSessionLocal() as db:
            unpaid_result = await db.execute(
                select(Contributor).where(
                    Contributor.campaign_id == campaign.id,
                    Contributor.paid.is_(False),
                    Contributor.phone.isnot(None),
                )
            )
            unpaid = unpaid_result.scalars().all()

            owner_result = await db.get(User, campaign.owner_id)
            owner_phone = owner_result.phone if owner_result else None

        if not unpaid:
            continue

        if days_left == 1:
            urgency = "⚠️ FINAL REMINDER — due tomorrow!"
        elif days_left == 3:
            urgency = "⏰ Reminder — due in 3 days."
        else:
            urgency = f"📅 Heads up — due in {days_left} days."

        logger.info(
            "Sending %d deadline reminders for %s (due in %d days)",
            len(unpaid), campaign.slug, days_left,
        )

        arq = ctx["redis"]
        for contributor in unpaid:
            await arq.enqueue_job(
                "send_payment_reminder",
                contributor_id=str(contributor.id),
                _job_id=f"deadline-reminder-{contributor.id}-{today}-{days_left}d",
            )

        # Also notify the organiser
        if owner_phone:
            await _send_whatsapp_text(
                owner_phone,
                f"{urgency} \"{campaign.title}\" has {len(unpaid)} unpaid contributor(s). "
                f"Deadline: {campaign.due_date}.",
            )
