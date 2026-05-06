import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.payment import PaymentStatus


class InitiatePaymentRequest(BaseModel):
    contributor_name: str
    contributor_email: EmailStr
    amount: Optional[Decimal] = None
    is_anonymous: Optional[bool] = None  # None = use campaign/type defaults
    message: Optional[str] = None


class CheckoutResponse(BaseModel):
    checkout_url: str


class PaymentItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    payer_name: Optional[str]
    payer_email: Optional[str]
    gross_amount: Decimal
    platform_fee: Decimal
    net_amount: Decimal
    currency: str
    status: PaymentStatus


class EarningsResponse(BaseModel):
    total_gross: Decimal
    total_platform_fees: Decimal
    total_net: Decimal
    payment_count: int
    payments: List[PaymentItemResponse]
