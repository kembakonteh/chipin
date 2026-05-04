import uuid
from datetime import datetime
from decimal import Decimal
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.campaign import CampaignStatus, CampaignType, VisibilityMode

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


class CampaignCreate(BaseModel):
    title: str
    description: Optional[str] = None
    emoji: str = "⚽"
    campaign_type: CampaignType = CampaignType.general
    goal_amount: Decimal
    amount_per_person: Optional[Decimal] = None
    currency: str = "USD"
    visibility_mode: VisibilityMode = VisibilityMode.full_name
    allow_anonymous_contributions: bool = True
    whatsapp_reminders_enabled: bool = True

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.upper()


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None
    campaign_type: Optional[CampaignType] = None
    goal_amount: Optional[Decimal] = None
    amount_per_person: Optional[Decimal] = None
    visibility_mode: Optional[VisibilityMode] = None
    allow_anonymous_contributions: Optional[bool] = None
    status: Optional[CampaignStatus] = None
    whatsapp_reminders_enabled: Optional[bool] = None


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    description: Optional[str]
    emoji: str
    campaign_type: CampaignType
    goal_amount: Decimal
    amount_per_person: Optional[Decimal]
    currency: str
    visibility_mode: VisibilityMode
    allow_anonymous_contributions: bool
    status: CampaignStatus
    whatsapp_reminders_enabled: bool
    platform_fee_pct: Decimal
    org_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
