import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_magic_link(email: str, token: str) -> None:
    link = f"{settings.FRONTEND_URL}/auth/verify?token={token}"

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
