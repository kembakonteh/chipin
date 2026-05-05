import calendar
import enum
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.org import Org


class Frequency(str, enum.Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"
    quarterly = "quarterly"
    annual = "annual"


class InstanceStatus(str, enum.Enum):
    upcoming = "upcoming"
    active = "active"
    completed = "completed"
    missed = "missed"


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, max_day))


def compute_initial_due_date(
    frequency: Frequency,
    start_date: date,
    day_of_month: Optional[int],
    day_of_week: Optional[int],
) -> date:
    """First due date >= start_date matching the schedule's pattern."""
    dom = day_of_month or 1
    dow = day_of_week or 0  # 0 = Monday

    if frequency == Frequency.weekly:
        days_ahead = (dow - start_date.weekday()) % 7
        return start_date + timedelta(days=days_ahead)

    if frequency == Frequency.biweekly:
        days_ahead = (dow - start_date.weekday()) % 7
        return start_date + timedelta(days=days_ahead)

    if frequency == Frequency.monthly:
        year, month = start_date.year, start_date.month
        max_day = calendar.monthrange(year, month)[1]
        candidate = date(year, month, min(dom, max_day))
        if candidate < start_date:
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
            max_day = calendar.monthrange(year, month)[1]
            candidate = date(year, month, min(dom, max_day))
        return candidate

    if frequency == Frequency.quarterly:
        # Quarter anchor months: Jan, Apr, Jul, Oct
        for offset in range(5):
            year = start_date.year + (start_date.month - 1 + offset * 3) // 12
            month = ((start_date.month - 1 + offset * 3) % 12) + 1
            # snap to quarter start
            q_month = ((month - 1) // 3) * 3 + 1
            max_day = calendar.monthrange(year, q_month)[1]
            candidate = date(year, q_month, min(dom, max_day))
            if candidate >= start_date:
                return candidate
        return _add_months(start_date, 3)

    if frequency == Frequency.annual:
        year, month = start_date.year, start_date.month
        max_day = calendar.monthrange(year, month)[1]
        candidate = date(year, month, min(dom, max_day))
        if candidate < start_date:
            candidate = date(year + 1, month, min(dom, calendar.monthrange(year + 1, month)[1]))
        return candidate

    return start_date


def compute_next_due_date(
    frequency: Frequency,
    prev_due: date,
    day_of_month: Optional[int],
    day_of_week: Optional[int],
) -> date:
    """Next due date strictly after prev_due."""
    dom = day_of_month or 1

    if frequency == Frequency.weekly:
        return prev_due + timedelta(days=7)
    if frequency == Frequency.biweekly:
        return prev_due + timedelta(days=14)
    if frequency == Frequency.monthly:
        return _add_months(prev_due.replace(day=min(dom, calendar.monthrange(prev_due.year, prev_due.month)[1])), 1)
    if frequency == Frequency.quarterly:
        return _add_months(prev_due, 3)
    if frequency == Frequency.annual:
        return _add_months(prev_due, 12)
    return prev_due + timedelta(days=30)


def schedule_next_run_at(due_date: date, auto_create_days_before: int) -> datetime:
    trigger = due_date - timedelta(days=auto_create_days_before)
    return datetime.combine(trigger, time(8, 0), tzinfo=timezone.utc)


class RecurringSchedule(Base, UUIDMixin):
    __tablename__ = "recurring_schedules"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True
    )
    frequency: Mapped[Frequency] = mapped_column(Enum(Frequency, name="frequency"), nullable=False)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    auto_create_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    auto_remind_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    campaign: Mapped["Campaign"] = relationship("Campaign", foreign_keys=[campaign_id])
    org: Mapped[Optional["Org"]] = relationship("Org")
    instances: Mapped[List["RecurringInstance"]] = relationship(
        "RecurringInstance", back_populates="schedule", order_by="RecurringInstance.due_date.desc()"
    )


class RecurringInstance(Base, UUIDMixin):
    __tablename__ = "recurring_instances"

    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recurring_schedules.id", ondelete="CASCADE"), nullable=False
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[InstanceStatus] = mapped_column(
        Enum(InstanceStatus, name="instancestatus"),
        nullable=False,
        default=InstanceStatus.upcoming,
        server_default="upcoming",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    schedule: Mapped["RecurringSchedule"] = relationship("RecurringSchedule", back_populates="instances")
    campaign: Mapped["Campaign"] = relationship("Campaign", foreign_keys=[campaign_id])
