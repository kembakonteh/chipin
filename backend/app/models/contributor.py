import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.payment import Payment


class PaidVia(str, enum.Enum):
    card = "card"
    zelle = "zelle"
    cash = "cash"
    cashapp = "cashapp"
    manual = "manual"


class Contributor(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "contributors"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    paid_via: Mapped[Optional[PaidVia]] = mapped_column(
        Enum(PaidVia, name="paidvia"), nullable=True
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    added_by_organizer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # When true: shown as "Anonymous" on public board; organizer always sees real name
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="contributors")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="contributor")
