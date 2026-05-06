"""
Payout endpoints:
  POST /users/payout-methods
  POST /users/payout-methods/{id}/verify
  GET  /users/payout-methods
  POST /campaigns/{slug}/payout
  GET  /campaigns/{slug}/payouts
"""
import random
import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_arq, get_current_user
from app.core.fx import convert as fx_convert, get_rate
from app.core.payout_providers import get_provider
from app.core.redis_client import get_redis
from app.models.campaign import Campaign, CampaignStatus
from app.models.contributor import Contributor
from app.models.payment import Payment, PaymentStatus
from app.models.payout import MethodType, Payout, PayoutMethod, PayoutStatus
from app.models.user import User
from app.schemas.payout import (
    InitiatePayoutRequest,
    InitiatePayoutResponse,
    PayoutMethodCreate,
    PayoutMethodResponse,
    PayoutResponse,
    VerifyPayoutMethodRequest,
)

users_router = APIRouter(prefix="/users", tags=["payout-methods"])
campaigns_router = APIRouter(prefix="/campaigns", tags=["payouts"])

_VERIFY_TTL = 600  # 10 min


# ── Payout method helpers ─────────────────────────────────────────────────────

async def _get_method_or_404(
    method_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> PayoutMethod:
    result = await db.execute(
        select(PayoutMethod).where(
            PayoutMethod.id == method_id, PayoutMethod.user_id == user_id
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout method not found")
    return m


# ── POST /users/payout-methods ────────────────────────────────────────────────

@users_router.post(
    "/payout-methods",
    response_model=PayoutMethodResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_payout_method(
    body: PayoutMethodCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    method = PayoutMethod(
        user_id=current_user.id,
        method_type=body.method_type,
        country_code=body.country_code,
        network_name=body.network_name,
        account_number=body.account_number,
        account_name=body.account_name,
    )
    db.add(method)
    await db.commit()
    await db.refresh(method)

    # Generate 6-digit verification code, cache in Redis for 10 min
    code = str(random.randint(100_000, 999_999))
    redis = await get_redis()
    await redis.set(f"chipin:payout-verify:{method.id}", code, ex=_VERIFY_TTL)

    # Send code via WhatsApp to the account_number (phone)
    if current_user.phone or (body.method_type == MethodType.mobile_money):
        phone = body.account_number if body.method_type == MethodType.mobile_money else current_user.phone
        if phone:
            await arq.enqueue_job(
                "notify_organizer_whatsapp",
                organizer_phone=phone,
                message=f"Your ChipIn payout method verification code is: {code}. Valid for 10 minutes.",
            )

    return method


# ── POST /users/payout-methods/{id}/verify ────────────────────────────────────

@users_router.post("/payout-methods/{method_id}/verify", response_model=PayoutMethodResponse)
async def verify_payout_method(
    method_id: uuid.UUID,
    body: VerifyPayoutMethodRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    method = await _get_method_or_404(method_id, current_user.id, db)

    redis = await get_redis()
    stored_code = await redis.get(f"chipin:payout-verify:{method.id}")
    if not stored_code or stored_code != body.code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code"
        )

    method.is_verified = True
    await redis.delete(f"chipin:payout-verify:{method.id}")

    # Make default if first verified method
    result = await db.execute(
        select(func.count()).where(
            PayoutMethod.user_id == current_user.id,
            PayoutMethod.is_verified.is_(True),
        )
    )
    verified_count = result.scalar_one()
    if verified_count == 0:
        method.is_default = True

    await db.commit()
    await db.refresh(method)
    return method


# ── GET /users/payout-methods ─────────────────────────────────────────────────

@users_router.get("/payout-methods", response_model=List[PayoutMethodResponse])
async def list_payout_methods(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PayoutMethod)
        .where(PayoutMethod.user_id == current_user.id)
        .order_by(PayoutMethod.is_default.desc(), PayoutMethod.created_at.asc())
    )
    return result.scalars().all()


# ── POST /campaigns/{slug}/payout ────────────────────────────────────────────

@campaigns_router.post("/{slug}/payout", response_model=InitiatePayoutResponse)
async def initiate_payout(
    slug: str,
    body: InitiatePayoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    # Fetch campaign
    result = await db.execute(
        select(Campaign).where(Campaign.slug == slug, Campaign.owner_id == current_user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status not in (CampaignStatus.active, CampaignStatus.completed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payouts can only be initiated for active or completed campaigns",
        )

    # Fetch payout method — must belong to this user and be verified
    method = await _get_method_or_404(body.payout_method_id, current_user.id, db)
    if not method.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payout method must be verified before use",
        )

    # Compute available net balance (sum of succeeded payments minus already-disbursed payouts)
    payments_result = await db.execute(
        select(func.sum(Payment.net_amount)).where(
            Payment.campaign_id == campaign.id,
            Payment.status == PaymentStatus.succeeded,
        )
    )
    total_net: Decimal = payments_result.scalar_one_or_none() or Decimal("0")

    disbursed_result = await db.execute(
        select(func.sum(Payout.gross_amount_usd)).where(
            Payout.campaign_id == campaign.id,
            Payout.status.in_([PayoutStatus.pending, PayoutStatus.processing, PayoutStatus.completed]),
        )
    )
    already_disbursed: Decimal = disbursed_result.scalar_one_or_none() or Decimal("0")

    available = total_net - already_disbursed
    if available <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No available balance to pay out"
        )

    gross_usd = body.amount if body.amount else available
    if gross_usd > available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested amount {gross_usd} exceeds available balance {available}",
        )

    # Determine currencies
    collection_cur = str(
        campaign.collection_currency.value if campaign.collection_currency else campaign.currency
    )
    payout_cur = (
        campaign.payout_currency.value
        if campaign.payout_currency
        else collection_cur
    )

    # FX conversion
    rate = await get_rate(collection_cur, payout_cur)
    payout_amount_local = (gross_usd * rate).quantize(Decimal("0.01"))

    # Initiate via provider
    provider = get_provider(method.network_name)
    recipient = {
        "account_number": method.account_number,
        "account_name": method.account_name,
        "narration": f"ChipIn payout — {campaign.title}",
        "reference": f"CHIPIN-{campaign.slug}-{uuid.uuid4().hex[:8]}",
    }

    try:
        provider_ref = await provider.initiate_transfer(
            amount=payout_amount_local, currency=payout_cur, recipient=recipient
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transfer failed: {exc}",
        )

    payout = Payout(
        campaign_id=campaign.id,
        payout_method_id=method.id,
        gross_amount_usd=gross_usd,
        exchange_rate=rate,
        payout_amount_local=payout_amount_local,
        payout_currency=payout_cur,
        transfer_fee=Decimal("0"),
        status=PayoutStatus.processing,
        provider_reference=provider_ref,
    )
    db.add(payout)
    await db.commit()
    await db.refresh(payout)

    # WhatsApp notification
    await arq.enqueue_job(
        "notify_payout_completion",
        payout_id=str(payout.id),
    )

    return InitiatePayoutResponse(
        payout_id=payout.id,
        estimated_arrival="Within 24 hours",
        payout_amount_local=payout_amount_local,
        payout_currency=payout_cur,
        status=payout.status,
    )


# ── GET /campaigns/{slug}/payouts ────────────────────────────────────────────

@campaigns_router.get("/{slug}/payouts", response_model=List[PayoutResponse])
async def list_payouts(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign).where(Campaign.slug == slug, Campaign.owner_id == current_user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    payouts_result = await db.execute(
        select(Payout)
        .where(Payout.campaign_id == campaign.id)
        .order_by(Payout.initiated_at.desc())
    )
    return payouts_result.scalars().all()
