import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.models.org import OrgMemberRole, OrgType


class OrgCreate(BaseModel):
    name: str
    description: Optional[str] = None
    org_type: OrgType = OrgType.community
    phone: Optional[str] = None
    whatsapp_group_name: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    org_type: Optional[OrgType] = None
    phone: Optional[str] = None
    whatsapp_group_name: Optional[str] = None


class OrgMemberCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    role: OrgMemberRole = OrgMemberRole.member


class OrgMemberUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[OrgMemberRole] = None
    is_active: Optional[bool] = None


class OrgMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    name: str
    phone: Optional[str]
    email: Optional[str]
    role: OrgMemberRole
    is_active: bool
    joined_at: Optional[datetime]
    # Payment stats — enriched by query, default 0
    total_campaigns: int = 0
    paid_campaigns: int = 0


class OrgResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: Optional[str]
    description: Optional[str]
    logo_url: Optional[str]
    org_type: Optional[OrgType]
    owner_id: uuid.UUID
    phone: Optional[str]
    whatsapp_group_name: Optional[str]
    created_at: datetime
    member_count: int = 0


class CampaignBrief(BaseModel):
    slug: str
    title: str


class CampaignBriefWithPaid(BaseModel):
    slug: str
    title: str
    paid: bool


class AddMembersResponse(BaseModel):
    members: List[OrgMemberResponse]
    active_campaigns: List[CampaignBrief]


class UpdateMemberResponse(BaseModel):
    member: OrgMemberResponse
    on_active_campaigns: List[CampaignBriefWithPaid]


class OrgStatsResponse(BaseModel):
    total_raised: Decimal
    total_campaigns: int
    active_campaigns: int


class ContributorBrief(BaseModel):
    contributor_id: uuid.UUID
    name: str
    phone: Optional[str]
    paid: bool


class OrgMemberBrief(BaseModel):
    member_id: uuid.UUID
    name: str
    phone: Optional[str]
    email: Optional[str]


class MembershipStatusResponse(BaseModel):
    on_campaign_not_in_org: List[ContributorBrief]
    in_org_not_on_campaign: List[OrgMemberBrief]
    deactivated_on_campaign: List[ContributorBrief]


class CsvImportResponse(BaseModel):
    imported: int
    skipped: int


class MemberCampaignRecord(BaseModel):
    campaign_slug: str
    campaign_title: str
    campaign_emoji: str
    campaign_created_at: datetime
    amount_expected: Decimal
    paid: bool
    paid_via: Optional[str] = None
    paid_at: Optional[datetime] = None
    amount_paid: Optional[Decimal] = None


class MemberHistoryResponse(BaseModel):
    member_id: uuid.UUID
    member_name: str
    member_phone: Optional[str]
    total: int
    paid: int
    campaigns: List[MemberCampaignRecord]


class PublicOrgCampaign(BaseModel):
    slug: str
    title: str
    emoji: str
    status: str
    total_raised: Decimal
    goal_amount: Decimal
    paid_count: int


class PublicOrgResponse(BaseModel):
    name: str
    slug: str
    description: Optional[str]
    logo_url: Optional[str]
    org_type: Optional[OrgType]
    whatsapp_group_name: Optional[str]
    active_campaigns: List[PublicOrgCampaign]
    past_campaigns: List[PublicOrgCampaign]
    stats: OrgStatsResponse


class InviteTokenResponse(BaseModel):
    invite_token: str
    invite_url: str


class PublicOrgInviteResponse(BaseModel):
    org_name: str
    description: Optional[str]
    member_count: int
    slug: str


class JoinOrgResponse(BaseModel):
    message: str
    org_slug: str
