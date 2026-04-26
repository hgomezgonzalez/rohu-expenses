import uuid
import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    String, Integer, Date, DateTime, ForeignKey, Numeric, Boolean,
    UniqueConstraint, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class IncomeEntryStatus(str, enum.Enum):
    EXPECTED = "expected"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class IncomeEntry(Base):
    __tablename__ = "income_entries"
    __table_args__ = (
        UniqueConstraint(
            "income_source_id", "year", "month",
            name="uq_income_entry_source_period",
        ),
        CheckConstraint("year BETWEEN 2020 AND 2100", name="ck_income_entry_year"),
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_income_entry_month"),
        CheckConstraint("expected_amount >= 0", name="ck_income_entry_expected_amount"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    income_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("income_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    actual_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default=IncomeEntryStatus.EXPECTED.value, nullable=False
    )
    is_one_time: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    received_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unconfirmed_reminder_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    income_source = relationship("IncomeSource", back_populates="entries", lazy="joined")
    user = relationship("User", back_populates="income_entries")
