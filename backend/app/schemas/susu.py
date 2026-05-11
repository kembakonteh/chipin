import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.susu import SusuCycleStatus, SusuFrequency, SusuJoinRequestStatus, SusuPaidVia, SusuPayoutOrder, SusuStatus


class SusuGroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    contribution_amount: Decimal = Field(..., gt=0)
    frequency: SusuFrequency
    total_cycles: int = Field(..., ge=2, le=52)
    payout_order: SusuPayoutOrder = SusuPayoutOrder.fixed
    start_date: date
    org_id: Optional[uuid.UUID] = None
    # Feature 4: missed payment policy
    missed_policy: str = "none"
    late_fee_pct: Optional[Decimal] = None
    # Feature 8: group rules
    rules: Optional[str] = None
    # Payment method settings
    allow_card: bool = True
    allow_cashapp: bool = False
    allow_zelle: bool = False
    cashapp_handle: Optional[str] = Field(None, max_length=100)
    zelle_handle: Optional[str] = Field(None, max_length=100)
    # Recipient exemption policy
    recipient_must_pay: bool = True
    # Join request gate
    accepting_members: bool = True


class SusuGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    payout_order: Optional[SusuPayoutOrder] = None
    # Feature 4: missed payment policy
    missed_policy: Optional[str] = None
    late_fee_pct: Optional[Decimal] = None
    # Feature 8: group rules
    rules: Optional[str] = None


class SusuMemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=7, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    payout_position: Optional[int] = Field(None, ge=1)
    # Feature 1: multiple slots/hands
    slots: int = Field(1, ge=1, le=10)
    # Split hand
    is_split: bool = False
    split_partner_name: Optional[str] = Field(None, max_length=255)
    split_partner_phone: Optional[str] = Field(None, max_length=50)


class SusuMemberUpdate(BaseModel):
    payout_position: Optional[int] = Field(None, ge=1)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, min_length=7, max_length=50)
    email: Optional[str] = None
    # Feature 1: multiple slots/hands
    slots: Optional[int] = Field(None, ge=1, le=10)


class SusuMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    name: str
    phone: str
    email: Optional[str]
    payout_position: Optional[int]
    has_received_payout: bool
    total_contributed: Decimal
    joined_at: datetime
    # Feature 1: multiple slots/hands
    slots: int = 1
    # Split hand
    is_split: bool = False
    split_partner_name: Optional[str] = None
    split_partner_phone: Optional[str] = None
    split_amount: Optional[Decimal] = None


class SusuContributionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cycle_id: uuid.UUID
    member_id: uuid.UUID
    member_name: str
    amount: Decimal
    paid: bool
    paid_via: Optional[SusuPaidVia]
    paid_at: Optional[datetime]
    # Feature 4: missed flag
    missed: bool = False
    pending_verification: bool = False
    # Recipient exemption
    is_exempt: bool = False
    # Split hand tracking
    split_primary_paid: bool = False
    split_partner_paid: bool = False
    split_partner_paid_via: Optional[SusuPaidVia] = None
    split_partner_pending_verification: bool = False


class SusuCycleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    cycle_number: int
    due_date: date
    pot_amount: Decimal
    collected_amount: Decimal
    recipient_member_id: uuid.UUID
    recipient_name: str
    payout_sent_at: Optional[datetime]
    payout_method: Optional[str] = None
    payout_reference: Optional[str] = None
    status: SusuCycleStatus
    contributions: List[SusuContributionResponse] = []


class SusuCycleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cycle_number: int
    due_date: date
    pot_amount: Decimal
    collected_amount: Decimal
    recipient_member_id: uuid.UUID
    recipient_name: str
    payout_sent_at: Optional[datetime]
    payout_method: Optional[str] = None
    payout_reference: Optional[str] = None
    status: SusuCycleStatus


class SusuGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: Optional[uuid.UUID]
    owner_id: uuid.UUID
    name: str
    slug: str
    contribution_amount: Decimal
    frequency: SusuFrequency
    total_members: int
    current_cycle: int
    total_cycles: int
    status: SusuStatus
    payout_order: SusuPayoutOrder
    start_date: date
    next_contribution_date: Optional[date]
    next_payout_date: Optional[date]
    created_at: datetime
    # Feature 4: missed payment policy
    missed_policy: str = "none"
    late_fee_pct: Optional[Decimal] = None
    # Feature 8: group rules
    rules: Optional[str] = None
    # Payment method settings
    allow_card: bool = True
    allow_cashapp: bool = False
    allow_zelle: bool = False
    cashapp_handle: Optional[str] = None
    zelle_handle: Optional[str] = None
    # Recipient exemption policy
    recipient_must_pay: bool = True
    # Join request gate
    accepting_members: bool = True
    # Pending join requests count (populated by list endpoint)
    pending_join_requests: int = 0


class SusuDetailResponse(SusuGroupResponse):
    members: List[SusuMemberResponse] = []
    current_cycle_detail: Optional[SusuCycleResponse] = None
    cycle_summaries: List[SusuCycleSummary] = []


class SusuContributeRequest(BaseModel):
    member_id: uuid.UUID
    email: Optional[str] = None


class SusuCheckoutResponse(BaseModel):
    checkout_url: str


class MarkPaidRequest(BaseModel):
    paid_via: SusuPaidVia = SusuPaidVia.cash


class MarkPayoutRequest(BaseModel):
    payout_method: str = "cash"
    payout_reference: Optional[str] = None


class SusuMemberStanding(BaseModel):
    id: uuid.UUID
    name: str
    total_contributed: Decimal
    paid_cycles: int
    reliability_pct: Optional[int]
    has_received_payout: bool
    payout_position: Optional[int]
    # Split hand
    is_split: bool = False
    split_partner_name: Optional[str] = None
    current_cycle_primary_paid: bool = False
    current_cycle_partner_paid: bool = False
    current_cycle_is_exempt: bool = False


class SusuStandingsResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: SusuStatus
    current_cycle: int
    total_cycles: int
    contribution_amount: Decimal
    frequency: SusuFrequency
    total_members: int
    members: List[SusuMemberStanding]


class SusuJoinRequestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=7, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=500)


class SusuJoinRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    name: str
    phone: str
    email: Optional[str]
    message: Optional[str]
    status: SusuJoinRequestStatus
    created_at: datetime


class SusuPaymentSettingsUpdate(BaseModel):
    allow_card: Optional[bool] = None
    allow_cashapp: Optional[bool] = None
    allow_zelle: Optional[bool] = None
    cashapp_handle: Optional[str] = Field(None, max_length=100)
    zelle_handle: Optional[str] = Field(None, max_length=100)
    recipient_must_pay: Optional[bool] = None
    accepting_members: Optional[bool] = None


class SusuJoinPageInfo(BaseModel):
    accepting: bool
    has_started: bool = False
    name: Optional[str] = None
    contribution_amount: Optional[Decimal] = None
    frequency: Optional[SusuFrequency] = None
    total_members: Optional[int] = None
    organizer_name: Optional[str] = None
    rules: Optional[str] = None


class SusuPayPageInfo(BaseModel):
    group_name: str
    slug: str
    member_id: str
    member_name: str
    cycle_number: int
    amount: Decimal
    already_paid: bool
    pending_verification: bool
    pending_paid_via: Optional[str]
    allow_card: bool
    allow_cashapp: bool
    allow_zelle: bool
    cashapp_handle: Optional[str]
    zelle_handle: Optional[str]
    # Split hand
    is_split: bool = False
    split_partner_name: Optional[str] = None
    is_partner_view: bool = False


class SusuOfflinePayRequest(BaseModel):
    paid_via: SusuPaidVia
