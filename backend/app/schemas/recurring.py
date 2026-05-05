import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.models.recurring import Frequency, InstanceStatus


class RecurringScheduleCreate(BaseModel):
    frequency: Frequency
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    start_date: date
    end_date: Optional[date] = None
    auto_create_days_before: int = 3
    auto_remind_days_before: int = 1

    @field_validator("day_of_month")
    @classmethod
    def validate_dom(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 28):
            raise ValueError("day_of_month must be between 1 and 28")
        return v

    @field_validator("day_of_week")
    @classmethod
    def validate_dow(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (0 <= v <= 6):
            raise ValueError("day_of_week must be between 0 (Mon) and 6 (Sun)")
        return v

    @field_validator("auto_create_days_before")
    @classmethod
    def validate_create_before(cls, v: int) -> int:
        if not (1 <= v <= 14):
            raise ValueError("auto_create_days_before must be 1–14")
        return v

    @field_validator("auto_remind_days_before")
    @classmethod
    def validate_remind_before(cls, v: int) -> int:
        if not (1 <= v <= 7):
            raise ValueError("auto_remind_days_before must be 1–7")
        return v


class RecurringScheduleUpdate(BaseModel):
    end_date: Optional[date] = None
    auto_create_days_before: Optional[int] = None
    auto_remind_days_before: Optional[int] = None
    is_active: Optional[bool] = None


class RecurringScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    org_id: Optional[uuid.UUID]
    frequency: Frequency
    day_of_month: Optional[int]
    day_of_week: Optional[int]
    start_date: date
    end_date: Optional[date]
    auto_create_days_before: int
    auto_remind_days_before: int
    is_active: bool
    last_run_at: Optional[datetime]
    next_run_at: datetime
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def next_due_date(self) -> date:
        return (self.next_run_at + timedelta(days=self.auto_create_days_before)).date()


class RecurringInstanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    schedule_id: uuid.UUID
    campaign_id: uuid.UUID
    due_date: date
    status: InstanceStatus
    created_at: datetime


class RecurringScheduleWithCampaign(BaseModel):
    """For the /recurring dashboard — includes campaign context."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    campaign_slug: str
    campaign_title: str
    campaign_emoji: str
    frequency: Frequency
    day_of_month: Optional[int]
    day_of_week: Optional[int]
    start_date: date
    end_date: Optional[date]
    auto_create_days_before: int
    auto_remind_days_before: int
    is_active: bool
    last_run_at: Optional[datetime]
    next_run_at: datetime
    recent_instances: List[RecurringInstanceResponse] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def next_due_date(self) -> date:
        return (self.next_run_at + timedelta(days=self.auto_create_days_before)).date()
