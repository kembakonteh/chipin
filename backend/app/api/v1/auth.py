import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.email import send_magic_link
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    create_magic_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User
from app.schemas.auth import MagicLinkRequest, RefreshRequest, TokenResponse, VerifyRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/send-link", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def send_link(
    request: Request,
    body: MagicLinkRequest,
    db: AsyncSession = Depends(get_db),
):
    token = create_magic_token(body.email)
    await send_magic_link(body.email, token)
    return {"message": "Magic link sent. Check your email."}


@router.post("/verify", response_model=TokenResponse)
@limiter.limit("20/minute")
async def verify(
    request: Request,
    body: VerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        email = decode_token(body.token, "magic")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link. Please request a new one.",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(email=email, name=email.split("@")[0])
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        user_id = decode_token(body.refresh_token, "refresh")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
