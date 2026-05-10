from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import settings

TokenType = Literal["magic", "access", "refresh", "invite"]

_MAGIC_EXPIRE_MINUTES = 15
_INVITE_EXPIRE_DAYS = 30


def _make_token(subject: str, token_type: TokenType, expires_delta: timedelta) -> str:
    payload = {
        "sub": subject,
        "type": token_type,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_magic_token(email: str) -> str:
    return _make_token(email, "magic", timedelta(minutes=_MAGIC_EXPIRE_MINUTES))


def create_access_token(user_id: str) -> str:
    return _make_token(
        user_id, "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )


def create_refresh_token(user_id: str) -> str:
    return _make_token(
        user_id, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


def create_invite_token(contributor_id: str, campaign_slug: str) -> str:
    return _make_token(
        f"{contributor_id}:{campaign_slug}", "invite", timedelta(days=_INVITE_EXPIRE_DAYS)
    )


def decode_invite_token(token: str) -> tuple[str, str]:
    """Returns (contributor_id, campaign_slug) or raises ValueError."""
    sub = decode_token(token, "invite")
    parts = sub.split(":", 1)
    if len(parts) != 2:
        raise ValueError("Invalid invite token subject")
    return parts[0], parts[1]


def decode_token(token: str, expected_type: TokenType) -> str:
    """Decode and validate a JWT. Returns the subject (email or user_id) or raises ValueError."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError as exc:
        raise ValueError(str(exc)) from exc
    if payload.get("type") != expected_type:
        raise ValueError("Invalid token type")
    sub = payload.get("sub")
    if not sub:
        raise ValueError("Token missing subject")
    return sub
