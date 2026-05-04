from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ALGORITHM: str = "HS256"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    META_WHATSAPP_TOKEN: str = ""
    META_PHONE_NUMBER_ID: str = ""

    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "chipin"

    FRONTEND_URL: str = "http://localhost:5173"
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
