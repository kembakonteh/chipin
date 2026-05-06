import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.payout import MethodType, PayoutStatus


# ── PayoutMethod ─────────────────────────────────────────────────────────────

class PayoutMethodCreate(BaseModel):
    method_type: MethodType
    country_code: str
    network_name: str
    account_number: str
    account_name: str

    @field_validator("country_code")
    @classmethod
    def upper_country(cls, v: str) -> str:
        return v.upper()


class PayoutMethodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    method_type: MethodType
    country_code: str
    network_name: str
    account_number: str
    account_name: str
    is_verified: bool
    is_default: bool
    created_at: datetime


class VerifyPayoutMethodRequest(BaseModel):
    code: str


# ── Payout ────────────────────────────────────────────────────────────────────

class InitiatePayoutRequest(BaseModel):
    payout_method_id: uuid.UUID
    amount: Optional[Decimal] = None  # None = pay all net funds


class PayoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    payout_method_id: uuid.UUID
    gross_amount_usd: Decimal
    exchange_rate: Decimal
    payout_amount_local: Decimal
    payout_currency: str
    transfer_fee: Decimal
    status: PayoutStatus
    provider_reference: Optional[str]
    initiated_at: datetime
    completed_at: Optional[datetime]


class InitiatePayoutResponse(BaseModel):
    payout_id: uuid.UUID
    estimated_arrival: str
    payout_amount_local: Decimal
    payout_currency: str
    status: PayoutStatus
