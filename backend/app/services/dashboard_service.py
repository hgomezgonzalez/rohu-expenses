import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.bill_instance import BillInstance, BillStatus
from app.models.payment import Payment
from app.models.category import Category
from app.models.income_source import IncomeSource
from app.schemas.dashboard import (
    DashboardSummary,
    DashboardFull,
    BudgetVarianceItem,
    BudgetVarianceResponse,
    CashflowForecast,
)
from app.schemas.bill import BillInstanceResponse, CategoryResponse


async def get_dashboard_summary(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> DashboardSummary:
    # Get all bill instances for the month with their payments
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.year == year,
            BillInstance.month == month,
        )
        .order_by(BillInstance.due_date)
    )
    instances = list(result.scalars().unique().all())

    overdue_bills = []
    due_soon_bills = []
    upcoming_bills = []
    total_pending = Decimal("0")
    total_paid = Decimal("0")
    total_overdue = Decimal("0")
    count_pending = 0
    count_paid = 0
    count_overdue = 0
    count_due_soon = 0

    for inst in instances:
        paid_amount = sum(p.amount for p in inst.payments) if inst.payments else Decimal("0")
        bill_resp = BillInstanceResponse(
            id=inst.id,
            bill_template_id=inst.bill_template_id,
            category=CategoryResponse.model_validate(inst.category),
            year=inst.year,
            month=inst.month,
            name=inst.name,
            expected_amount=inst.expected_amount,
            due_date=inst.due_date,
            status=inst.status,
            notes=inst.notes,
            paid_at=inst.paid_at,
            total_paid=paid_amount,
            created_at=inst.created_at,
        )

        if inst.status == BillStatus.PAID:
            total_paid += paid_amount
            count_paid += 1
        elif inst.status == BillStatus.OVERDUE:
            total_overdue += inst.expected_amount
            count_overdue += 1
            overdue_bills.append(bill_resp)
        elif inst.status == BillStatus.DUE_SOON:
            total_pending += inst.expected_amount
            count_due_soon += 1
            due_soon_bills.append(bill_resp)
        else:  # PENDING
            total_pending += inst.expected_amount
            count_pending += 1
            upcoming_bills.append(bill_resp)

    return DashboardSummary(
        total_pending=total_pending + total_overdue,
        total_paid=total_paid,
        total_overdue=total_overdue,
        count_pending=count_pending,
        count_paid=count_paid,
        count_overdue=count_overdue,
        count_due_soon=count_due_soon,
        overdue_bills=overdue_bills,
        due_soon_bills=due_soon_bills,
        upcoming_bills=upcoming_bills,
    )


async def get_budget_variance(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> BudgetVarianceResponse:
    # Get all bill instances grouped by category
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.year == year,
            BillInstance.month == month,
        )
    )
    instances = list(result.scalars().unique().all())

    # Group by category
    category_data: dict[str, dict] = {}
    for inst in instances:
        cat_slug = inst.category.slug
        if cat_slug not in category_data:
            category_data[cat_slug] = {
                "category_name": inst.category.name,
                "category_slug": cat_slug,
                "budget_amount": Decimal("0"),
                "actual_paid": Decimal("0"),
            }
        category_data[cat_slug]["budget_amount"] += inst.expected_amount
        if inst.payments:
            category_data[cat_slug]["actual_paid"] += sum(p.amount for p in inst.payments)

    items = []
    total_budget = Decimal("0")
    total_actual = Decimal("0")

    for data in category_data.values():
        variance = data["budget_amount"] - data["actual_paid"]
        pct = (
            (variance / data["budget_amount"] * 100)
            if data["budget_amount"] > 0
            else Decimal("0")
        )
        items.append(
            BudgetVarianceItem(
                category_name=data["category_name"],
                category_slug=data["category_slug"],
                budget_amount=data["budget_amount"],
                actual_paid=data["actual_paid"],
                variance_amount=variance,
                variance_percentage=round(pct, 1),
            )
        )
        total_budget += data["budget_amount"]
        total_actual += data["actual_paid"]

    # Sort by absolute variance descending (biggest deviations first)
    items.sort(key=lambda x: abs(x.variance_amount), reverse=True)

    return BudgetVarianceResponse(
        year=year,
        month=month,
        total_budget=total_budget,
        total_actual=total_actual,
        total_variance=total_budget - total_actual,
        items=items,
    )


