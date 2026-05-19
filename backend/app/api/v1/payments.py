import asyncio
import logging
from decimal import Decimal
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_arq, get_current_user
from app.core.email import send_payment_confirmation_email
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.contributor import Contributor, PaidVia
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.schemas.payment import (
    CheckoutResponse,
    EarningsResponse,
    InitiatePaymentRequest,
    PaymentItemResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payments"])

stripe.api_key = settings.STRIPE_SECRET_KEY


def _resolve_is_anonymous(
    request_value: Optional[bool],
    campaign: Campaign,
) -> bool:
    """
    Anonymity resolution:
    1. If campaign disallows anonymous → always False.
    2. If memorial/charity → force True (backend safeguard).
    3. Otherwise use request value (default False).
    """
    if not campaign.allow_anonymous_contributions:
        return False
    if campaign.campaign_type in (CampaignType.memorial, CampaignType.charity):
        return True
    return bool(request_value)


# ---------------------------------------------------------------------------
# POST /p/{slug}/pay — create Stripe Checkout Session
# ---------------------------------------------------------------------------

@router.post("/p/{slug}/pay", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def initiate_payment(
    slug: str,
    body: InitiatePaymentRequest,
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.owner))
        .where(Campaign.slug == slug)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if campaign.status != CampaignStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign is not accepting payments.",
        )

    gross_amount = body.amount if body.amount is not None else campaign.amount_per_person
    if not gross_amount or gross_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount is required (campaign has no default amount_per_person).",
        )

    is_anonymous = _resolve_is_anonymous(body.is_anonymous, campaign)
    stripe_fee = (gross_amount * Decimal("0.029") + Decimal("0.30")).quantize(Decimal("0.01"))
    platform_fee = (gross_amount * campaign.platform_fee_pct / 100).quantize(Decimal("0.01"))
    net_amount = gross_amount - stripe_fee - platform_fee

    # Find or create Contributor by email
    existing = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.email == body.contributor_email,
        )
    )
    contributor = existing.scalar_one_or_none()
    if contributor:
        contributor.is_anonymous = is_anonymous
        contributor.amount = gross_amount
        if body.message is not None:
            contributor.message = body.message.strip() or None
    else:
        contributor = Contributor(
            campaign_id=campaign.id,
            name=body.contributor_name,
            email=body.contributor_email,
            amount=gross_amount,
            is_anonymous=is_anonymous,
            added_by_organizer=False,
            message=body.message.strip() if body.message else None,
        )
        db.add(contributor)
        await db.flush()  # get contributor.id before Stripe call

    # Delete any stale pending Payment rows for this contributor (e.g. abandoned sessions)
    stale_result = await db.execute(
        select(Payment).where(
            Payment.campaign_id == campaign.id,
            Payment.contributor_id == contributor.id,
            Payment.status == PaymentStatus.pending,
        )
    )
    for stale in stale_result.scalars().all():
        if stale.stripe_checkout_session_id:
            try:
                await asyncio.to_thread(
                    stripe.checkout.Session.expire, stale.stripe_checkout_session_id
                )
            except stripe.StripeError:
                pass  # already expired or completed — safe to ignore
        await db.delete(stale)

    # Build Stripe Checkout Session params
    gross_cents = int(gross_amount * 100)
    fee_cents = int(platform_fee * 100)  # application_fee is platform only; Stripe deducts its own fee

    session_params: dict = {
        "mode": "payment",
        "line_items": [
            {
                "price_data": {
                    "currency": campaign.currency.lower(),
                    "unit_amount": gross_cents,
                    "product_data": {"name": campaign.title},
                },
                "quantity": 1,
            }
        ],
        "customer_email": body.contributor_email,
        "metadata": {
            "campaign_id": str(campaign.id),
            "contributor_id": str(contributor.id),
            "campaign_slug": campaign.slug,
            "is_anonymous": str(is_anonymous).lower(),
        },
        "success_url": (
            f"{settings.FRONTEND_URL}/p/{campaign.slug}"
            f"?paid=true&anon={str(is_anonymous).lower()}"
        ),
        "cancel_url": f"{settings.FRONTEND_URL}/p/{campaign.slug}?cancelled=true",
    }

    owner: User = campaign.owner
    if owner.stripe_account_id:
        session_params["payment_intent_data"] = {
            "application_fee_amount": fee_cents,
            "transfer_data": {"destination": owner.stripe_account_id},
        }

    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, **session_params)
    except stripe.StripeError as exc:
        logger.error("Stripe session creation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider error. Please try again.",
        )

    payment = Payment(
        campaign_id=campaign.id,
        contributor_id=contributor.id,
        stripe_payment_intent_id=None,  # set from webhook after checkout.session.completed
        stripe_checkout_session_id=session.id,
        gross_amount=gross_amount,
        stripe_fee=stripe_fee,
        platform_fee=platform_fee,
        net_amount=net_amount,
        currency=campaign.currency,
        status=PaymentStatus.pending,
        payer_name=body.contributor_name,
        payer_email=body.contributor_email,
    )
    db.add(payment)
    await db.commit()

    return CheckoutResponse(checkout_url=session.url)


