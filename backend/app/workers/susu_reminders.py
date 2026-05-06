"""
Feature 2: WhatsApp reminders to Susu members.

Daily cron (08:00): for each active group, if the current cycle due date is
exactly 3 days away, send a WhatsApp reminder to each unpaid member.
A Redis flag prevents duplicate sends within the same cycle.
"""
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.susu import (
    SusuContribution,
    SusuCycle,
    SusuGroup,
    SusuMember,
    SusuStatus,
)

logger = logging.getLogger(__name__)


async def _send_whatsapp_text(phone: str, message: str) -> None:
    """Send a plain-text WhatsApp message."""
    import httpx
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        return
    url = f"https://graph.facebook.com/v18.0/{settings.META_PHONE_NUMBER_ID}/messages"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(
                url,
                json={
                    "messaging_product": "whatsapp",
                    "to": phone,
                    "type": "text",
                    "text": {"body": message},
                },
                headers={"Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}"},
            )
        except Exception as exc:
            logger.warning("WhatsApp send failed to %s: %s", phone, exc)


async def send_susu_cycle_reminders(ctx: dict) -> None:
    """
    Runs daily at 08:00. Sends WhatsApp reminder to unpaid Susu members
    whose current cycle due date is exactly 3 days away.
    Uses Redis to avoid duplicate sends (key expires after 8 days).
    """
    today = date.today()
    target_date = today + timedelta(days=3)
    redis = ctx["redis"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SusuGroup)
            .options(
                selectinload(SusuGroup.members),
                selectinload(SusuGroup.cycles).selectinload(SusuCycle.contributions),
            )
            .where(SusuGroup.status == SusuStatus.active)
        )
        groups = result.scalars().all()

    logger.info(
        "send_susu_cycle_reminders: checking %d active groups for due date %s",
        len(groups), target_date,
    )

    for group in groups:
        # Find the current cycle
        current_cycle = next(
            (c for c in group.cycles if c.cycle_number == group.current_cycle), None
        )
        if not current_cycle:
            continue

        # Only send reminders if due date is exactly 3 days away and cycle is collecting
        if current_cycle.due_date != target_date:
            continue
        if current_cycle.status.value != "collecting":
            continue

        # Build member map
        member_map = {m.id: m for m in group.members}

        # Find unpaid contributions
        unpaid_contribs = [c for c in current_cycle.contributions if not c.paid]

        for contrib in unpaid_contribs:
            member = member_map.get(contrib.member_id)
            if not member or not member.phone:
                continue

            # Redis dedup key
            flag_key = f"chipin:susu_reminded:{current_cycle.id}:{member.id}"
            already_sent = await redis.exists(flag_key)
            if already_sent:
                continue

            # Build the public URL
            public_url = f"{settings.FRONTEND_URL}/s/{group.slug}"
            message = (
                f"Hi {member.name}, your ${contrib.amount:.2f} Susu contribution "
                f"to '{group.name}' is due {current_cycle.due_date}. "
                f"Pay here: {public_url}"
            )

            await _send_whatsapp_text(member.phone, message)

            # Set Redis flag, expire after 8 days (in seconds)
            await redis.set(flag_key, "1", ex=8 * 24 * 3600)
            logger.info(
                "Sent Susu reminder to %s (group=%s, cycle=%d)",
                member.name, group.slug, current_cycle.cycle_number,
            )

    logger.info("send_susu_cycle_reminders complete")
