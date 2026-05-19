from decimal import Decimal
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel

from app.models.campaign import CampaignStatus, CampaignType
from app.schemas.beneficiary import BeneficiaryResponse


class PublicContributorItem(BaseModel):
    display_name: str
    amount: Decimal
    paid: bool
    paid_at: Optional[datetime]
    message: Optional[str] = None


class CampaignStatsResponse(BaseModel):
    total_raised: Decimal
    paid_count: int
    contributor_count: int
    latest_payer_display_name: Optional[str]
    progress_pct: float


class PublicCampaignResponse(BaseModel):
    slug: str
    title: str
    description: Optional[str]
    emoji: str
    campaign_type: CampaignType
    goal_amount: Optional[Decimal]
    contribution_note: Optional[str] = None
    due_date: Optional[date] = None
    amount_per_person: Optional[Decimal]
    currency: str
    collection_currency: str
    payout_currency: Optional[str]
    # Converted amounts shown in payout currency (e.g. GMD) — None if no payout_currency set
    goal_amount_local: Optional[Decimal]
    total_raised_local: Optional[Decimal]
    allow_anonymous_contributions: bool
    total_raised: Decimal
    contributor_count: int
    paid_count: int
    contributors: List[PublicContributorItem]
    status: CampaignStatus
    zelle_info: Optional[str] = None
    cashapp_handle: Optional[str] = None
    beneficiary: Optional[BeneficiaryResponse] = None
    event_date: Optional[date] = None
    event_time: Optional[str] = None
    event_location: Optional[str] = None
    event_rsvp: Optional[str] = None
    party_color: Optional[str] = None
    platform_fee_pct: Decimal = Decimal("2.00")


class ManualPayRequest(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    amount: Decimal
    method: str  # "zelle" | "cashapp"
    is_anonymous: bool = False


class RsvpRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
