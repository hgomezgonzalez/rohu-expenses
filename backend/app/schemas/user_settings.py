from pydantic import BaseModel


class UserSettingsUpdate(BaseModel):
    # SMTP
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None  # plain text in request, encrypted in DB
    smtp_from_email: str | None = None
    smtp_tls: bool | None = None

    # Telegram
    telegram_bot_token: str | None = None  # plain text in request, encrypted in DB
    telegram_chat_id: str | None = None

    # Toggles
    email_enabled: bool | None = None
    telegram_enabled: bool | None = None

    # Schedule
    notification_hour: int | None = None
    notification_minute: int | None = None

    # Pay cycle
    pay_cycle_start_day: int | None = None


class UserSettingsResponse(BaseModel):
    # SMTP (password masked)
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password_set: bool  # true if password is configured, never expose actual value
    smtp_from_email: str
    smtp_tls: bool

    # Telegram (token masked)
    telegram_bot_token_set: bool  # true if token is configured
    telegram_chat_id: str

    # Toggles
    email_enabled: bool
    telegram_enabled: bool

    # Schedule
    notification_hour: int
    notification_minute: int

    # Pay cycle
    pay_cycle_start_day: int | None
