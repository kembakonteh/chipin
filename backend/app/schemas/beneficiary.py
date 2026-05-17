import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class BeneficiaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    display_name: str
    photo_url: Optional[str]
    story: Optional[str]
    location: Optional[str]
    party_name: Optional[str]
    office_sought: Optional[str]
    party_name: Optional[str]
    office_sought: Optional[str]
    created_at: datetime
