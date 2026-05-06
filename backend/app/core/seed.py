"""Idempotent seed for built-in campaign templates."""

import logging
from decimal import Decimal

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import CampaignType, VisibilityMode
from app.models.template import CampaignTemplate

logger = logging.getLogger(__name__)

_TEMPLATES = [
    {
        "name": "Soccer Season Dues",
        "campaign_type": CampaignType.general,
        "emoji": "⚽",
        "description_template": "Contributions for {season} season bibs and equipment.",
        "default_amount_per_person": Decimal("30.00"),
        "default_visibility_mode": VisibilityMode.full_name,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Hey {name}, chip in for {season} soccer season! ⚽ {url}",
        "sort_order": 1,
        "is_active": True,
    },
    {
        "name": "Religious Collection",
        "campaign_type": CampaignType.charity,
        "emoji": "🙏",
        "description_template": "Collection for {place_of_worship}.",
        "default_amount_per_person": Decimal("20.00"),
        "default_visibility_mode": VisibilityMode.first_name_only,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Please chip in for the collection at {place_of_worship}. {url}",
        "sort_order": 2,
        "is_active": True,
    },
    {
        "name": "Funeral Repatriation",
        "campaign_type": CampaignType.memorial,
        "emoji": "🕊",
        "description_template": (
            "Repatriation collection for {name}. "
            "All contributions go directly to the family."
        ),
        "default_amount_per_person": Decimal("50.00"),
        "default_visibility_mode": VisibilityMode.first_name_only,
        "default_anonymous": True,
        "whatsapp_share_text_template": (
            "Please contribute to help bring {name} home. "
            "Every bit counts. 🕊 {url}"
        ),
        "sort_order": 3,
        "is_active": True,
    },
    {
        "name": "Wedding Gift Collection",
        "campaign_type": CampaignType.celebration,
        "emoji": "💍",
        "description_template": "Group wedding gift for {couple_names}.",
        "default_amount_per_person": Decimal("25.00"),
        "default_visibility_mode": VisibilityMode.full_name,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Chip in for {couple_names}'s wedding gift! 💍 {url}",
        "sort_order": 4,
        "is_active": True,
    },
    {
        "name": "Baby Shower",
        "campaign_type": CampaignType.celebration,
        "emoji": "👶",
        "description_template": "Baby shower gift collection for {name}.",
        "default_amount_per_person": Decimal("20.00"),
        "default_visibility_mode": VisibilityMode.full_name,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Help us celebrate {name}'s new arrival! 👶 {url}",
        "sort_order": 5,
        "is_active": True,
    },
    {
        "name": "Community Emergency Fund",
        "campaign_type": CampaignType.charity,
        "emoji": "❤️",
        "description_template": "Emergency support fund for {beneficiary}.",
        "default_amount_per_person": None,
        "default_visibility_mode": VisibilityMode.anonymous,
        "default_anonymous": True,
        "whatsapp_share_text_template": "Please support {beneficiary} in their time of need. ❤️ {url}",
        "sort_order": 6,
        "is_active": True,
    },
    {
        "name": "Annual Association Dues",
        "campaign_type": CampaignType.general,
        "emoji": "🤝",
        "description_template": "{year} dues for {association_name}.",
        "default_amount_per_person": Decimal("50.00"),
        "default_visibility_mode": VisibilityMode.full_name,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Time to pay your {year} dues for {association_name}! 🤝 {url}",
        "sort_order": 7,
        "is_active": True,
    },
    {
        "name": "Graduation Gift",
        "campaign_type": CampaignType.celebration,
        "emoji": "🎓",
        "description_template": "Graduation gift collection for {name}.",
        "default_amount_per_person": Decimal("20.00"),
        "default_visibility_mode": VisibilityMode.full_name,
        "default_anonymous": False,
        "whatsapp_share_text_template": "Let's celebrate {name}'s graduation together! 🎓 {url}",
        "sort_order": 8,
        "is_active": True,
    },
]


async def seed_templates(db: AsyncSession) -> None:
    """Insert built-in templates, skipping any that already exist by name."""
    stmt = pg_insert(CampaignTemplate).values(_TEMPLATES).on_conflict_do_nothing(
        index_elements=["name"]
    )
    await db.execute(stmt)
    await db.commit()
    logger.info("Template seed complete (%d templates defined)", len(_TEMPLATES))
