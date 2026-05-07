from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    META_WHATSAPP_TOKEN: str = ""
    META_PHONE_NUMBER_ID: str = ""
    META_APP_SECRET: str = ""       # App secret — used to verify X-Hub-Signature-256
    META_VERIFY_TOKEN: str = ""     # Arbitrary token set in Meta webhook config

    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "chipin"
    R2_PUBLIC_URL: str = ""  # e.g. https://pub-xxx.r2.dev or custom domain

    # Multi-currency / FX
    EXCHANGE_RATE_API_KEY: str = ""   # ExchangeRate-API v6 free key

    # Payout providers
    FLUTTERWAVE_SECRET_KEY: str = ""  # Flutterwave secret key (Nigeria + West Africa)
    WAVE_API_KEY: str = ""            # Wave B2B API key (Gambia/Senegal)

    FRONTEND_URL: str = "http://localhost:5173"
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Email (Resend)
    RESEND_API_KEY: str = ""
    MAIL_FROM: str = "noreply@chipin.kafotech.io"
    MAIL_FROM_NAME: str = "ChipIn"

    @property
    def origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
