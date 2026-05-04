from fastapi import APIRouter

from app.api.v1 import auth, campaigns, contributors, public

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(campaigns.router)
api_router.include_router(contributors.router)
api_router.include_router(public.router)
