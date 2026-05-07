from fastapi import APIRouter

from app.api.v1 import auth, campaigns, contributors, orgs, payments, public, payouts, recurring, susu, templates, users, webhooks

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(campaigns.router)
api_router.include_router(contributors.router)
api_router.include_router(orgs.router)
api_router.include_router(orgs.public_router)
api_router.include_router(payments.router)
api_router.include_router(public.router)
api_router.include_router(payouts.users_router)
api_router.include_router(payouts.campaigns_router)
api_router.include_router(recurring.router)
api_router.include_router(susu.router)
api_router.include_router(susu.public_router)
api_router.include_router(templates.router)
api_router.include_router(users.router)
api_router.include_router(webhooks.router)
