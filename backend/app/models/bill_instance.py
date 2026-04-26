import uuid
import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    String, Integer, Date, DateTime, ForeignKey, Numeric, Enum, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BillStatus(str, enum.Enum):
    PENDING = "pending"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    PAID = "paid"
    CANCELLED = "cancelled"


class BillInstance(Base):
    __tablename__ = "bill_instances"
    __table_args__ = (
        UniqueConstraint("bill_template_id", "year", "month", name="uq_bill_instance_template_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bill_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bill_templates.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[BillStatus] = mapped_column(
        Enum(BillStatus), default=BillStatus.PENDING, index=True
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    template = relationship("BillTemplate", back_populates="instances")
    category = relationship("Category", lazy="joined")
    payments = relationship("Payment", back_populates="bill_instance", lazy="selectin")
