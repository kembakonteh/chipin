"""
Payout provider abstraction.
Each provider implements initiate_transfer() and check_status().
"""
import logging
from abc import ABC, abstractmethod
from decimal import Decimal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class PayoutProvider(ABC):
    @abstractmethod
    async def initiate_transfer(
        self,
        amount: Decimal,
        currency: str,
        recipient: dict,
    ) -> str:
        """Initiate a transfer. Returns a provider reference string."""
        ...

    @abstractmethod
    async def check_status(self, reference: str) -> str:
        """Return one of: pending | processing | completed | failed."""
        ...


# ---------------------------------------------------------------------------
# Flutterwave — Nigeria + West Africa bank / mobile money transfers
# ---------------------------------------------------------------------------

class FlutterwaveProvider(PayoutProvider):
    _BASE = "https://api.flutterwave.com/v3"

    async def initiate_transfer(self, amount: Decimal, currency: str, recipient: dict) -> str:
        if not settings.FLUTTERWAVE_SECRET_KEY:
            logger.warning("FLUTTERWAVE_SECRET_KEY not set — using ManualProvider fallback")
            return ManualProvider().initiate_transfer.__func__(  # type: ignore[attr-defined]
                self, amount, currency, recipient
            )

        headers = {
            "Authorization": f"Bearer {settings.FLUTTERWAVE_SECRET_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "account_bank": recipient.get("bank_code", ""),
            "account_number": recipient["account_number"],
            "amount": float(amount),
            "currency": currency,
            "narration": recipient.get("narration", "ChipIn payout"),
            "reference": recipient.get("reference", ""),
            "beneficiary_name": recipient.get("account_name", ""),
            "meta": {"mobile_number": recipient.get("phone", "")},
        }

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    f"{self._BASE}/transfers", json=payload, headers=headers
                )
                data = resp.json()
                if data.get("status") == "success":
                    return str(data["data"]["id"])
                logger.error("Flutterwave transfer failed: %s", data)
                raise RuntimeError(data.get("message", "Flutterwave transfer failed"))
            except httpx.TimeoutException:
                raise RuntimeError("Flutterwave API timed out")

    async def check_status(self, reference: str) -> str:
        if not settings.FLUTTERWAVE_SECRET_KEY:
            return "pending"

        headers = {"Authorization": f"Bearer {settings.FLUTTERWAVE_SECRET_KEY}"}
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    f"{self._BASE}/transfers/{reference}", headers=headers
                )
                data = resp.json()
                fw_status = data.get("data", {}).get("status", "").lower()
                mapping = {
                    "new": "pending",
                    "pending": "pending",
                    "processing": "processing",
                    "successful": "completed",
                    "failed": "failed",
                }
                return mapping.get(fw_status, "pending")
            except Exception as exc:
                logger.warning("Flutterwave status check failed for %s: %s", reference, exc)
                return "pending"


# ---------------------------------------------------------------------------
# Wave — Gambia / Senegal mobile money
# ---------------------------------------------------------------------------

class WaveProvider(PayoutProvider):
    """Wave API (stub — fill in when Wave opens their B2B API)."""

    async def initiate_transfer(self, amount: Decimal, currency: str, recipient: dict) -> str:
        if not settings.WAVE_API_KEY:
            logger.info("WAVE_API_KEY not set — Wave transfer queued for manual processing")
            return f"WAVE-MANUAL-{recipient['account_number']}"

        # Placeholder: Wave B2B API endpoint when available
        headers = {
            "Authorization": f"Bearer {settings.WAVE_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "mobile": recipient["account_number"],
            "amount": float(amount),
            "currency": currency,
            "note": recipient.get("narration", "ChipIn payout"),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                resp = await client.post(
                    "https://api.wave.com/v1/transfers", json=payload, headers=headers
                )
                data = resp.json()
                if resp.status_code < 300:
                    return str(data.get("id", f"WAVE-{recipient['account_number']}"))
                raise RuntimeError(data.get("message", "Wave transfer failed"))
            except httpx.TimeoutException:
                raise RuntimeError("Wave API timed out")

    async def check_status(self, reference: str) -> str:
        if reference.startswith("WAVE-MANUAL-"):
            return "pending"
        if not settings.WAVE_API_KEY:
            return "pending"

        headers = {"Authorization": f"Bearer {settings.WAVE_API_KEY}"}
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    f"https://api.wave.com/v1/transfers/{reference}", headers=headers
                )
                data = resp.json()
                return data.get("status", "pending")
            except Exception as exc:
                logger.warning("Wave status check failed for %s: %s", reference, exc)
                return "pending"


# ---------------------------------------------------------------------------
# Manual — organizer marks payout done; always succeeds immediately
# ---------------------------------------------------------------------------

class ManualProvider(PayoutProvider):
    async def initiate_transfer(self, amount: Decimal, currency: str, recipient: dict) -> str:
        ref = f"MANUAL-{recipient.get('account_number', 'unknown')}"
        logger.info("Manual payout initiated: %s %s → %s", amount, currency, ref)
        return ref

    async def check_status(self, reference: str) -> str:
        return "completed"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_WAVE_NETWORKS = {"Wave", "Afrimoney", "QMoney", "Orange Money"}
_FW_NETWORKS = {"MTN Mobile Money", "Vodafone Cash", "Bank Transfer", "Flutterwave"}


def get_provider(network_name: str) -> PayoutProvider:
    """Return the right provider based on network name."""
    if network_name in _WAVE_NETWORKS:
        return WaveProvider()
    if network_name in _FW_NETWORKS:
        return FlutterwaveProvider()
    return ManualProvider()
