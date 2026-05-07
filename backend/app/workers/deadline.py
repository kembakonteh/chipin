"""
Daily cron job that enforces campaign payment deadlines.

Escalation schedule (relative to payment_deadline):
  -7 days  → standard reminder blast    (template: chipin_deadline_reminder_7)
  -3 days  → urgent reminder blast      (template: chipin_deadline_reminder_3)
  -1 day   → last-chance reminder blast (template: chipin_deadline_reminder_1)
   0 days  → mark campaign completed, notify organiser

Redis flags prevent duplicate sends across daily runs.
"""

import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.user import User
from app.workers.whatsapp import _send_template

logger = logging.getLogger(__name__)

_THRESHOLDS = [7, 3, 1]  # days-before reminders
_BLAST_LIMIT = 50


async def _deadline_reminder_blast(
    campaign: Campaign,
    days_left: int,
    arq: object,
) -> None:
    """Queue individual deadline reminder messages for each unpaid contributor."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Contributor).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(False),
                Contributor.phone.isnot(None),
            )
        )
        unpaid = result.scalars().all()

    if not unpaid:
        return

    targets = unpaid[:_BLAST_LIMIT]
    logger.info(
        "deadline_reminder: queuing %d messages (-%d days) for campaign %s",
        len(targets), days_left, campaign.slug,
    )

    for i, contributor in enumerate(targets):
        await arq.enqueue_job(
            "send_deadline_reminder",
            contributor_id=str(contributor.id),
            days_left=days_left,
            _defer_by=timedelta(seconds=i),
        )


async def process_campaign_deadlines(ctx: dict) -> None:
    """
    Runs daily. Checks all active campaigns with a payment_deadline set.
    Sends escalating reminders and closes campaigns past their deadline.
    """
    today = date.today()
    arq = ctx["redis"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Campaign).where(
                Campaign.status == CampaignStatus.active,
                Campaign.payment_deadline.isnot(None),
            )
        )
        campaigns = result.scalars().all()

    logger.info("process_campaign_deadlines: checking %d campaign(s) today=%s", len(campaigns), today)

    for campaign in campaigns:
        deadline: date = campaign.payment_deadline
        delta = (deadline - today).days

        if delta < 0:
            # Deadline passed — close the campaign
            flag_key = f"chipin:deadline_expired:{campaign.id}"
            already_closed = await arq.exists(flag_key)
            if not already_closed:
                await arq.set(flag_key, "1")
                async with AsyncSessionLocal() as db:
                    c = await db.get(Campaign, campaign.id)
                    if c and c.status == CampaignStatus.active:
                        owner_id = c.owner_id
                        title = c.title
                        c.status = CampaignStatus.completed
                        await db.commit()
                        logger.info("Campaign %s closed — deadline %s passed", c.slug, deadline)

                        owner = await db.get(User, owner_id)
                        if owner and owner.phone:
                            await _send_template(
                                phone=owner.phone,
                                template_name="chipin_deadline_expired",
                                params=[title, deadline.strftime("%B %d, %Y")],
                            )
            continue

        if delta in _THRESHOLDS and campaign.whatsapp_reminders_enabled:
            flag_key = f"chipin:deadline_reminder:{campaign.id}:{delta}"
            already_sent = await arq.exists(flag_key)
            if not already_sent:
                await arq.set(flag_key, "1")
                await _deadline_reminder_blast(campaign, delta, arq)


async def send_deadline_reminder(ctx: dict, *, contributor_id: str, days_left: int) -> None:
    """
    Send a single deadline reminder to one unpaid contributor.

    Template: chipin_deadline_reminder_7 / _3 / _1
    Params: [name, campaign_title, days_left, deadline_date, public_url]
    """
    from app.core.config import settings

    phone = None
    name = None
    campaign_title = None
    deadline_str = None
    public_url = None

    async with AsyncSessionLocal() as db:
        contributor = await db.get(Contributor, uuid.UUID(contributor_id))
        if not contributor or contributor.paid or not contributor.phone:
            return

        campaign = await db.get(Campaign, contributor.campaign_id)
        if not campaign or campaign.status != CampaignStatus.active:
            return
        if not campaign.payment_deadline:
            return

        phone = contributor.phone
        name = contributor.name
        campaign_title = campaign.title
        deadline_str = campaign.payment_deadline.strftime("%B %d, %Y")
        public_url = f"{settings.FRONTEND_URL}/p/{campaign.slug}"

    template_name = f"chipin_deadline_reminder_{days_left}"

    await _send_template(
        phone=phone,
        template_name=template_name,
        params=[name, campaign_title, str(days_left), deadline_str, public_url],
    )
