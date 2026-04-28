import logging
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.bill_instance import BillInstance, BillStatus
from app.models.payment import Payment
from app.models.category import Category
from app.models.income_source import IncomeSource
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.schemas.dashboard import (
    DashboardSummary,
    DashboardFull,
    BudgetVarianceItem,
    BudgetVarianceResponse,
    CashflowForecast,
    IncomeBreakdown,
    IncomeVarianceItem,
    IncomeVarianceSummary,
)
from app.schemas.bill import BillInstanceResponse, CategoryResponse
from app.schemas.income_entry import IncomeEntryResponse
from app.services.bill_service import generate_monthly_bills, update_bill_statuses
from app.services.income_service import entry_date as income_entry_date, generate_income_entries

logger = logging.getLogger(__name__)


async def _get_monthly_income(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> tuple[Decimal, Decimal, Decimal, list[IncomeBreakdown], list[IncomeEntry]]:
    """Get monthly income data. Returns (total, confirmed, expected, breakdown, entries).

    If income_entries exist for the month, uses those.
    Otherwise falls back to income_sources templates (for current/future months).
    """
    result = await db.execute(
        select(IncomeEntry).where(
            IncomeEntry.user_id == user_id,
            IncomeEntry.year == year,
            IncomeEntry.month == month,
        )
    )
    entries = list(result.scalars().all())

    if entries:
        total = Decimal("0")
        confirmed = Decimal("0")
        expected = Decimal("0")
        breakdown = []

        for e in entries:
            if e.status == IncomeEntryStatus.CANCELLED.value:
                continue
            effective = e.actual_amount if e.actual_amount is not None else e.expected_amount
            total += effective
            if e.status == IncomeEntryStatus.CONFIRMED.value:
                confirmed += e.actual_amount or Decimal("0")
            else:
                expected += e.expected_amount
            breakdown.append(IncomeBreakdown(
                source_id=str(e.income_source_id) if e.income_source_id else None,
                source_name=e.name,
                expected_amount=e.expected_amount,
                actual_amount=e.actual_amount,
                effective_amount=effective,
                status=e.status,
                is_one_time=e.is_one_time,
            ))

        return total, confirmed, expected, breakdown, entries

    # Fallback: use income_sources templates (current/future months without entries)
    today = date.today()
    is_past = (year < today.year) or (year == today.year and month < today.month)
    if is_past:
        return Decimal("0"), Decimal("0"), Decimal("0"), [], []

    result = await db.execute(
        select(IncomeSource).where(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
        )
    )
    sources = list(result.scalars().all())
    total = sum(s.amount for s in sources)
    breakdown = [
        IncomeBreakdown(
            source_id=str(s.id),
            source_name=s.name,
            expected_amount=s.amount,
            actual_amount=None,
            effective_amount=s.amount,
            status="template_fallback",
            is_one_time=False,
        )
        for s in sources
    ]

    return total, Decimal("0"), total, breakdown, []


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
    db: AsyncSession,
    user_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
    *,
    cycle_start: date | None = None,
    cycle_end: date | None = None,
) -> BudgetVarianceResponse:
    """Budget vs actual by category.

    Two windowing modes:
    - Calendar month: pass `year` and `month`. Filters by BillInstance.year/month.
    - Pay cycle: pass `cycle_start` and `cycle_end` (inclusive). Filters by
      BillInstance.due_date between the two dates so the variance matches the
      ciclo de pago view shown in dashboard/income.
    """
    where_clauses = [BillInstance.user_id == user_id]
    if cycle_start is not None and cycle_end is not None:
        # Same single-source-of-truth for cycle mode as the dashboard.
        await _ensure_cycle_bills(db, user_id, cycle_start, cycle_end)
        where_clauses += [
            BillInstance.due_date >= cycle_start,
            BillInstance.due_date <= cycle_end,
        ]
    else:
        if year is None or month is None:
            raise ValueError("get_budget_variance requires either (year, month) or (cycle_start, cycle_end)")
        where_clauses += [BillInstance.year == year, BillInstance.month == month]

    # Get all bill instances grouped by category
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(*where_clauses)
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

    # When called in cycle mode, derive a representative year/month from the
    # cycle's end date so the response payload remains valid and the income
    # summary covers the cycle's anchor month.
    if cycle_start is not None and cycle_end is not None:
        if year is None:
            year = cycle_end.year
        if month is None:
            month = cycle_end.month

    # Income variance summary
    total_income, income_confirmed, income_expected, breakdown, _ = await _get_monthly_income(
        db, user_id, year, month
    )
    income_sources_variance = []
    for b in breakdown:
        actual = b.actual_amount if b.actual_amount is not None else Decimal("0")
        income_sources_variance.append(IncomeVarianceItem(
            source_name=b.source_name,
            expected_amount=b.expected_amount,
            actual_amount=b.actual_amount,
            variance_amount=actual - b.expected_amount if b.actual_amount is not None else Decimal("0"),
            status=b.status,
        ))

    income_summary = IncomeVarianceSummary(
        total_expected=income_expected + income_confirmed,
        total_confirmed=income_confirmed,
        total_variance=income_confirmed - (income_expected + income_confirmed) if income_confirmed else Decimal("0"),
        sources=income_sources_variance,
    )

    return BudgetVarianceResponse(
        year=year,
        month=month,
        total_budget=total_budget,
        total_actual=total_actual,
        total_variance=total_budget - total_actual,
        items=items,
        income_summary=income_summary,
    )


