"""
Exchange rate service — wraps ExchangeRate-API (free tier).
Rates are cached in Redis for 1 hour.
ENV: EXCHANGE_RATE_API_KEY
"""
import logging
from decimal import Decimal

import httpx

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

_TTL = 3600  # 1 hour


async def get_rate(from_currency: str, to_currency: str) -> Decimal:
    """Return the exchange rate from_currency → to_currency, cached 1 h."""
    if from_currency == to_currency:
        return Decimal("1")

    redis = await get_redis()
    cache_key = f"chipin:fx:{from_currency}:{to_currency}"
    cached = await redis.get(cache_key)
    if cached:
        return Decimal(cached)

    rate = await _fetch_rate(from_currency, to_currency)
    await redis.set(cache_key, str(rate), ex=_TTL)
    return rate


async def _fetch_rate(from_currency: str, to_currency: str) -> Decimal:
    if not settings.EXCHANGE_RATE_API_KEY:
        logger.warning("EXCHANGE_RATE_API_KEY not set — using 1.0 fallback")
        return Decimal("1")

    url = (
        f"https://v6.exchangerate-api.com/v6/{settings.EXCHANGE_RATE_API_KEY}"
        f"/pair/{from_currency}/{to_currency}"
    )
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url)
            data = resp.json()
            if data.get("result") == "success":
                return Decimal(str(data["conversion_rate"]))
            logger.error("ExchangeRate-API error: %s", data)
        except Exception as exc:
            logger.error("FX rate fetch failed (%s→%s): %s", from_currency, to_currency, exc)

    return Decimal("1")


async def convert(amount: Decimal, from_currency: str, to_currency: str) -> Decimal:
    """Convert amount from from_currency to to_currency."""
    rate = await get_rate(from_currency, to_currency)
    return (amount * rate).quantize(Decimal("0.01"))
