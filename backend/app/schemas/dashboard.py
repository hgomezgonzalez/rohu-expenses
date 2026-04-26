from decimal import Decimal

from pydantic import BaseModel

from app.schemas.bill import BillInstanceResponse


class DashboardSummary(BaseModel):
    total_pending: Decimal
    total_paid: Decimal
    total_overdue: Decimal
    count_pending: int
    count_paid: int
    count_overdue: int
    count_due_soon: int
    overdue_bills: list[BillInstanceResponse]
    due_soon_bills: list[BillInstanceResponse]
    upcoming_bills: list[BillInstanceResponse]


class BudgetVarianceItem(BaseModel):
    category_name: str
    category_slug: str
    budget_amount: Decimal
    actual_paid: Decimal
    variance_amount: Decimal
    variance_percentage: Decimal


class BudgetVarianceResponse(BaseModel):
    year: int
    month: int
    total_budget: Decimal
    total_actual: Decimal
    total_variance: Decimal
    items: list[BudgetVarianceItem]


class CashflowForecast(BaseModel):
    year: int
    month: int
    total_income: Decimal
    total_paid: Decimal
    total_pending: Decimal
    projected_balance: Decimal
    is_negative: bool


class DashboardFull(BaseModel):
    summary: DashboardSummary
    cashflow: CashflowForecast
    bills: list[BillInstanceResponse]
