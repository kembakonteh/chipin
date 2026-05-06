import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.user import User


class OrgType(str, enum.Enum):
    sports = "sports"
    religious = "religious"
    community = "community"
    professional = "professional"
    social = "social"


class OrgMemberRole(str, enum.Enum):
    admin = "admin"
    treasurer = "treasurer"
    member = "member"


class Org(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orgs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    org_type: Mapped[Optional[OrgType]] = mapped_column(
        Enum(OrgType, name="orgtype"), nullable=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    whatsapp_group_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    owner: Mapped["User"] = relationship("User")
    members: Mapped[List["OrgMember"]] = relationship("OrgMember", back_populates="org")
    campaigns: Mapped[List["Campaign"]] = relationship("Campaign", back_populates="org")


class OrgMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "org_members"

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orgs.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[OrgMemberRole] = mapped_column(
        Enum(OrgMemberRole, name="orgmemberrole"),
        nullable=False,
        default=OrgMemberRole.member,
        server_default="member",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    joined_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, server_default=func.now()
    )

    org: Mapped["Org"] = relationship("Org", back_populates="members")
