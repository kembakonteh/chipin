from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.user_features import UserFeatures
from app.schemas.user_features import UserFeaturesResponse, UserFeaturesUpdate

router = APIRouter(prefix="/users", tags=["users"])


class UserMeResponse(BaseModel):
    email: str
    name: str
    phone: Optional[str]


class UserMeUpdate(BaseModel):
    phone: Optional[str] = Field(None, max_length=50)

@router.get("/me", response_model=UserMeResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> UserMeResponse:
    return UserMeResponse(email=current_user.email, name=current_user.name, phone=current_user.phone)


@router.patch("/me", response_model=UserMeResponse)
async def update_me(
    body: UserMeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserMeResponse:
    if body.phone is not None:
        current_user.phone = body.phone.strip() or None
    await db.commit()
    return UserMeResponse(email=current_user.email, name=current_user.name, phone=current_user.phone)


_DEFAULTS = UserFeaturesResponse(
    campaigns_enabled=True,
    susu_enabled=False,
    org_enabled=False,
    onboarding_completed=False,
)


@router.get("/me/features", response_model=UserFeaturesResponse)
async def get_my_features(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserFeaturesResponse:
    result = await db.execute(
        select(UserFeatures).where(UserFeatures.user_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return _DEFAULTS
    return UserFeaturesResponse.model_validate(row)


@router.post("/me/features", response_model=UserFeaturesResponse)
async def save_my_features(
    body: UserFeaturesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserFeaturesResponse:
    if not body.campaigns and not body.susu and not body.org:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one feature must be enabled",
        )
    result = await db.execute(
        select(UserFeatures).where(UserFeatures.user_id == current_user.id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = UserFeatures(user_id=current_user.id)
        db.add(row)
    row.campaigns_enabled = body.campaigns
    row.susu_enabled = body.susu
    row.org_enabled = body.org
    row.onboarding_completed = True
    await db.commit()
    await db.refresh(row)
    return UserFeaturesResponse.model_validate(row)
