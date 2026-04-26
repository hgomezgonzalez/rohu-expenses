import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NotificationChannel(str, enum.Enum):
    EMAIL = "email"
    PUSH = "push"
    WHATSAPP = "whatsapp"
    SMS = "sms"


class NotificationRule(Base):
    __tablename__ = "notification_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bill_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bill_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    remind_days_before: Mapped[str] = mapped_column(
        String(100), default="7,3,1,0", nullable=False
    )  # comma-separated: "7,3,1,0" means 7, 3, 1 days before and on due date
    remind_overdue_daily: Mapped[bool] = mapped_column(Boolean, default=True)
    channels: Mapped[str] = mapped_column(
        String(100), default="email,push", nullable=False
    )  # comma-separated channels
    extra_emails: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # comma-separated emails for distribution list
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    bill_template = relationship("BillTemplate", back_populates="notification_rules")

    @property
    def remind_days_list(self) -> list[int]:
        return [int(d.strip()) for d in self.remind_days_before.split(",") if d.strip()]

    @property
    def channels_list(self) -> list[str]:
        return [c.strip() for c in self.channels.split(",") if c.strip()]

    @property
    def extra_emails_list(self) -> list[str]:
        if not self.extra_emails:
            return []
        return [e.strip() for e in self.extra_emails.split(",") if e.strip()]
