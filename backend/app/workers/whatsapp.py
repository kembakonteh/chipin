"""
ARQ tasks for WhatsApp template messaging via Meta Cloud API.

Templates must be pre-approved in Meta Business Manager before going live.
All functions are registered in WorkerSettings in tasks.py.
"""

import asyncio
import logging
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.payout import Payout, PayoutStatus
from app.models.user import User

logger = logging.getLogger(__name__)

_META_BASE = "https://graph.facebook.com/v18.0"
_BLAST_LIMIT = 50


# ---------------------------------------------------------------------------
# Core Meta Cloud API helper
# ---------------------------------------------------------------------------

async def _send_template(
    phone: str,
    template_name: str,
    params: list[str],
    language: str = "en_US",
) -> bool:
    """
    POST a template message to the Meta Cloud API.
    Returns True on a 2xx response, False on any error (logged, not raised).
    """
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        logger.warning(
            "WhatsApp credentials not configured — skipping %s to %s",
            template_name, phone,
        )
        return False

    url = f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages"
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": str(p)} for p in params],
                }
            ],
        },
    }
    headers = {
        "Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.error(
                    "Meta API %s → %s (%s): %s",
                    template_name, phone, resp.status_code, resp.text,
                )
                return False
            logger.info("WhatsApp template '%s' sent to %s", template_name, phone)
            return True
        except httpx.TimeoutException:
            logger.warning("WhatsApp send timed out (%s → %s)", template_name, phone)
        except Exception as exc:
            logger.warning("WhatsApp send failed (%s → %s): %s", template_name, phone, exc)
        return False


# ---------------------------------------------------------------------------
# Task 1 — Payment confirmation
# ---------------------------------------------------------------------------

async def send_payment_confirmation(ctx: dict, *, contributor_id: str) -> None:
    """
    Send payment confirmation to the contributor.

    Templates:
      is_anonymous=False → chipin_payment_confirmed      [name, amount, title, public_url]
      is_anonymous=True  → chipin_payment_confirmed_private [name, amount, title]
    """
    async with AsyncSessionLocal() as db:
        contributor = await db.get(Contributor, uuid.UUID(contributor_id))
        if not contributor:
            logger.warning("send_payment_confirmation: contributor %s not found", contributor_id)
            return
        if not contributor.phone:
            logger.warning(
                "send_payment_confirmation: contributor %s has no phone, skipping",
                contributor_id,
            )
            return

        campaign = await db.get(Campaign, contributor.campaign_id)
        if not campaign:
            logger.warning(
                "send_payment_confirmation: campaign not found for contributor %s",
                contributor_id,
            )
            return

        amount_str = f"{contributor.amount:.2f}"
        public_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"

        if contributor.is_anonymous:
            await _send_template(
                phone=contributor.phone,
                template_name="chipin_payment_confirmed_private",
                params=[contributor.name, amount_str, campaign.title],
            )
        else:
            await _send_template(
                phone=contributor.phone,
                template_name="chipin_payment_confirmed",
                params=[contributor.name, amount_str, campaign.title, public_url],
            )


# ---------------------------------------------------------------------------
# Task 2 — Single payment reminder
# ---------------------------------------------------------------------------

async def send_payment_reminder(ctx: dict, *, contributor_id: str) -> None:
    """
    Send chipin_payment_reminder to one unpaid contributor.
    Skips silently if: already paid, no phone, reminders disabled.
    """
    async with AsyncSessionLocal() as db:
        contributor = await db.get(Contributor, uuid.UUID(contributor_id))
        if not contributor:
            logger.warning("send_payment_reminder: contributor %s not found", contributor_id)
            return
        if contributor.paid:
            logger.debug(
                "send_payment_reminder: contributor %s already paid, skipping", contributor_id
            )
            return
        if not contributor.phone:
            logger.warning(
                "send_payment_reminder: contributor %s has no phone, skipping", contributor_id
            )
            return

        campaign = await db.get(Campaign, contributor.campaign_id)
        if not campaign:
            return
        if not campaign.whatsapp_reminders_enabled:
            logger.debug(
                "send_payment_reminder: reminders disabled for campaign %s", campaign.id
            )
            return

        public_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"

        await _send_template(
            phone=contributor.phone,
            template_name="chipin_payment_reminder",
            params=[
                contributor.name,
                campaign.title,
                public_url,
            ],
        )


# ---------------------------------------------------------------------------
# Task 3 — Reminder blast
# ---------------------------------------------------------------------------

