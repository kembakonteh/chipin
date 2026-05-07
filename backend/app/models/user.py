from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.user_features import UserFeatures


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_account_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    campaigns: Mapped[List["Campaign"]] = relationship("Campaign", back_populates="owner")
    features: Mapped[Optional["UserFeatures"]] = relationship(
        "UserFeatures", back_populates="user", uselist=False
    )
