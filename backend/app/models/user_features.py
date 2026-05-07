import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class UserFeatures(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_features"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    campaigns_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    susu_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    org_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="features")
