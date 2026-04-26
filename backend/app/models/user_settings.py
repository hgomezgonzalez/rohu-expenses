import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    # SMTP
    smtp_host: Mapped[str] = mapped_column(String(255), default="")
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_user: Mapped[str] = mapped_column(String(255), default="")
    smtp_password_encrypted: Mapped[str] = mapped_column(String(500), default="")
    smtp_from_email: Mapped[str] = mapped_column(String(255), default="")
    smtp_tls: Mapped[bool] = mapped_column(Boolean, default=True)

    # Telegram
    telegram_bot_token_encrypted: Mapped[str] = mapped_column(String(500), default="")
    telegram_chat_id: Mapped[str] = mapped_column(String(100), default="")

    # Notification preferences
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_hour: Mapped[int] = mapped_column(Integer, default=8)
    notification_minute: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", backref="settings")
