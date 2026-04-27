from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "rohu-paycontrol"
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "change-me-to-a-random-secret-key"
    api_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://paycontrol:paycontrol@localhost:5432/paycontrol"
    database_url_sync: str = "postgresql://paycontrol:paycontrol@localhost:5432/paycontrol"
    db_schema: str = "public"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = "change-me-to-a-random-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # File Storage
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 5
    allowed_file_types: str = "image/jpeg,image/png,application/pdf"
    image_max_width: int = 1200
    image_quality: int = 80

    # Email
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@paycontrol.local"
    smtp_from_name: str = "ROHU PayControl"
    smtp_tls: bool = False

    # Notifications
    notification_quiet_hours_start: int = 22
    notification_quiet_hours_end: int = 7

    # Telegram
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Google Drive (for attachment storage)
    gdrive_client_id: str = ""
    gdrive_client_secret: str = ""
    gdrive_refresh_token: str = ""
    gdrive_folder_id: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # WebAuthn / Passkeys (biometric login)
    # RP_ID must match the domain (without scheme/port). Use "localhost" for local dev.
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "ROHU PayControl"
    # Comma-separated list of allowed origins. Must include scheme.
    webauthn_origins: str = "http://localhost:3000"
    # Challenge state token TTL (seconds) — short-lived JWT used to round-trip the
    # WebAuthn challenge between options and verify endpoints (stateless, no Redis dep).
    webauthn_challenge_ttl_seconds: int = 300

    @property
    def allowed_file_types_list(self) -> list[str]:
        return [t.strip() for t in self.allowed_file_types.split(",")]

    @property
    def webauthn_origins_list(self) -> list[str]:
        return [o.strip() for o in self.webauthn_origins.split(",") if o.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
