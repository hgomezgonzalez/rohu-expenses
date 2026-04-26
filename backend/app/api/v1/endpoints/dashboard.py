from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, BudgetVarianceResponse, CashflowForecast, DashboardFull
from app.services import dashboard_service
from app.services.bill_service import update_bill_statuses

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/full", response_model=DashboardFull)
async def get_full_dashboard(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single endpoint that returns summary + cashflow + bills. Reduces API calls from 3 to 1."""
    await update_bill_statuses(db, user.id)
    return await dashboard_service.get_full_dashboard(db, user.id, year, month)


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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_budget_variance(db, user.id, year, month)


@router.get("/cashflow", response_model=CashflowForecast)
async def get_cashflow(
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_cashflow_forecast(db, user.id, year, month)
