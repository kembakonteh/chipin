import calendar
import enum
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.org import Org
    from app.models.user import User


class SusuFrequency(str, enum.Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"


class SusuStatus(str, enum.Enum):
    forming = "forming"
    active = "active"
    completed = "completed"
    paused = "paused"


class SusuPayoutOrder(str, enum.Enum):
    fixed = "fixed"
    random = "random"
    bid = "bid"


class SusuCycleStatus(str, enum.Enum):
    collecting = "collecting"
    collected = "collected"
    paid_out = "paid_out"
    missed = "missed"


class SusuPaidVia(str, enum.Enum):
    card = "card"
    cash = "cash"
    zelle = "zelle"
    cashapp = "cashapp"


class SusuJoinRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, max_day))


def compute_susu_due_date(start_date: date, frequency: SusuFrequency, cycle_offset: int) -> date:
    """Due date for a cycle (0-indexed offset from start_date)."""
    if frequency == SusuFrequency.weekly:
        return start_date + timedelta(weeks=cycle_offset)
    if frequency == SusuFrequency.biweekly:
        return start_date + timedelta(weeks=2 * cycle_offset)
    if frequency == SusuFrequency.monthly:
        return _add_months(start_date, cycle_offset)
    return start_date + timedelta(days=30 * cycle_offset)


class SusuGroup(Base, UUIDMixin):
    __tablename__ = "susu_groups"

    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    contribution_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    frequency: Mapped[SusuFrequency] = mapped_column(
        Enum(SusuFrequency, name="susufrequency"), nullable=False
    )
    total_members: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    current_cycle: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    total_cycles: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[SusuStatus] = mapped_column(
        Enum(SusuStatus, name="susustatus"), nullable=False, default=SusuStatus.forming, server_default="forming"
    )
    payout_order: Mapped[SusuPayoutOrder] = mapped_column(
        Enum(SusuPayoutOrder, name="susupayoutorder"), nullable=False, default=SusuPayoutOrder.fixed, server_default="fixed"
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    next_contribution_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_payout_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Feature 4: missed payment policy
    missed_policy: Mapped[str] = mapped_column(String(50), nullable=False, default='none', server_default="'none'")
    late_fee_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    # Feature 8: group rules
    rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Payment method settings
    allow_card: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    allow_cashapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    allow_zelle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    cashapp_handle: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    zelle_handle: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    owner: Mapped["User"] = relationship("User")
    org: Mapped[Optional["Org"]] = relationship("Org")
    members: Mapped[List["SusuMember"]] = relationship(
        "SusuMember", back_populates="group",
        order_by="SusuMember.payout_position.nullsfirst()",
    )
    cycles: Mapped[List["SusuCycle"]] = relationship(
        "SusuCycle", back_populates="group",
        order_by="SusuCycle.cycle_number",
    )


class SusuMember(Base, UUIDMixin):
    __tablename__ = "susu_members"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_groups.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payout_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_received_payout: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    total_contributed: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Feature 1: multiple slots/hands
    slots: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    group: Mapped["SusuGroup"] = relationship("SusuGroup", back_populates="members")


class SusuCycle(Base, UUIDMixin):
    __tablename__ = "susu_cycles"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_groups.id", ondelete="CASCADE"), nullable=False
    )
    cycle_number: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    pot_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    collected_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    recipient_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_members.id", ondelete="RESTRICT"), nullable=False
    )
    payout_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payout_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payout_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SusuCycleStatus] = mapped_column(
        Enum(SusuCycleStatus, name="susucyclestatus"), nullable=False,
        default=SusuCycleStatus.collecting, server_default="collecting",
    )

    group: Mapped["SusuGroup"] = relationship("SusuGroup", back_populates="cycles")
    recipient: Mapped["SusuMember"] = relationship("SusuMember", foreign_keys=[recipient_member_id])
    contributions: Mapped[List["SusuContribution"]] = relationship(
        "SusuContribution", back_populates="cycle"
    )


class SusuContribution(Base, UUIDMixin):
    __tablename__ = "susu_contributions"

    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_cycles.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_members.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    paid_via: Mapped[Optional[SusuPaidVia]] = mapped_column(
        Enum(SusuPaidVia, name="susupaidvia"), nullable=True
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_payment_intent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    cycle: Mapped["SusuCycle"] = relationship("SusuCycle", back_populates="contributions")
    member: Mapped["SusuMember"] = relationship("SusuMember")
    # Feature 4: missed payment flag
    missed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")


class SusuJoinRequest(Base, UUIDMixin):
    __tablename__ = "susu_join_requests"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("susu_groups.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[SusuJoinRequestStatus] = mapped_column(
        Enum(SusuJoinRequestStatus, name="susujoinrequeststatus"),
        nullable=False,
        default=SusuJoinRequestStatus.pending,
        server_default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    group: Mapped["SusuGroup"] = relationship("SusuGroup")
