from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="ChipIn API",
    description="Group contribution and fundraising platform by KafoTech",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "chipin-api"}
