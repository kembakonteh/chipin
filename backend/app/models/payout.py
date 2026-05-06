import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.user import User


class MethodType(str, enum.Enum):
    mobile_money = "mobile_money"
    bank_transfer = "bank_transfer"
    stripe_connect = "stripe_connect"


class PayoutStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PayoutMethod(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payout_methods"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    method_type: Mapped[MethodType] = mapped_column(
        Enum(MethodType, name="methodtype"), nullable=False
    )
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    network_name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_number: Mapped[str] = mapped_column(String(50), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship("User", back_populates="payout_methods")
    payouts: Mapped[List["Payout"]] = relationship("Payout", back_populates="payout_method")


class Payout(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "payouts"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    payout_method_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payout_methods.id", ondelete="RESTRICT"), nullable=False
    )
    gross_amount_usd: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    payout_amount_local: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payout_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    transfer_fee: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal("0"))
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus, name="payoutstatus"), nullable=False, default=PayoutStatus.pending
    )
    provider_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    initiated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="payouts")
    payout_method: Mapped["PayoutMethod"] = relationship("PayoutMethod", back_populates="payouts")
