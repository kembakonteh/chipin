import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign


class Beneficiary(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "beneficiaries"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    story: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    party_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    office_sought: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="beneficiary")
