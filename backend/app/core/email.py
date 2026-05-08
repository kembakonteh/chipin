import logging
from decimal import Decimal

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


def _fmt_amount(amount: Decimal, currency: str) -> str:
    if currency.upper() == "USD":
        return f"${amount:.2f}"
    return f"{currency.upper()} {amount:.2f}"


async def send_magic_link(email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/auth/landing?token={token}"

    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — magic link printed to console (dev only)")
        logger.info("Magic link for %s: %s", email, link)
        return

    resend.api_key = settings.RESEND_API_KEY

    body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Your ChipIn login link</h2>
      <p>Click the button below to sign in. This link expires in 15 minutes.</p>
      <p>
        <a href="{link}"
           style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          Sign in to ChipIn
        </a>
      </p>
      <p style="color:#888;font-size:12px">
        If you didn't request this, you can safely ignore it.
      </p>
    </div>
    """

    resend.Emails.send({
        "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
        "to": [email],
        "subject": "Your ChipIn login link",
        "html": body,
    })


async def send_payment_confirmation_email(
    *,
    email: str,
    payer_name: str,
    amount: Decimal,
    currency: str,
    campaign_title: str,
    campaign_slug: str,
) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning(
            "RESEND_API_KEY not set — skipping payment confirmation email to %s", email
        )
        return

    resend.api_key = settings.RESEND_API_KEY
    amount_str = _fmt_amount(amount, currency)
    campaign_url = f"{settings.FRONTEND_URL}/p/{campaign_slug}"

    body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#16a34a">Payment received ✓</h2>
      <p>Hi {payer_name},</p>
      <p>
        Your payment of <strong>{amount_str}</strong> to
        <strong>{campaign_title}</strong> was received.
        Thank you for chipping in!
      </p>
      <p>
        <a href="{campaign_url}"
           style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:bold">
          View campaign
        </a>
      </p>
      <p style="color:#888;font-size:12px">
        Powered by ChipIn &middot; kafotech.io
      </p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>",
            "to": [email],
            "subject": f"Payment received — {campaign_title}",
            "html": body,
        })
    except Exception as exc:
        logger.error("Failed to send payment confirmation email to %s: %s", email, exc)
