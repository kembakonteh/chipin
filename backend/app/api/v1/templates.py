from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.template import CampaignTemplate
from app.schemas.template import TemplateResponse

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    """Return all active campaign templates sorted by sort_order."""
    result = await db.execute(
        select(CampaignTemplate)
        .where(CampaignTemplate.is_active.is_(True))
        .order_by(CampaignTemplate.sort_order)
    )
    return result.scalars().all()
