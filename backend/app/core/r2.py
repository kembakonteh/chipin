"""Cloudflare R2 upload utility (async wrapper around boto3)."""

import asyncio
import logging
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _client


def _upload_bytes_sync(key: str, data: bytes, content_type: str) -> str:
    client = _get_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Body=BytesIO(data),
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )
    return f"{settings.R2_PUBLIC_URL}/{key}"


async def upload_bytes(key: str, data: bytes, content_type: str) -> str:
    """Upload raw bytes to R2 and return the public URL. Returns '' if unconfigured."""
    if not settings.R2_ACCOUNT_ID or not settings.R2_ACCESS_KEY_ID or not settings.R2_PUBLIC_URL:
        logger.warning("R2 not fully configured — skipping upload for %s", key)
        return ""
    try:
        return await asyncio.to_thread(_upload_bytes_sync, key, data, content_type)
    except Exception as exc:
        logger.error("R2 upload failed for %s: %s", key, exc)
        return ""