async def get_cashflow_forecast(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> CashflowForecast:
    # Get income sources
    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
        )
    )
    income_sources = result.scalars().all()
    total_income = sum(s.amount for s in income_sources)

    # Get bill instances with payments
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.year == year,
            BillInstance.month == month,
            BillInstance.status != BillStatus.CANCELLED,
        )
    )
    instances = list(result.scalars().unique().all())

    total_paid = Decimal("0")
    total_pending = Decimal("0")

    for inst in instances:
        paid = sum(p.amount for p in inst.payments) if inst.payments else Decimal("0")
        if inst.status == BillStatus.PAID:
            total_paid += paid
        else:
            total_pending += inst.expected_amount

    projected_balance = total_income - total_paid - total_pending

    return CashflowForecast(
        year=year,
        month=month,
        total_income=total_income,
        total_paid=total_paid,
        total_pending=total_pending,
        projected_balance=projected_balance,
        is_negative=projected_balance < 0,
    )


async def get_full_dashboard(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> DashboardFull:
    """Single query-optimized call that returns summary + cashflow + all bills."""
    # Load all instances with payments and categories in ONE query
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.year == year,
            BillInstance.month == month,
        )
        .order_by(BillInstance.due_date)
    )
    instances = list(result.scalars().unique().all())

    # Build summary from the same data (no extra queries)
    overdue_bills, due_soon_bills, upcoming_bills = [], [], []
    total_pending, total_paid_amount, total_overdue = Decimal("0"), Decimal("0"), Decimal("0")
    count_pending, count_paid, count_overdue, count_due_soon = 0, 0, 0, 0
    all_bills = []

    for inst in instances:
        paid = sum(p.amount for p in inst.payments) if inst.payments else Decimal("0")
        bill_resp = BillInstanceResponse(
            id=inst.id, bill_template_id=inst.bill_template_id,
            category=CategoryResponse.model_validate(inst.category),
            year=inst.year, month=inst.month, name=inst.name,
            expected_amount=inst.expected_amount, due_date=inst.due_date,
            status=inst.status, notes=inst.notes, paid_at=inst.paid_at,
            total_paid=paid, created_at=inst.created_at,
        )
        all_bills.append(bill_resp)

        if inst.status == BillStatus.PAID:
            total_paid_amount += paid; count_paid += 1
        elif inst.status == BillStatus.OVERDUE:
            total_overdue += inst.expected_amount; count_overdue += 1; overdue_bills.append(bill_resp)
        elif inst.status == BillStatus.DUE_SOON:
            total_pending += inst.expected_amount; count_due_soon += 1; due_soon_bills.append(bill_resp)
        else:
            total_pending += inst.expected_amount; count_pending += 1; upcoming_bills.append(bill_resp)

    summary = DashboardSummary(
        total_pending=total_pending + total_overdue, total_paid=total_paid_amount,
        total_overdue=total_overdue, count_pending=count_pending, count_paid=count_paid,
        count_overdue=count_overdue, count_due_soon=count_due_soon,
        overdue_bills=overdue_bills, due_soon_bills=due_soon_bills, upcoming_bills=upcoming_bills,
    )

    # Cashflow from same data + income (1 extra query)
    inc_result = await db.execute(
        select(IncomeSource).where(IncomeSource.user_id == user_id, IncomeSource.is_active == True)
    )
    total_income = sum(s.amount for s in inc_result.scalars().all())
    cf_pending = total_pending + total_overdue
    projected = total_income - total_paid_amount - cf_pending

    cashflow = CashflowForecast(
        year=year, month=month, total_income=total_income,
        total_paid=total_paid_amount, total_pending=cf_pending,
        projected_balance=projected, is_negative=projected < 0,
    )

    return DashboardFull(summary=summary, cashflow=cashflow, bills=all_bills)
