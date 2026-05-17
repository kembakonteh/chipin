import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.beneficiary import Beneficiary
    from app.models.contributor import Contributor
    from app.models.org import Org
    from app.models.payment import Payment
    from app.models.payout import Payout
    from app.models.purchase import Purchase
    from app.models.user import User
    # noqa: keep imports


class CollectionCurrency(str, enum.Enum):
    USD = "USD"
    GBP = "GBP"
    EUR = "EUR"
    CAD = "CAD"


class PayoutCurrency(str, enum.Enum):
    USD = "USD"
    GBP = "GBP"
    EUR = "EUR"
    GMD = "GMD"
    NGN = "NGN"
    GHS = "GHS"
    XOF = "XOF"


class CampaignType(str, enum.Enum):
    general = "general"          # soccer, BBQ, group trips
    memorial = "memorial"        # funeral repatriation, bereavement collections
    charity = "charity"          # community support, anonymous donations
    celebration = "celebration"  # weddings, graduations, baby showers
    political = "political"      # political party, candidate, or civic cause


class VisibilityMode(str, enum.Enum):
    full_name = "full_name"
    first_name_only = "first_name_only"
    anonymous = "anonymous"


class CampaignStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    archived = "archived"


class Campaign(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "campaigns"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False, default="⚽")
    campaign_type: Mapped[CampaignType] = mapped_column(
        Enum(CampaignType, name="campaigntype"), nullable=False, default=CampaignType.general
    )
    goal_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    contribution_note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    amount_per_person: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    collection_currency: Mapped[CollectionCurrency] = mapped_column(
        Enum(CollectionCurrency, name="collectioncurrency"),
        nullable=False,
        default=CollectionCurrency.USD,
    )
    payout_currency: Mapped[Optional[PayoutCurrency]] = mapped_column(
        Enum(PayoutCurrency, name="payoutcurrency"),
        nullable=True,
    )
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    visibility_mode: Mapped[VisibilityMode] = mapped_column(
        Enum(VisibilityMode, name="visibilitymode"),
        nullable=False,
        default=VisibilityMode.full_name,
    )
    # Organizer-level default; individual contributors can still opt in anonymously
    allow_anonymous_contributions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaignstatus"),
        nullable=False,
        default=CampaignStatus.active,
    )
    whatsapp_reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    zelle_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cashapp_handle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    platform_fee_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("2.50")
    )
    payout_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    event_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    event_time: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    event_location: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    event_rsvp: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    party_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    owner: Mapped["User"] = relationship("User", back_populates="campaigns")
    org: Mapped[Optional["Org"]] = relationship("Org", back_populates="campaigns")
    contributors: Mapped[List["Contributor"]] = relationship("Contributor", back_populates="campaign")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="campaign")
    payouts: Mapped[List["Payout"]] = relationship("Payout", back_populates="campaign")
    beneficiary: Mapped[Optional["Beneficiary"]] = relationship(
        "Beneficiary", back_populates="campaign", uselist=False
    )
    purchases: Mapped[List["Purchase"]] = relationship("Purchase", back_populates="campaign")
