import logging

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_magic_link(email: str, token: str) -> str | None:
    """Send magic link email. Returns the link string (always) for dev fallback use."""
    link = f"{settings.FRONTEND_URL}/auth/verify?token={token}"

    if not settings.MAIL_USERNAME:
        logger.warning("MAIL_USERNAME not set — magic link (dev only): %s", link)
        return link  # caller can surface this in the response

    body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Your ChipIn login link ⚽</h2>
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
    mail_conf = ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )
    message = MessageSchema(
        subject="Your ChipIn login link",
        recipients=[email],
        body=body,
        subtype=MessageType.html,
    )
    fm = FastMail(mail_conf)
    await fm.send_message(message)
    return None
