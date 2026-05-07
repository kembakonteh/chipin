from pydantic import BaseModel


class UserFeaturesResponse(BaseModel):
    campaigns_enabled: bool
    susu_enabled: bool
    org_enabled: bool
    onboarding_completed: bool

    model_config = {"from_attributes": True}


class UserFeaturesUpdate(BaseModel):
    campaigns: bool
    susu: bool
    org: bool
