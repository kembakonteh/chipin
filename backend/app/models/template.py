from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Enum, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin
from app.models.campaign import CampaignType, VisibilityMode


class CampaignTemplate(Base, UUIDMixin):
    __tablename__ = "campaign_templates"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    campaign_type: Mapped[CampaignType] = mapped_column(
        Enum(CampaignType, name="campaigntype"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="⚽")
    description_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    default_amount_per_person: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    default_visibility_mode: Mapped[VisibilityMode] = mapped_column(
        Enum(VisibilityMode, name="visibilitymode"),
        nullable=False,
        default=VisibilityMode.full_name,
    )
    default_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    whatsapp_share_text_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
