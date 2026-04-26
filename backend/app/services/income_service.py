"""Service for managing monthly income entries."""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.income_source import IncomeSource
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.schemas.income_entry import (
    IncomeEntryCreate,
    IncomeEntryConfirm,
    IncomeEntryUpdate,
)


async def generate_income_entries(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> dict:
    """Generate income entries from active income sources for a given month. Idempotent."""
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.income_type == "recurring",
        )
    )
    sources = list(result.scalars().all())

    generated = 0
    skipped = 0
    entries = []

    for source in sources:
        # Idempotency: check if entry already exists for this source+period
        existing = await db.execute(
            select(IncomeEntry).where(
                IncomeEntry.income_source_id == source.id,
                IncomeEntry.year == year,
                IncomeEntry.month == month,
            )
        )
        if existing.scalars().first():
            skipped += 1
            continue

        entry = IncomeEntry(
            income_source_id=source.id,
            user_id=user_id,
            year=year,
            month=month,
            name=source.name,
            expected_amount=source.amount,
            status=IncomeEntryStatus.EXPECTED.value,
            is_one_time=False,
        )
        db.add(entry)
        entries.append(entry)
        generated += 1

    await db.flush()
    for entry in entries:
        await db.refresh(entry)

    return {"generated": generated, "skipped": skipped, "entries": entries}


async def get_income_entries(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> list[IncomeEntry]:
    result = await db.execute(
        select(IncomeEntry)
        .where(
            IncomeEntry.user_id == user_id,
            IncomeEntry.year == year,
            IncomeEntry.month == month,
        )
        .order_by(IncomeEntry.name)
    )
    return list(result.scalars().all())


async def get_income_entry(
    db: AsyncSession, entry_id: uuid.UUID, user_id: uuid.UUID
) -> IncomeEntry | None:
    result = await db.execute(
        select(IncomeEntry).where(
            IncomeEntry.id == entry_id,
            IncomeEntry.user_id == user_id,
        )
    )
    return result.scalars().first()


async def create_one_time_entry(
    db: AsyncSession, user_id: uuid.UUID, data: IncomeEntryCreate
) -> IncomeEntry:
    """Create a one-time income entry (no template)."""
    entry = IncomeEntry(
        income_source_id=None,
        user_id=user_id,
        year=data.year,
        month=data.month,
        name=data.name,
        expected_amount=data.expected_amount,
        status=IncomeEntryStatus.EXPECTED.value,
        is_one_time=True,
        notes=data.notes,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def confirm_income_entry(
    db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID, data: IncomeEntryConfirm
) -> IncomeEntry:
    """Confirm an income entry with actual amount received."""
    entry = await get_income_entry(db, entry_id, user_id)
    if not entry:
        raise ValueError("Income entry not found")
    if entry.status == IncomeEntryStatus.CONFIRMED.value:
        raise ValueError("Income entry is already confirmed")

    entry.actual_amount = data.actual_amount
    entry.status = IncomeEntryStatus.CONFIRMED.value
    entry.received_at = data.received_at or date.today()
    if data.notes is not None:
        entry.notes = data.notes

    await db.flush()
    await db.refresh(entry)
    return entry


async def update_income_entry(
    db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID, data: IncomeEntryUpdate
) -> IncomeEntry:
    entry = await get_income_entry(db, entry_id, user_id)
    if not entry:
        raise ValueError("Income entry not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    await db.flush()
    await db.refresh(entry)
    return entry


async def delete_income_entry(
    db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID
) -> None:
    entry = await get_income_entry(db, entry_id, user_id)
    if not entry:
        raise ValueError("Income entry not found")
    await db.delete(entry)
    await db.flush()


async def update_expected_amount_on_source_change(
    db: AsyncSession, source: IncomeSource, new_amount: Decimal
) -> int:
    """When a source's amount changes, update expected entries for current month."""
    today = date.today()
    result = await db.execute(
        select(IncomeEntry).where(
            IncomeEntry.income_source_id == source.id,
            IncomeEntry.year == today.year,
            IncomeEntry.month == today.month,
            IncomeEntry.status == IncomeEntryStatus.EXPECTED.value,
        )
    )
    entry = result.scalars().first()
    if entry:
        entry.expected_amount = new_amount
        await db.flush()
        return 1
    return 0
