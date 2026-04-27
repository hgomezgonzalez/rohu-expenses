"""Service for managing monthly income entries."""

import calendar
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pay_cycle import get_pay_cycle
from app.models.income_source import IncomeSource
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.models.user_settings import UserSettings
from app.schemas.income_entry import (
    IncomeEntryCreate,
    IncomeEntryConfirm,
    IncomeEntryUpdate,
)

logger = logging.getLogger(__name__)


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


async def _get_pay_cycle_start_day(db: AsyncSession, user_id: uuid.UUID) -> int | None:
    """Return the user's configured pay cycle day, or None if calendar-month mode."""
    result = await db.execute(
        select(UserSettings.pay_cycle_start_day).where(UserSettings.user_id == user_id)
    )
    return result.scalar_one_or_none()


def _months_in_cycle(cycle_start: date, cycle_end: date) -> list[tuple[int, int]]:
    """Return [(year, month), ...] for every calendar month touched by the cycle."""
    months: list[tuple[int, int]] = []
    d = date(cycle_start.year, cycle_start.month, 1)
    while d <= cycle_end:
        months.append((d.year, d.month))
        d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return months


def _entry_date(entry: IncomeEntry) -> date:
    """The calendar date this income entry represents.

    Uses the source's day_of_month when available; for one-time entries with no
    source, uses received_at (if confirmed) or the 1st of the entry's month.
    """
    if entry.income_source is not None:
        day = entry.income_source.day_of_month
    elif entry.received_at is not None:
        return entry.received_at
    else:
        day = 1
    last_day = calendar.monthrange(entry.year, entry.month)[1]
    return date(entry.year, entry.month, min(day, last_day))


async def generate_income_entries_for_cycle(
    db: AsyncSession, user_id: uuid.UUID, ref_date: date
) -> dict:
    """Idempotently generate entries for both calendar months touched by the user's pay cycle.

    Falls back to the calendar-month behavior if no cycle is configured.
    """
    start_day = await _get_pay_cycle_start_day(db, user_id)
    if not start_day:
        return await generate_income_entries(db, user_id, ref_date.year, ref_date.month)

    cycle = get_pay_cycle(start_day, ref_date)
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])

    total_generated = 0
    total_skipped = 0
    entries: list[IncomeEntry] = []
    for y, m in _months_in_cycle(cycle_start, cycle_end):
        result = await generate_income_entries(db, user_id, y, m)
        total_generated += result["generated"]
        total_skipped += result["skipped"]
        entries.extend(result["entries"])
    return {"generated": total_generated, "skipped": total_skipped, "entries": entries}


async def get_income_entries_by_cycle(
    db: AsyncSession, user_id: uuid.UUID, ref_date: date, auto_generate: bool = True
) -> list[IncomeEntry]:
    """Return entries whose entry_date falls within the user's current pay cycle.

    If no pay cycle is configured, behaves like get_income_entries for the
    ref_date's calendar month. Auto-generates missing entries to ensure the
    /income view never appears empty when income_sources templates exist.
    """
    start_day = await _get_pay_cycle_start_day(db, user_id)
    if not start_day:
        if auto_generate:
            try:
                await generate_income_entries(db, user_id, ref_date.year, ref_date.month)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Auto-generate income entries failed: %s", exc)
        return await get_income_entries(db, user_id, ref_date.year, ref_date.month)

    cycle = get_pay_cycle(start_day, ref_date)
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])

    if auto_generate:
        try:
            for y, m in _months_in_cycle(cycle_start, cycle_end):
                await generate_income_entries(db, user_id, y, m)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Auto-generate income entries failed (cycle): %s", exc)

    months = _months_in_cycle(cycle_start, cycle_end)
    if not months:
        return []
    year_months = [(y, m) for (y, m) in months]
    or_filter = None
    from sqlalchemy import or_, and_
    or_filter = or_(*[and_(IncomeEntry.year == y, IncomeEntry.month == m) for (y, m) in year_months])

    result = await db.execute(
        select(IncomeEntry)
        .where(IncomeEntry.user_id == user_id, or_filter)
        .order_by(IncomeEntry.name)
    )
    raw = list(result.scalars().all())
    return [e for e in raw if cycle_start <= _entry_date(e) <= cycle_end]


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
