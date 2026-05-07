from decimal import Decimal
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.models.campaign import CampaignStatus, CampaignType
from app.schemas.beneficiary import BeneficiaryResponse


class PublicContributorItem(BaseModel):
    display_name: str
    amount: Decimal
    paid: bool
    paid_at: Optional[datetime]


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
    goal_amount: Decimal
    amount_per_person: Optional[Decimal]
    currency: str
    allow_anonymous_contributions: bool
    total_raised: Decimal
    contributor_count: int
    paid_count: int
    contributors: List[PublicContributorItem]
    status: CampaignStatus
    zelle_info: Optional[str] = None
    cashapp_handle: Optional[str] = None
    beneficiary: Optional[BeneficiaryResponse] = None


class ManualPayRequest(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    amount: Decimal
    method: str  # "zelle" | "cashapp"
    is_anonymous: bool = False
