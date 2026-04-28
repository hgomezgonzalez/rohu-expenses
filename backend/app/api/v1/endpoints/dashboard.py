from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pay_cycle import get_pay_cycle, navigate_pay_cycle
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.dashboard import DashboardSummary, BudgetVarianceResponse, CashflowForecast, DashboardFull
from app.services import dashboard_service
from app.services.bill_service import update_bill_statuses

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/full", response_model=DashboardFull)
async def get_full_dashboard(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    mode: str = Query(default="calendar"),
    ref_date: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single endpoint that returns summary + cashflow + bills.
    mode=calendar (default): filter by year/month.
    mode=cycle: filter by user's pay cycle around ref_date."""
    await update_bill_statuses(db, user.id)

    if mode == "cycle":
        # Get user's pay cycle config
        us_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user.id)
        )
        us = us_result.scalars().first()
        if not us or not us.pay_cycle_start_day:
            return await dashboard_service.get_full_dashboard(db, user.id, year, month)

        ref = date.fromisoformat(ref_date) if ref_date else date.today()
        cycle = get_pay_cycle(us.pay_cycle_start_day, ref)
        cycle_start = date.fromisoformat(cycle["start_date"])
        cycle_end = date.fromisoformat(cycle["end_date"])
        return await dashboard_service.get_full_dashboard_by_cycle(db, user.id, cycle_start, cycle_end)

    return await dashboard_service.get_full_dashboard(db, user.id, year, month)


@router.get("/pay-cycle")
async def get_current_pay_cycle(
    ref_date: str | None = Query(default=None),
    delta: int = Query(default=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's current pay cycle window. delta=-1/+1 to navigate."""
    us_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    us = us_result.scalars().first()
    if not us or not us.pay_cycle_start_day:
        return {"configured": False}

    ref = date.fromisoformat(ref_date) if ref_date else date.today()
    if delta != 0:
        cycle = navigate_pay_cycle(us.pay_cycle_start_day, ref, delta)
    else:
        cycle = get_pay_cycle(us.pay_cycle_start_day, ref)
    cycle["configured"] = True
    return cycle


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_dashboard_summary(db, user.id, year, month)


@router.get("/budget-variance", response_model=BudgetVarianceResponse)
async def get_budget_variance(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    mode: str = Query(default="calendar"),
    ref_date: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Budget vs actual.

    mode=calendar (default): filter by year/month.
    mode=cycle: filter by user's pay cycle around ref_date so the response
                matches the dashboard cycle view.
    """
    if mode == "cycle":
        us_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == user.id)
        )
        us = us_result.scalars().first()
        if not us or not us.pay_cycle_start_day:
            return await dashboard_service.get_budget_variance(db, user.id, year, month)

        ref = date.fromisoformat(ref_date) if ref_date else date.today()
        cycle = get_pay_cycle(us.pay_cycle_start_day, ref)
        cycle_start = date.fromisoformat(cycle["start_date"])
        cycle_end = date.fromisoformat(cycle["end_date"])
        return await dashboard_service.get_budget_variance(
            db, user.id, cycle_start=cycle_start, cycle_end=cycle_end,
        )
    return await dashboard_service.get_budget_variance(db, user.id, year, month)


@router.get("/cashflow", response_model=CashflowForecast)
async def get_cashflow(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_cashflow_forecast(db, user.id, year, month)
