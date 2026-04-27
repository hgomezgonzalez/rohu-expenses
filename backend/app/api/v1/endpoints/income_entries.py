import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.schemas.income_entry import (
    IncomeEntryCreate,
    IncomeEntryConfirm,
    IncomeEntryUpdate,
    IncomeEntryResponse,
    IncomeGenerateResult,
)
from app.services.income_service import (
    generate_income_entries,
    generate_income_entries_for_cycle,
    get_income_entries,
    get_income_entries_by_cycle,
    create_one_time_entry,
    confirm_income_entry,
    update_income_entry,
    delete_income_entry,
)

router = APIRouter(prefix="/income-entries", tags=["income-entries"])


def _parse_ref_date(ref_date: str | None) -> date:
    if not ref_date:
        return date.today()
    try:
        return date.fromisoformat(ref_date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ref_date debe ser YYYY-MM-DD")


@router.post("/generate", response_model=IncomeGenerateResult)
async def generate_entries(
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    mode: str | None = Query(default=None, pattern="^(month|cycle)$"),
    ref_date: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate income entries from active income source templates. Idempotent.

    Two modes:
    - month (default): generate for a specific year/month.
    - cycle: generate for every calendar month touched by the user's pay cycle.
    """
    if mode == "cycle":
        result = await generate_income_entries_for_cycle(db, user.id, _parse_ref_date(ref_date))
    else:
        if year is None or month is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="year/month requeridos en modo month")
        result = await generate_income_entries(db, user.id, year, month)
    return IncomeGenerateResult(
        generated=result["generated"],
        skipped=result["skipped"],
        entries=[IncomeEntryResponse.model_validate(e) for e in result["entries"]],
    )


@router.get("", response_model=list[IncomeEntryResponse])
async def list_entries(
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    mode: str | None = Query(default=None, pattern="^(month|cycle)$"),
    ref_date: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List income entries.

    - month (default, requires year/month): entries with that calendar year+month.
    - cycle (requires ref_date or uses today): entries whose entry_date falls
      within the user's pay cycle window. Falls back to month if no cycle
      is configured. Auto-generates missing entries before reading.
    """
    if mode == "cycle":
        entries = await get_income_entries_by_cycle(db, user.id, _parse_ref_date(ref_date))
    else:
        if year is None or month is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="year/month requeridos en modo month")
        entries = await get_income_entries(db, user.id, year, month)
    return entries


@router.post("", response_model=IncomeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: IncomeEntryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a one-time income entry (no template)."""
    entry = await create_one_time_entry(db, user.id, data)
    return entry


@router.patch("/{entry_id}/confirm", response_model=IncomeEntryResponse)
async def confirm_entry(
    entry_id: uuid.UUID,
    data: IncomeEntryConfirm,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm an income entry with the actual amount received."""
    try:
        entry = await confirm_income_entry(db, user.id, entry_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return entry


@router.patch("/{entry_id}", response_model=IncomeEntryResponse)
async def update_entry(
    entry_id: uuid.UUID,
    data: IncomeEntryUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        entry = await update_income_entry(db, user.id, entry_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_income_entry(db, user.id, entry_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
