import json
import logging
import uuid
from decimal import Decimal
from typing import Optional

import httpx
from arq.connections import RedisSettings
from sqlalchemy import func, select
from sqlalchemy import nullslast

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, VisibilityMode
from app.models.contributor import Contributor
from app.models.user import User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# WhatsApp helpers
# ---------------------------------------------------------------------------

async def _send_whatsapp(phone: str, message: str) -> None:
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
            logger.warning("WhatsApp send failed to %s: %s", phone, exc)


# ---------------------------------------------------------------------------
# ARQ tasks
# ---------------------------------------------------------------------------

async def notify_organizer_whatsapp(ctx, *, organizer_phone: str, message: str) -> None:
    """Generic message to an organizer's WhatsApp number."""
    await _send_whatsapp(organizer_phone, message)


async def send_whatsapp_confirmation(ctx, *, contributor_id: Optional[str]) -> None:
    """Confirm a card payment to the contributor (if phone set)."""
    if not contributor_id:
        return

    async with AsyncSessionLocal() as db:
        contributor = await db.get(Contributor, uuid.UUID(contributor_id))
        if not contributor or not contributor.phone:
            return

        campaign = await db.get(Campaign, contributor.campaign_id)
        if not campaign:
            return

        display = "Anonymous" if contributor.is_anonymous else contributor.name
        amount_str = f"{campaign.currency} {contributor.amount:.2f}"
        await _send_whatsapp(
            contributor.phone,
            f"✅ Payment received! {amount_str} for '{campaign.title}'. Thank you, {display}!",
        )


async def broadcast_campaign_update(ctx, *, campaign_id: str) -> None:
    """Publish live stats to Redis SSE channel and optionally notify the organizer via WhatsApp."""
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
        total = total_result.scalar_one_or_none() or Decimal("0")

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

        if latest:
            if latest.is_anonymous:
                latest_payer: Optional[str] = "Anonymous"
            elif campaign.visibility_mode == VisibilityMode.full_name:
                latest_payer = latest.name
            elif campaign.visibility_mode == VisibilityMode.first_name_only:
                latest_payer = latest.name.split()[0]
            else:
                latest_payer = "Anonymous"
        else:
            latest_payer = None

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

        if campaign.whatsapp_reminders_enabled:
            owner = await db.get(User, campaign.owner_id)
            if owner and owner.phone:
                await _send_whatsapp(
                    owner.phone,
                    (
                        f"💰 New card payment on '{campaign.title}'! "
                        f"{paid_count} paid — total raised: {campaign.currency} {total:.2f} "
                        f"/ {campaign.currency} {campaign.goal_amount:.2f}"
                    ),
                )


# ---------------------------------------------------------------------------
# Worker settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    functions = [
        notify_organizer_whatsapp,
        send_whatsapp_confirmation,
        broadcast_campaign_update,
    ]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 30
