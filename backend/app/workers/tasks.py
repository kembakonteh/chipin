import httpx
from arq.connections import RedisSettings

from app.core.config import settings


async def notify_organizer_whatsapp(
    ctx,
    *,
    organizer_phone: str,
    message: str,
) -> None:
    if not settings.META_WHATSAPP_TOKEN or not settings.META_PHONE_NUMBER_ID:
        return
    url = f"https://graph.facebook.com/v18.0/{settings.META_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": organizer_phone,
        "type": "text",
        "text": {"body": message},
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.META_WHATSAPP_TOKEN}"},
            timeout=10,
        )
        resp.raise_for_status()


class WorkerSettings:
    functions = [notify_organizer_whatsapp]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    job_timeout = 30
