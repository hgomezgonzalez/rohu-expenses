from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, PlainSerializer

from app.schemas.bill import BillInstanceResponse
from app.schemas.income_entry import IncomeEntryResponse

# Serialize Decimal as float for JSON (frontend expects numbers, not strings)
Num = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]


class DashboardSummary(BaseModel):
    total_pending: Num
    total_paid: Num
    total_overdue: Num
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
    budget_amount: Num
    actual_paid: Num
    variance_amount: Num
    variance_percentage: Num


class IncomeVarianceItem(BaseModel):
    source_name: str
    expected_amount: Num
    actual_amount: Num | None
    variance_amount: Num
    status: str


class IncomeVarianceSummary(BaseModel):
    total_expected: Num
    total_confirmed: Num
    total_variance: Num
    sources: list[IncomeVarianceItem]


class BudgetVarianceResponse(BaseModel):
    year: int
    month: int
    total_budget: Num
    total_actual: Num
    total_variance: Num
    items: list[BudgetVarianceItem]
    income_summary: IncomeVarianceSummary | None = None


class IncomeBreakdown(BaseModel):
    source_id: str | None
    source_name: str
    expected_amount: Num
    actual_amount: Num | None
    effective_amount: Num
    status: str
    is_one_time: bool


class CashflowForecast(BaseModel):
    year: int
    month: int
    total_income: Num
    income_confirmed: Num
    income_expected: Num
    income_breakdown: list[IncomeBreakdown]
    total_paid: Num
    total_pending: Num
    projected_balance: Num
    is_negative: bool


class DashboardFull(BaseModel):
    summary: DashboardSummary
    cashflow: CashflowForecast
    income_entries: list[IncomeEntryResponse]
    bills: list[BillInstanceResponse]
