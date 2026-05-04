import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, computed_field

from app.models.campaign import CampaignType, VisibilityMode
from app.models.contributor import PaidVia


class ContributorCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    amount: Optional[Decimal] = None  # defaults to campaign.amount_per_person
    is_anonymous: bool = False


class ContributorUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    paid_via: Optional[PaidVia] = None
    is_anonymous: Optional[bool] = None


class MarkPaidRequest(BaseModel):
    paid_via: PaidVia
    is_anonymous: Optional[bool] = None


class ContributorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    phone: Optional[str]
    email: Optional[str]
    amount: Decimal
    paid: bool
    paid_via: Optional[PaidVia]
    paid_at: Optional[datetime]
    added_by_organizer: bool
    is_anonymous: bool
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def privacy_note(self) -> Optional[str]:
        if self.is_anonymous:
            return "Contributor requested privacy - shown as Anonymous publicly."
        return None


# --- Public-facing schemas (names resolved) ---

class PublicContributorItem(BaseModel):
    display_name: str
    amount: Decimal
    paid: bool
    paid_at: Optional[datetime]


class JoinCampaignRequest(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None


class JoinCampaignResponse(BaseModel):
    contributor_id: uuid.UUID
    message: str


class MembershipResponse(BaseModel):
    is_member: bool
    contributor_id: Optional[uuid.UUID] = None
    paid: Optional[bool] = None


# --- Org sync schemas ---

class OrgMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: Optional[str]
    email: Optional[str]


class SyncOrgMembersRequest(BaseModel):
    member_ids: list[uuid.UUID]


class SyncOrgMembersResponse(BaseModel):
    added: int
