import uuid
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.campaign import CampaignType, VisibilityMode


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    campaign_type: CampaignType
    emoji: str
    description_template: str
    default_amount_per_person: Optional[Decimal]
    default_visibility_mode: VisibilityMode
    default_anonymous: bool
    whatsapp_share_text_template: str
    sort_order: int