# ---------------------------------------------------------------------------
# POST /webhooks/stripe — event handler
# ---------------------------------------------------------------------------

@router.post("/webhooks/stripe", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.SignatureVerificationError as exc:
        logger.warning("Stripe webhook: signature verification failed — %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    except Exception:
        logger.exception("Stripe webhook: failed to parse event")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed event")

    event_type = event["type"]
    obj = event["data"]["object"]

    logger.warning("Stripe webhook: verified event %s (id=%s)", event_type, event.get("id"))

    arq = request.app.state.arq
    async with AsyncSessionLocal() as db:
        try:
            if event_type == "checkout.session.completed":
                metadata = obj.get("metadata", {})
                if metadata.get("susu_contribution_id"):
                    await _handle_susu_checkout_completed(obj, db)
                else:
                    await _handle_checkout_completed(obj, db, arq)

            elif event_type == "payment_intent.payment_failed":
                await _handle_payment_failed(obj, db)

            elif event_type == "charge.refunded":
                await _handle_charge_refunded(obj, db)

            else:
                logger.info("Stripe webhook: unhandled event type %s", event_type)
        except Exception:
            logger.exception("Stripe webhook: unhandled exception processing %s", event_type)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Webhook processing error",
            )

    return {"received": True}


async def _handle_checkout_completed(session_obj: dict, db: AsyncSession, arq) -> None:
    session_id = session_obj["id"]
    result = await db.execute(
        select(Payment).where(Payment.stripe_checkout_session_id == session_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        logger.warning("checkout.session.completed: no Payment found for session %s", session_id)
        return

    if payment.status == PaymentStatus.succeeded:
        logger.info("checkout.session.completed: payment %s already succeeded — skipping (idempotent)", session_id)
        return

    # Update payment intent ID (confirmed from Stripe)
    pi_id = session_obj.get("payment_intent")
    if pi_id:
        payment.stripe_payment_intent_id = pi_id

    # Enforce debit-only policy — refund credit card payments immediately
    if pi_id:
        try:
            pi = await asyncio.to_thread(
                stripe.PaymentIntent.retrieve, pi_id, expand=["latest_charge"]
            )
            charge = pi.get("latest_charge") if isinstance(pi, dict) else getattr(pi, "latest_charge", None)
            charge_obj = charge if isinstance(charge, dict) else (charge.to_dict() if charge else None)
            if charge_obj:
                card_funding = (
                    charge_obj.get("payment_method_details", {})
                    .get("card", {})
                    .get("funding", "")
                )
                if card_funding == "credit":
                    logger.warning("Refunding credit card payment %s — debit-only policy", charge_obj["id"])
                    await asyncio.to_thread(stripe.Refund.create, charge=charge_obj["id"])
                    payment.status = PaymentStatus.refunded
                    await db.commit()
                    return
        except stripe.StripeError as exc:
            logger.error("Could not verify card funding type for PI %s: %s", pi_id, exc)

    # Update amounts from session (source of truth)
    gross_cents = session_obj.get("amount_total", 0)
    gross_amount = Decimal(gross_cents) / 100

    # Re-derive stripe_fee from the confirmed gross amount
    stripe_fee = (gross_amount * Decimal("0.029") + Decimal("0.30")).quantize(Decimal("0.01"))

    # Re-derive platform_fee using stored ratio (preserves per-campaign rate)
    if payment.gross_amount and payment.gross_amount > 0:
        fee_ratio = payment.platform_fee / payment.gross_amount
        platform_fee = (gross_amount * fee_ratio).quantize(Decimal("0.01"))
    else:
        platform_fee = payment.platform_fee

    payment.gross_amount = gross_amount
    payment.stripe_fee = stripe_fee
    payment.platform_fee = platform_fee
    payment.net_amount = gross_amount - stripe_fee - platform_fee
    payment.status = PaymentStatus.succeeded

    # Mark contributor paid
    if payment.contributor_id:
        contrib_result = await db.execute(
            select(Contributor).where(Contributor.id == payment.contributor_id)
        )
        contributor = contrib_result.scalar_one_or_none()
        if contributor:
            from datetime import datetime, timezone
            contributor.paid = True
            contributor.paid_at = datetime.now(timezone.utc)
            contributor.paid_via = PaidVia.card

    await db.commit()

    # Send email receipt to contributor
    if payment.payer_email:
        campaign_obj = await db.get(Campaign, payment.campaign_id)
        if campaign_obj:
            await send_payment_confirmation_email(
                email=payment.payer_email,
                payer_name=payment.payer_name or "Contributor",
                amount=payment.gross_amount,
                currency=payment.currency,
                campaign_title=campaign_obj.title,
                campaign_slug=campaign_obj.slug,
            )
        else:
            logger.warning(
                "checkout.session.completed: campaign %s not found, skipping email",
                payment.campaign_id,
            )
    else:
        logger.warning(
            "checkout.session.completed: payment %s has no payer_email, skipping email",
            payment.id,
        )

    # Enqueue async notifications
    if payment.contributor_id:
        await arq.enqueue_job(
            "send_payment_confirmation",
            contributor_id=str(payment.contributor_id),
        )
    await arq.enqueue_job("broadcast_campaign_update", campaign_id=str(payment.campaign_id))
    await arq.enqueue_job("check_campaign_completion", campaign_id=str(payment.campaign_id))


async def _handle_susu_checkout_completed(session_obj: dict, db: AsyncSession) -> None:
    from datetime import datetime, timezone
    from app.models.susu import SusuContribution, SusuCycle, SusuCycleStatus, SusuMember, SusuPaidVia

    metadata = session_obj.get("metadata", {})
    contribution_id = metadata.get("susu_contribution_id")
    if not contribution_id:
        return

    import uuid as _uuid
    contrib_result = await db.execute(
        select(SusuContribution).where(SusuContribution.id == _uuid.UUID(contribution_id))
    )
    contrib = contrib_result.scalar_one_or_none()
    if not contrib or contrib.paid:
        return

    pi_id = session_obj.get("payment_intent")
    is_partner = metadata.get("susu_is_partner") == "1"

    if pi_id:
        contrib.stripe_payment_intent_id = pi_id

    # Load cycle and member
    cycle_result = await db.execute(select(SusuCycle).where(SusuCycle.id == contrib.cycle_id))
    cycle = cycle_result.scalar_one_or_none()
    member_result = await db.execute(select(SusuMember).where(SusuMember.id == contrib.member_id))
    member = member_result.scalar_one_or_none()

    if is_partner and member and member.is_split:
        # Partner's Stripe payment
        split_amt = member.split_amount or Decimal("0")
        contrib.split_partner_paid = True
        contrib.split_partner_paid_via = SusuPaidVia.card
        contrib.split_partner_paid_at = datetime.now(timezone.utc)
        if cycle:
            cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + split_amt
        if member:
            member.total_contributed += split_amt
        if contrib.split_primary_paid:
            contrib.paid = True
    elif member and member.is_split:
        # Primary's Stripe payment on a split hand
        split_amt = member.split_amount or Decimal("0")
        contrib.split_primary_paid = True
        contrib.paid_via = SusuPaidVia.card
        contrib.paid_at = datetime.now(timezone.utc)
        if cycle:
            cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + split_amt
        if member:
            member.total_contributed += split_amt
        if contrib.split_partner_paid:
            contrib.paid = True
    else:
        # Standard non-split payment
        contrib.paid = True
        contrib.paid_via = SusuPaidVia.card
        contrib.paid_at = datetime.now(timezone.utc)
        if cycle:
            cycle.collected_amount = (cycle.collected_amount or Decimal("0")) + contrib.amount
        if member:
            member.total_contributed += contrib.amount

    if cycle and cycle.collected_amount >= cycle.pot_amount:
        cycle.status = SusuCycleStatus.collected

    await db.commit()
    logger.info("Susu contribution %s marked paid via Stripe (partner=%s)", contribution_id, is_partner)


async def _handle_payment_failed(pi_obj: dict, db: AsyncSession) -> None:
    pi_id = pi_obj["id"]
    failure_reason = (
        (pi_obj.get("last_payment_error") or {}).get("message", "Unknown error")
    )
    logger.warning("Payment failed — PI %s: %s", pi_id, failure_reason)

    result = await db.execute(
        select(Payment).where(Payment.stripe_payment_intent_id == pi_id)
    )
    payment = result.scalar_one_or_none()
    if payment:
        payment.status = PaymentStatus.failed
        await db.commit()


async def _handle_charge_refunded(charge_obj: dict, db: AsyncSession) -> None:
    pi_id = charge_obj.get("payment_intent")
    if not pi_id:
        return

    result = await db.execute(
        select(Payment).where(Payment.stripe_payment_intent_id == pi_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return

    payment.status = PaymentStatus.refunded

    if payment.contributor_id:
        contrib_result = await db.execute(
            select(Contributor).where(Contributor.id == payment.contributor_id)
        )
        contributor = contrib_result.scalar_one_or_none()
        if contributor:
            contributor.paid = False

    await db.commit()


# ---------------------------------------------------------------------------
# GET /campaigns/{slug}/earnings — organizer earnings view
# ---------------------------------------------------------------------------

@router.get("/campaigns/{slug}/earnings", response_model=EarningsResponse)
async def campaign_earnings(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    camp_result = await db.execute(
        select(Campaign).where(
            Campaign.slug == slug,
            Campaign.owner_id == current_user.id,
        )
    )
    campaign = camp_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    pay_result = await db.execute(
        select(Payment)
        .where(
            Payment.campaign_id == campaign.id,
            Payment.status == PaymentStatus.succeeded,
        )
        .order_by(Payment.created_at.desc())
    )
    payments = pay_result.scalars().all()

    total_gross = sum((p.gross_amount for p in payments), Decimal("0"))
    total_stripe_fees = sum((p.stripe_fee for p in payments), Decimal("0"))
    total_fees = sum((p.platform_fee for p in payments), Decimal("0"))
    total_net = sum((p.net_amount for p in payments), Decimal("0"))

    return EarningsResponse(
        total_gross=total_gross,
        total_stripe_fees=total_stripe_fees,
        total_platform_fees=total_fees,
        total_net=total_net,
        payment_count=len(payments),
        payments=[PaymentItemResponse.model_validate(p) for p in payments],
    )
