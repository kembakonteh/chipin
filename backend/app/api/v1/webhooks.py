"""
Webhook receivers for external providers.
  - POST /webhooks/meta   — Meta WhatsApp Cloud API delivery receipts
"""

import hashlib
import hmac
import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


def _verify_meta_signature(body: bytes, sig_header: str) -> bool:
    """Return True if X-Hub-Signature-256 matches the payload HMAC."""
    if not settings.META_APP_SECRET:
        logger.warning("META_APP_SECRET not configured — skipping Meta signature check")
        return True  # pass-through in unconfigured environments
    if not sig_header.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.META_APP_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    received = sig_header[len("sha256="):]
    return hmac.compare_digest(expected, received)


@router.get("/webhooks/meta")
async def meta_webhook_verify(request: Request):
    """
    Meta webhook verification handshake (GET).
    Meta sends mode=subscribe, challenge, verify_token.
    """
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and params.get("hub.verify_token") == settings.META_VERIFY_TOKEN
    ):
        return int(params["hub.challenge"])
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/webhooks/meta", status_code=status.HTTP_200_OK)
async def meta_webhook_receive(request: Request):
    """
    Receive Meta WhatsApp Cloud API status updates (sent/delivered/read/failed).
    Signature-verified; events are logged for observability.
    Phase 1: log only — no DB writes.
    """
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")

    if not _verify_meta_signature(body, sig):
        logger.warning("Meta webhook: invalid signature — rejecting")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature",
        )

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed JSON body",
        )

    # Walk entries → changes → statuses
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for status_update in value.get("statuses", []):
                msg_id   = status_update.get("id")
                wa_state = status_update.get("status")   # sent | delivered | read | failed
                recipient = status_update.get("recipient_id")
                timestamp  = status_update.get("timestamp")

                if wa_state == "failed":
                    errors = status_update.get("errors", [])
                    logger.error(
                        "WhatsApp delivery FAILED — msg=%s to=%s ts=%s errors=%s",
                        msg_id, recipient, timestamp, errors,
                    )
                else:
                    logger.info(
                        "WhatsApp status=%s msg=%s to=%s ts=%s",
                        wa_state, msg_id, recipient, timestamp,
                    )

    return {"received": True}
