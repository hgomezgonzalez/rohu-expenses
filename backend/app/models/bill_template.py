import uuid
import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import String, Integer, DateTime, ForeignKey, Numeric, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RecurrenceType(str, enum.Enum):
    MONTHLY = "monthly"
    BIMONTHLY = "bimonthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"


class BillTemplate(Base):
    __tablename__ = "bill_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    estimated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_day_of_month: Mapped[int] = mapped_column(Integer, nullable=False)
    # Anchor month for non-monthly recurrences (1-12). When NULL, fall back to
    # the legacy default (annual = January, semiannual = Jan+Jul, etc.).
    due_month_of_year: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    recurrence_type: Mapped[RecurrenceType] = mapped_column(
        Enum(RecurrenceType), default=RecurrenceType.MONTHLY
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="bill_templates")
    category = relationship("Category", lazy="joined")
    instances = relationship("BillInstance", back_populates="template", lazy="selectin")
    notification_rules = relationship("NotificationRule", back_populates="bill_template", lazy="selectin")