async def get_cashflow_forecast(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> CashflowForecast:
    total_income, income_confirmed, income_expected, breakdown, _ = await _get_monthly_income(
        db, user_id, year, month
    )

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
        income_confirmed=income_confirmed,
        income_expected=income_expected,
        income_breakdown=breakdown,
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

    # Income from entries (1 extra query)
    total_income, income_confirmed, income_expected, breakdown, entries = await _get_monthly_income(
        db, user_id, year, month
    )
    cf_pending = total_pending + total_overdue
    projected = total_income - total_paid_amount - cf_pending

    cashflow = CashflowForecast(
        year=year, month=month, total_income=total_income,
        income_confirmed=income_confirmed, income_expected=income_expected,
        income_breakdown=breakdown,
        total_paid=total_paid_amount, total_pending=cf_pending,
        projected_balance=projected, is_negative=projected < 0,
    )

    income_responses = [IncomeEntryResponse.model_validate(e) for e in entries]

    return DashboardFull(
        summary=summary, cashflow=cashflow,
        income_entries=income_responses, bills=all_bills,
    )


def _calendar_months_touched(cycle_start: date, cycle_end: date) -> list[tuple[int, int]]:
    """Return [(year, month), ...] for every calendar month touched by the cycle window."""
    months: list[tuple[int, int]] = []
    d = date(cycle_start.year, cycle_start.month, 1)
    while d <= cycle_end:
        months.append((d.year, d.month))
        d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
    return months


async def _ensure_cycle_bills(
    db: AsyncSession, user_id: uuid.UUID, cycle_start: date, cycle_end: date
) -> None:
    """Idempotently create the bill_instances backing this cycle.

    Mirrors the auto-generate already done for income_entries inside
    get_full_dashboard_by_cycle. Without this, brand-new users who only ever
    enter cycle mode would see an empty dashboard despite having templates.
    """
    for y, m in _calendar_months_touched(cycle_start, cycle_end):
        try:
            await generate_monthly_bills(db, user_id, y, m)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Auto-generate bills failed (cycle %s-%s): %s", y, m, exc)
    # Reclassify any newly-created instances to OVERDUE / DUE_SOON / PENDING.
    try:
        await update_bill_statuses(db, user_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("update_bill_statuses after cycle generate failed: %s", exc)


async def get_full_dashboard_by_cycle(
    db: AsyncSession, user_id: uuid.UUID, cycle_start: date, cycle_end: date
) -> DashboardFull:
    """Dashboard filtered by pay cycle date range instead of calendar month."""
    # Ensure bills exist for every calendar month the cycle touches.
    await _ensure_cycle_bills(db, user_id, cycle_start, cycle_end)

    # Bills within the cycle window
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.due_date >= cycle_start,
            BillInstance.due_date <= cycle_end,
        )
        .order_by(BillInstance.due_date)
    )
    instances = list(result.scalars().unique().all())

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

    # Income: only include entries whose day_of_month falls within the cycle range
    import calendar as cal
    months_in_cycle = set()
    d = cycle_start
    while d <= cycle_end:
        months_in_cycle.add((d.year, d.month))
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)

    total_income = Decimal("0")
    income_confirmed = Decimal("0")
    income_expected = Decimal("0")
    breakdown = []
    all_income_entries = []

    for y, m in sorted(months_in_cycle):
        # Auto-generate missing entries first (idempotent — only creates ones
        # that don't yet exist) so the cycle view is the same source of truth
        # used by /income. Wrapped defensively: if generation fails, we still
        # try to read whatever is in DB and the template fallback below kicks in.
        try:
            await generate_income_entries(db, user_id, y, m)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Auto-generate income entries failed (cycle dashboard): %s", exc)

        # Get entries for this month
        result_inc = await db.execute(
            select(IncomeEntry).where(
                IncomeEntry.user_id == user_id,
                IncomeEntry.year == y,
                IncomeEntry.month == m,
            )
        )
        entries = list(result_inc.scalars().all())

        if entries:
            for e in entries:
                if e.status == IncomeEntryStatus.CANCELLED.value:
                    continue
                # Single source of truth shared with income_service so the
                # dashboard cycle and /income agree on cycle membership.
                # In particular this honors received_at for one-time entries.
                e_date = income_entry_date(e)

                # Only include if entry date falls within cycle
                if cycle_start <= e_date <= cycle_end:
                    effective = e.actual_amount if e.actual_amount is not None else e.expected_amount
                    total_income += effective
                    if e.status == IncomeEntryStatus.CONFIRMED.value:
                        income_confirmed += e.actual_amount or Decimal("0")
                    else:
                        income_expected += e.expected_amount
                    breakdown.append(IncomeBreakdown(
                        source_id=str(e.income_source_id) if e.income_source_id else None,
                        source_name=e.name,
                        expected_amount=e.expected_amount,
                        actual_amount=e.actual_amount,
                        effective_amount=effective,
                        status=e.status,
                        is_one_time=e.is_one_time,
                    ))
                    all_income_entries.append(e)
        else:
            # Fallback: use income_sources templates, filtered by day_of_month
            result_src = await db.execute(
                select(IncomeSource).where(
                    IncomeSource.user_id == user_id,
                    IncomeSource.is_active == True,
                )
            )
            for s in result_src.scalars().all():
                last_day = cal.monthrange(y, m)[1]
                source_date = date(y, m, min(s.day_of_month, last_day))
                if cycle_start <= source_date <= cycle_end:
                    total_income += s.amount
                    income_expected += s.amount
                    breakdown.append(IncomeBreakdown(
                        source_id=str(s.id),
                        source_name=s.name,
                        expected_amount=s.amount,
                        actual_amount=None,
                        effective_amount=s.amount,
                        status="template_fallback",
                        is_one_time=False,
                    ))

    cf_pending = total_pending + total_overdue
    projected = total_income - total_paid_amount - cf_pending

    cashflow = CashflowForecast(
        year=cycle_start.year, month=cycle_start.month, total_income=total_income,
        income_confirmed=income_confirmed, income_expected=income_expected,
        income_breakdown=breakdown,
        total_paid=total_paid_amount, total_pending=cf_pending,
        projected_balance=projected, is_negative=projected < 0,
    )

    income_responses = [IncomeEntryResponse.model_validate(e) for e in all_income_entries]

    return DashboardFull(
        summary=summary, cashflow=cashflow,
        income_entries=income_responses, bills=all_bills,
    )