async def send_reminder_blast(ctx: dict, *, campaign_id: str) -> None:
    """
    Enqueue send_payment_reminder for every unpaid contributor with a phone.
    Hard-capped at BLAST_LIMIT (50) per blast; reminders are staggered 1s apart.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Contributor).where(
                Contributor.campaign_id == uuid.UUID(campaign_id),
                Contributor.paid.is_(False),
                Contributor.phone.isnot(None),
            )
        )
        unpaid = result.scalars().all()

    if not unpaid:
        logger.info(
            "send_reminder_blast: no unpaid contributors with phones for campaign %s",
            campaign_id,
        )
        return

    targets = unpaid[:_BLAST_LIMIT]
    logger.info(
        "send_reminder_blast: queuing %d reminders for campaign %s",
        len(targets), campaign_id,
    )

    arq = ctx["redis"]
    for i, contributor in enumerate(targets):
        await arq.enqueue_job(
            "send_payment_reminder",
            contributor_id=str(contributor.id),
            _defer_by=timedelta(seconds=i),
        )


# ---------------------------------------------------------------------------
# Image send helper (non-template, for milestone cards)
# ---------------------------------------------------------------------------

async def send_image(phone: str, image_url: str, caption: str) -> bool:
    """Send a WhatsApp image message (non-template) via Meta Cloud API."""
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        return False
    url = f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages"
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "image",
        "image": {"link": image_url, "caption": caption},
    }
    headers = {
        "Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.error("WhatsApp image send failed to %s: %s", phone, resp.text)
                return False
            logger.info("WhatsApp image sent to %s", phone)
            return True
        except Exception as exc:
            logger.warning("WhatsApp image send error to %s: %s", phone, exc)
            return False


# ---------------------------------------------------------------------------
# Task 4 — Campaign completion check
# ---------------------------------------------------------------------------

async def check_campaign_completion(ctx: dict, *, campaign_id: str) -> None:
    """
    Called after each successful payment.
    Marks campaign as completed and notifies the organiser if:
      - total_raised >= goal_amount, OR
      - every contributor has paid.
    """
    async with AsyncSessionLocal() as db:
        campaign = await db.get(Campaign, uuid.UUID(campaign_id))
        if not campaign:
            logger.warning("check_campaign_completion: campaign %s not found", campaign_id)
            return
        if campaign.status != CampaignStatus.active:
            return  # already completed / paused / archived

        total_result = await db.execute(
            select(func.sum(Contributor.amount)).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        total_raised: Decimal = total_result.scalar_one_or_none() or Decimal("0")

        paid_result = await db.execute(
            select(func.count()).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        paid_count = paid_result.scalar_one()

        total_count_result = await db.execute(
            select(func.count()).where(Contributor.campaign_id == campaign.id)
        )
        total_count = total_count_result.scalar_one()

        fully_funded = total_raised >= campaign.goal_amount or (
            total_count > 0 and paid_count == total_count
        )
        if not fully_funded:
            return

        campaign.status = CampaignStatus.completed
        await db.commit()
        logger.info(
            "Campaign %s marked completed (raised=%s / goal=%s, paid=%d/%d)",
            campaign.slug, total_raised, campaign.goal_amount, paid_count, total_count,
        )

        owner = await db.get(User, campaign.owner_id)
        if not owner or not owner.phone:
            return

        await _send_template(
            phone=owner.phone,
            template_name="chipin_campaign_complete",
            params=[campaign.title, f"{total_raised:.2f}", str(paid_count)],
        )


# ---------------------------------------------------------------------------
# Task 5 — Payout completion notification
# ---------------------------------------------------------------------------

async def notify_payout_completion(ctx: dict, *, payout_id: str) -> None:
    """
    Notify the organizer (and beneficiary if phone on file) when a payout is initiated.
    Message: 'Payout of GMD 42,000 sent to your Wave account. Reference: XXXXX. Arrives within 24 hours.'
    """
    async with AsyncSessionLocal() as db:
        payout = await db.get(Payout, uuid.UUID(payout_id))
        if not payout:
            logger.warning("notify_payout_completion: payout %s not found", payout_id)
            return

        campaign = await db.get(Campaign, payout.campaign_id)
        if not campaign:
            return

        from app.models.payout import PayoutMethod as _PM
        method = await db.get(_PM, payout.payout_method_id)
        if not method:
            return

        amount_str = f"{payout.payout_currency} {payout.payout_amount_local:,.0f}"
        ref = payout.provider_reference or str(payout.id)[:8].upper()
        message = (
            f"Payout of {amount_str} sent to your {method.network_name} account. "
            f"Reference: {ref}. Arrives within 24 hours."
        )

        # Re-use the internal plain-text helper defined in this module
        async def _notify(phone: str) -> None:
            if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
                return
            url = f"{_META_BASE}/{settings.META_PHONE_NUMBER_ID}/messages"
            payload: dict[str, Any] = {
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "text",
                "text": {"body": message},
            }
            headers = {
                "Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                try:
                    await client.post(url, json=payload, headers=headers)
                except Exception as exc:
                    logger.warning("Payout WA notify failed to %s: %s", phone, exc)

        owner = await db.get(User, campaign.owner_id)
        if owner and owner.phone:
            await _notify(owner.phone)

        logger.info(
            "Payout notification sent for payout %s (%s → %s)",
            payout_id, payout.payout_currency, method.network_name,
        )
