import asyncio
import base64
import contextlib
import json
from decimal import Decimal
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy import nullslast
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.core import sse_manager
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_arq
from app.core.fx import convert as fx_convert
from app.core.redis_client import get_redis
from app.models.campaign import Campaign, CampaignStatus, VisibilityMode
from app.models.contributor import Contributor
from app.models.user import User
from app.schemas.contributor import (
    JoinCampaignRequest,
    JoinCampaignResponse,
    MembershipResponse,
)
from app.schemas.public import (
    CampaignStatsResponse,
    ManualPayRequest,
    PublicCampaignResponse,
    PublicContributorItem,
    RsvpRequest,
)

router = APIRouter(tags=["public"])


def _resolve_display_name(name: str, is_anonymous: bool, visibility_mode: VisibilityMode) -> str:
    """Two-layer name resolution.
    Layer 1: individual is_anonymous flag (highest priority).
    Layer 2: campaign visibility_mode.
    """
    if is_anonymous:
        return "Anonymous"
    if visibility_mode == VisibilityMode.full_name:
        return name
    if visibility_mode == VisibilityMode.first_name_only:
        return name.split()[0]
    # anonymous mode
    return "Anonymous"


async def _fetch_stats(db: AsyncSession, campaign: Campaign) -> CampaignStatsResponse:
    total_result = await db.execute(
        select(func.sum(Contributor.amount)).where(
            Contributor.campaign_id == campaign.id,
            Contributor.paid.is_(True),
        )
    )
    total = total_result.scalar_one_or_none() or Decimal("0")

    paid_count_result = await db.execute(
        select(func.count()).where(
            Contributor.campaign_id == campaign.id,
            Contributor.paid.is_(True),
        )
    )
    paid_count = paid_count_result.scalar_one()

    contributor_count_result = await db.execute(
        select(func.count()).where(Contributor.campaign_id == campaign.id)
    )
    contributor_count = contributor_count_result.scalar_one()

    latest_result = await db.execute(
        select(Contributor)
        .where(Contributor.campaign_id == campaign.id, Contributor.paid.is_(True))
        .order_by(nullslast(Contributor.paid_at.desc()))
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    latest_payer: Optional[str] = (
        _resolve_display_name(latest.name, latest.is_anonymous, campaign.visibility_mode)
        if latest
        else None
    )

    goal = campaign.goal_amount
    progress_pct = round(min(float(total / goal) * 100, 100.0), 2) if goal > 0 else 0.0

    return CampaignStatsResponse(
        total_raised=total,
        paid_count=paid_count,
        contributor_count=contributor_count,
        latest_payer_display_name=latest_payer,
        progress_pct=progress_pct,
    )


@router.get("/p/{slug}", response_model=PublicCampaignResponse)
async def public_campaign(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Campaign)
        .where(Campaign.slug == slug)
        .options(selectinload(Campaign.beneficiary))
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    contrib_result = await db.execute(
        select(Contributor)
        .where(Contributor.campaign_id == campaign.id)
        .order_by(Contributor.created_at.asc())
    )
    contributors = contrib_result.scalars().all()

    total_raised = sum(
        (c.amount for c in contributors if c.paid), start=Decimal("0")
    )
    paid_count = sum(1 for c in contributors if c.paid)

    public_contributors = [
        PublicContributorItem(
            display_name=_resolve_display_name(
                c.name, c.is_anonymous, campaign.visibility_mode
            ),
            amount=c.amount,
            paid=c.paid,
            paid_at=c.paid_at,
            message=c.message,
        )
        for c in contributors
    ]

    # Compute local-currency equivalents when payout_currency differs from collection currency
    collection_cur = str(campaign.collection_currency.value if campaign.collection_currency else campaign.currency)
    payout_cur = str(campaign.payout_currency.value) if campaign.payout_currency else None

    goal_amount_local: Optional[Decimal] = None
    total_raised_local: Optional[Decimal] = None
    if payout_cur and payout_cur != collection_cur:
        goal_amount_local = await fx_convert(campaign.goal_amount, collection_cur, payout_cur)
        total_raised_local = await fx_convert(total_raised, collection_cur, payout_cur)

    return PublicCampaignResponse(
        slug=campaign.slug,
        title=campaign.title,
        description=campaign.description,
        emoji=campaign.emoji,
        campaign_type=campaign.campaign_type,
        goal_amount=campaign.goal_amount,
        contribution_note=campaign.contribution_note,
        due_date=campaign.due_date,
        amount_per_person=campaign.amount_per_person,
        currency=campaign.currency,
        collection_currency=collection_cur,
        payout_currency=payout_cur,
        goal_amount_local=goal_amount_local,
        total_raised_local=total_raised_local,
        allow_anonymous_contributions=campaign.allow_anonymous_contributions,
        total_raised=total_raised,
        contributor_count=len(contributors),
        paid_count=paid_count,
        contributors=public_contributors,
        status=campaign.status,
        zelle_info=campaign.zelle_info,
        cashapp_handle=campaign.cashapp_handle,
        beneficiary=campaign.beneficiary,
        event_date=campaign.event_date,
        event_time=campaign.event_time,
        event_location=campaign.event_location,
        event_rsvp=campaign.event_rsvp,
        party_color=campaign.party_color,
    )


@router.get("/p/{slug}/stats", response_model=CampaignStatsResponse)
async def campaign_stats(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return await _fetch_stats(db, campaign)


@router.get("/p/{slug}/share-card")
async def campaign_share_card(
    slug: str,
    milestone: int = Query(50, ge=25, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Return a milestone share card as a PNG image (cached for 10 min)."""
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    redis = await get_redis()
    cache_key = f"chipin:sharecard:{slug}:{milestone}"
    cached = await redis.get(cache_key)

    if cached:
        png_bytes = base64.b64decode(cached)
    else:
        total_result = await db.execute(
            select(func.sum(Contributor.amount)).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        total_raised = total_result.scalar_one_or_none() or Decimal("0")

        paid_result = await db.execute(
            select(func.count()).where(
                Contributor.campaign_id == campaign.id,
                Contributor.paid.is_(True),
            )
        )
        paid_count = paid_result.scalar_one()

        from app.workers.cards import generate_share_card

        campaign_type = (
            campaign.campaign_type.value
            if hasattr(campaign.campaign_type, "value")
            else str(campaign.campaign_type)
        )
        png_bytes = await asyncio.to_thread(
            generate_share_card,
            title=campaign.title,
            emoji=campaign.emoji or "🎯",
            campaign_type=campaign_type,
            milestone_pct=milestone,
            total_raised=float(total_raised),
            currency=campaign.currency,
            goal_amount=float(campaign.goal_amount),
            paid_count=paid_count,
        )
        await redis.set(cache_key, base64.b64encode(png_bytes).decode(), ex=600)

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=600"},
    )


@router.get("/p/{slug}/stream")
async def campaign_stream(slug: str, request: Request):
    # Use a short-lived session only for the initial campaign lookup.
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Campaign).where(Campaign.slug == slug))
        campaign = result.scalar_one_or_none()

    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    campaign_id = str(campaign.id)

    if not sse_manager.can_connect(campaign_id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Too many live connections for this campaign",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        redis = await get_redis()
        pubsub = redis.pubsub()
        channel = f"chipin:campaign:{campaign_id}"
        await pubsub.subscribe(channel)

        queue: asyncio.Queue[str] = asyncio.Queue()

        async def _reader() -> None:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await queue.put(message["data"])

        reader_task = asyncio.create_task(_reader())
        sse_manager.register(campaign_id)

        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"event: campaign_update\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ":\n\n"
        finally:
            reader_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reader_task
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
            sse_manager.unregister(campaign_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/p/{slug}/join", response_model=JoinCampaignResponse, status_code=status.HTTP_201_CREATED)
async def join_campaign(
    slug: str,
    body: JoinCampaignRequest,
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != CampaignStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Campaign is not accepting new contributors.",
        )

    # Duplicate check by phone
    dup_result = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == body.phone,
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already on this campaign.",
        )

    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        amount=campaign.amount_per_person or Decimal("0"),
        added_by_organizer=False,
    )
    db.add(contributor)
    await db.commit()
    await db.refresh(contributor)

    # Notify organizer via WhatsApp (fire-and-forget ARQ task)
    owner_result = await db.execute(select(User).where(User.id == campaign.owner_id))
    owner = owner_result.scalar_one_or_none()
    if owner and owner.phone and campaign.whatsapp_reminders_enabled:
        await arq.enqueue_job(
            "notify_organizer_whatsapp",
            organizer_phone=owner.phone,
            message=f"{body.name} just added themselves to {campaign.title}.",
        )

    return JoinCampaignResponse(
        contributor_id=contributor.id,
        message="You have been added!",
    )


@router.post("/p/{slug}/manual-pay", response_model=JoinCampaignResponse, status_code=status.HTTP_201_CREATED)
async def manual_pay(
    slug: str,
    body: ManualPayRequest,
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    """Contributor self-reports a Zelle or CashApp payment. Organizer confirms in dashboard."""
    from app.models.contributor import PaidVia

    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != CampaignStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Campaign is not accepting contributions.")

    if body.method == "zelle" and not campaign.zelle_info:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zelle is not configured for this campaign.")
    if body.method == "cashapp" and not campaign.cashapp_handle:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CashApp is not configured for this campaign.")

    try:
        paid_via = PaidVia(body.method)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment method.")

    dup_result = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == body.phone,
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already on this campaign.")

    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        amount=body.amount,
        paid=False,
        paid_via=paid_via,
        added_by_organizer=False,
        is_anonymous=body.is_anonymous,
    )
    db.add(contributor)
    await db.commit()
    await db.refresh(contributor)

    owner_result = await db.execute(select(User).where(User.id == campaign.owner_id))
    owner = owner_result.scalar_one_or_none()
    if owner and owner.phone and campaign.whatsapp_reminders_enabled:
        method_label = "Zelle" if body.method == "zelle" else "CashApp"
        await arq.enqueue_job(
            "notify_organizer_whatsapp",
            organizer_phone=owner.phone,
            message=(
                f"{body.name} says they sent {campaign.currency} {body.amount:.2f} "
                f"via {method_label} to '{campaign.title}'. Confirm in your dashboard."
            ),
        )

    return JoinCampaignResponse(
        contributor_id=contributor.id,
        message="Thanks! The organizer will confirm your payment shortly.",
    )


@router.post("/p/{slug}/rsvp", response_model=JoinCampaignResponse, status_code=status.HTTP_201_CREATED)
async def rsvp(
    slug: str,
    body: RsvpRequest,
    db: AsyncSession = Depends(get_db),
    arq=Depends(get_arq),
):
    """Guest self-RSVPs to an invitation-only celebration campaign."""
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != CampaignStatus.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This event is no longer accepting RSVPs.")

    # Duplicate check by phone (if provided)
    if body.phone:
        dup_result = await db.execute(
            select(Contributor).where(
                Contributor.campaign_id == campaign.id,
                Contributor.phone == body.phone,
            )
        )
        if dup_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You're already on the guest list!")

    contributor = Contributor(
        campaign_id=campaign.id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        amount=0,
        paid=False,
        added_by_organizer=False,
        is_anonymous=False,
        payment_note=body.note,
    )
    db.add(contributor)
    await db.commit()
    await db.refresh(contributor)

    owner_result = await db.execute(select(User).where(User.id == campaign.owner_id))
    owner = owner_result.scalar_one_or_none()
    if owner and owner.phone and campaign.whatsapp_reminders_enabled:
        await arq.enqueue_job(
            "notify_organizer_whatsapp",
            organizer_phone=owner.phone,
            message=f"{body.name} just RSVPd to {campaign.title}!",
        )

    return JoinCampaignResponse(
        contributor_id=contributor.id,
        message="You're on the guest list!",
    )


@router.get("/p/{slug}/check-membership", response_model=MembershipResponse)
async def check_membership(
    slug: str,
    phone: str = Query(..., description="Phone number to check"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Campaign).where(Campaign.slug == slug))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    contrib_result = await db.execute(
        select(Contributor).where(
            Contributor.campaign_id == campaign.id,
            Contributor.phone == phone,
        )
    )
    contributor = contrib_result.scalar_one_or_none()
    if not contributor:
        return MembershipResponse(is_member=False)

    return MembershipResponse(
        is_member=True,
        contributor_id=contributor.id,
        paid=contributor.paid,
    )
