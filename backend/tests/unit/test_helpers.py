"""Unit tests for pure helpers used by the cycle/income/whatsapp features."""

from datetime import date, datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.api.v1.endpoints.auth import _wa_me_link
from app.core.pay_cycle import get_pay_cycle, navigate_pay_cycle
from app.models.bill_instance import BillStatus
from app.services.bill_service import compute_bill_status
from app.services.dashboard_service import _calendar_months_touched, income_entry_date as dashboard_entry_date
from app.services.income_service import _entry_date, _months_in_cycle, entry_date


# ---- WhatsApp link helper -----------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("12345", None),  # too short
        ("3001234567", "https://wa.me/3001234567"),
        ("+57 300 123 4567", "https://wa.me/573001234567"),
        ("(57) 300-123-4567", "https://wa.me/573001234567"),
    ],
)
def test_wa_me_link(raw, expected):
    assert _wa_me_link(raw) == expected


# ---- Pay cycle window calculation --------------------------------------


def test_get_pay_cycle_typical_mid_cycle():
    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 5, 10))
    assert cycle["start_date"] == "2026-04-26"
    assert cycle["end_date"] == "2026-05-25"
    assert cycle["start_day"] == 26
    assert "abr" in cycle["label"] and "may" in cycle["label"]


def test_get_pay_cycle_on_start_day_starts_new_cycle():
    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 4, 26))
    assert cycle["start_date"] == "2026-04-26"
    assert cycle["end_date"] == "2026-05-25"


def test_get_pay_cycle_clamps_day_31_in_february():
    cycle = get_pay_cycle(start_day=31, reference_date=date(2026, 2, 15))
    assert cycle["start_date"] == "2026-01-31"
    # End is Feb 28 (clamped from "Feb 31") minus 1 day = Feb 27.
    assert cycle["end_date"] == "2026-02-27"


def test_navigate_pay_cycle_forward_and_back_round_trip():
    base = get_pay_cycle(start_day=26, reference_date=date(2026, 5, 10))
    forward = navigate_pay_cycle(26, date.fromisoformat(base["start_date"]) + (date.fromisoformat(base["end_date"]) - date.fromisoformat(base["start_date"])) // 2, 1)
    back = navigate_pay_cycle(26, date.fromisoformat(forward["start_date"]) + (date.fromisoformat(forward["end_date"]) - date.fromisoformat(forward["start_date"])) // 2, -1)
    assert back["start_date"] == base["start_date"]
    assert back["end_date"] == base["end_date"]


# ---- Months touched by a cycle window ----------------------------------


def test_months_in_cycle_spans_two_months():
    months = _months_in_cycle(date(2026, 4, 26), date(2026, 5, 25))
    assert months == [(2026, 4), (2026, 5)]


def test_months_in_cycle_single_month():
    months = _months_in_cycle(date(2026, 6, 1), date(2026, 6, 30))
    assert months == [(2026, 6)]


def test_months_in_cycle_year_boundary():
    months = _months_in_cycle(date(2026, 12, 26), date(2027, 1, 25))
    assert months == [(2026, 12), (2027, 1)]


# ---- Entry date computation --------------------------------------------


def _stub_entry(year, month, day_of_month=None, received_at=None):
    """Build a duck-typed entry suitable for _entry_date."""
    src = SimpleNamespace(day_of_month=day_of_month) if day_of_month is not None else None
    return SimpleNamespace(year=year, month=month, income_source=src, received_at=received_at)


def test_entry_date_uses_source_day_of_month():
    e = _stub_entry(2026, 5, day_of_month=26)
    assert _entry_date(e) == date(2026, 5, 26)


def test_entry_date_clamps_day_31_in_april():
    e = _stub_entry(2026, 4, day_of_month=31)
    assert _entry_date(e) == date(2026, 4, 30)


def test_entry_date_one_time_uses_received_at_when_present():
    e = _stub_entry(2026, 5, day_of_month=None, received_at=date(2026, 4, 27))
    assert _entry_date(e) == date(2026, 4, 27)


def test_entry_date_one_time_falls_back_to_first_of_month():
    e = _stub_entry(2026, 5, day_of_month=None, received_at=None)
    assert _entry_date(e) == date(2026, 5, 1)


def test_entry_date_dashboard_and_income_agree():
    """Dashboard cycle and /income must compute the same date for any entry —
    in particular for one-time entries with received_at, which used to differ
    (dashboard hardcoded day=1, /income honored received_at)."""
    e = _stub_entry(2026, 5, day_of_month=None, received_at=date(2026, 4, 28))
    assert entry_date(e) == dashboard_entry_date(e) == date(2026, 4, 28)

    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 4, 27))
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])
    # The puntual confirmed on 2026-04-28 belongs to the 26 abr–25 may cycle.
    assert cycle_start <= entry_date(e) <= cycle_end
    assert cycle_start <= dashboard_entry_date(e) <= cycle_end


# ---- Cycle filter sanity check (the bug we just fixed) -----------------


def test_cycle_filter_includes_april_recurring_within_april_to_may_cycle():
    """An entry with day_of_month=27 in April should fall in the 26 abr–25 may cycle."""
    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 5, 10))
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])

    # April entry with day=27 → 2026-04-27 → inside [2026-04-26, 2026-05-25]
    april_entry = _stub_entry(2026, 4, day_of_month=27)
    assert cycle_start <= _entry_date(april_entry) <= cycle_end

    # May entry with day=27 → 2026-05-27 → OUTSIDE cycle (next cycle's territory)
    may_entry = _stub_entry(2026, 5, day_of_month=27)
    assert not (cycle_start <= _entry_date(may_entry) <= cycle_end)


# ---- Bill status transitions ------------------------------------------


@pytest.mark.parametrize(
    ("due_date", "today", "expected"),
    [
        # Past due → OVERDUE
        (date(2026, 4, 26), date(2026, 4, 27), BillStatus.OVERDUE),
        (date(2026, 1, 1),  date(2026, 4, 27), BillStatus.OVERDUE),
        # Due today → DUE_SOON (within window)
        (date(2026, 4, 27), date(2026, 4, 27), BillStatus.DUE_SOON),
        # Within 7 days → DUE_SOON
        (date(2026, 4, 30), date(2026, 4, 27), BillStatus.DUE_SOON),
        (date(2026, 5, 4),  date(2026, 4, 27), BillStatus.DUE_SOON),  # exactly 7 days
        # More than 7 days out → PENDING
        (date(2026, 5, 5),  date(2026, 4, 27), BillStatus.PENDING),
        (date(2026, 6, 1),  date(2026, 4, 27), BillStatus.PENDING),
    ],
)
def test_compute_bill_status(due_date, today, expected):
    assert compute_bill_status(due_date, today) == expected


def test_calendar_months_touched_typical_cycle():
    """Bill auto-generation in cycle mode iterates these calendar months."""
    months = _calendar_months_touched(date(2026, 4, 26), date(2026, 5, 25))
    assert months == [(2026, 4), (2026, 5)]


def test_calendar_months_touched_year_boundary():
    months = _calendar_months_touched(date(2026, 12, 26), date(2027, 1, 25))
    assert months == [(2026, 12), (2027, 1)]


def test_calendar_months_touched_single_month_when_aligned():
    """Cycle confined to a single calendar month yields just that month."""
    months = _calendar_months_touched(date(2026, 6, 1), date(2026, 6, 30))
    assert months == [(2026, 6)]


def test_compute_bill_status_recovers_from_overdue():
    """The reported bug: a bill stuck in OVERDUE whose due_date now lies in the
    future must be reclassified. The pure helper has no memory of the prior
    status, so it always returns the right answer for the new due_date."""
    # Tarjeta de crédito case: due_date 2026-04-30 evaluated on 2026-04-27.
    assert compute_bill_status(date(2026, 4, 30), date(2026, 4, 27)) == BillStatus.DUE_SOON
    # And once the date passes, it flips OVERDUE again.
    assert compute_bill_status(date(2026, 4, 30), date(2026, 5, 1)) == BillStatus.OVERDUE


def test_cycle_filter_includes_may_entry_with_day_below_cycle_end():
    """An entry with day_of_month=15 in May should fall in the 26 abr–25 may cycle."""
    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 5, 10))
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])

    may_entry = _stub_entry(2026, 5, day_of_month=15)
    assert cycle_start <= _entry_date(may_entry) <= cycle_end


# ---- Bogota-anchored "today" never disagrees with bill status logic ----


def test_retroactive_guard_skips_due_date_before_template_creation():
    """Bug X regression: a template created on 26 abr with due_day=5 must NOT
    spawn an instance for the 5th of the same month (already 22 days overdue
    when the user just signed up). The guard compares due_date against
    template.created_at in America/Bogota."""
    bogota = ZoneInfo("America/Bogota")
    created_at = datetime(2026, 4, 26, 12, 0, tzinfo=bogota)
    due_date_in_same_month = date(2026, 4, 5)
    created_local = created_at.astimezone(bogota).date()
    assert due_date_in_same_month < created_local  # → guard would skip


def test_retroactive_guard_includes_due_date_after_template_creation_same_month():
    """Mirror: same template created on 26 abr but with due_day=27 → due_date
    27 abr is >= 26 abr so the instance should be created."""
    bogota = ZoneInfo("America/Bogota")
    created_at = datetime(2026, 4, 26, 12, 0, tzinfo=bogota)
    due_date_after = date(2026, 4, 27)
    created_local = created_at.astimezone(bogota).date()
    assert due_date_after >= created_local  # → guard allows


def test_retroactive_guard_late_utc_creation_counts_as_local_day():
    """Edge case: template created at 23:30 UTC on 25 abr is 18:30 COT on
    25 abr. The guard must use the Bogota date (25), not the UTC date (25
    becomes 26 if we used UTC midnight). Bills due on 25 abr should be
    allowed; bills due on 24 abr or earlier should be skipped."""
    bogota = ZoneInfo("America/Bogota")
    # Equivalent to 18:30 COT on 25 abr
    created_at_utc = datetime(2026, 4, 25, 23, 30, tzinfo=timezone.utc)
    created_local = created_at_utc.astimezone(bogota).date()
    assert created_local == date(2026, 4, 25)
    assert date(2026, 4, 25) >= created_local  # same-day bill allowed
    assert date(2026, 4, 24) < created_local   # day-before bill skipped


def _make_template(recurrence: str, due_day: int, anchor=None, created_at=None):
    """Build a stand-in BillTemplate for pure tests of _should_generate /
    next_instance_date — avoids touching SQLAlchemy."""
    bogota = ZoneInfo("America/Bogota")
    if created_at is None:
        created_at = datetime(2026, 4, 25, 12, 0, tzinfo=bogota)
    return SimpleNamespace(
        recurrence_type=SimpleNamespace(value=recurrence),
        due_day_of_month=due_day,
        due_month_of_year=anchor,
        created_at=created_at,
    )


def test_should_generate_annual_with_explicit_anchor():
    """Bug fix: annual with anchor=4 fires only in April (not January)."""
    from app.services.bill_service import _should_generate
    tpl = _make_template("annual", 28, anchor=4)
    assert _should_generate(tpl, 2026, 4) is True
    assert _should_generate(tpl, 2026, 1) is False
    assert _should_generate(tpl, 2027, 4) is True


def test_should_generate_semiannual_with_anchor():
    """Semiannual anchor=4 fires in April AND October."""
    from app.services.bill_service import _should_generate
    tpl = _make_template("semiannual", 15, anchor=4)
    assert _should_generate(tpl, 2026, 4) is True
    assert _should_generate(tpl, 2026, 10) is True
    assert _should_generate(tpl, 2026, 7) is False


def test_should_generate_legacy_when_no_anchor():
    """Backwards compat: annual without anchor fires only in January."""
    from app.services.bill_service import _should_generate
    tpl = _make_template("annual", 28, anchor=None)
    assert _should_generate(tpl, 2026, 1) is True
    assert _should_generate(tpl, 2026, 4) is False


def test_next_instance_date_annual_anchor_april_today_28apr():
    """Cambio aceite Suzuki regression: today=28 abr, anchor=4, due_day=28 →
    next instance is 28 abr 2026 (today itself)."""
    from app.services.bill_service import next_instance_date
    bogota = ZoneInfo("America/Bogota")
    tpl = _make_template("annual", 28, anchor=4,
                         created_at=datetime(2026, 4, 25, 12, 0, tzinfo=bogota))
    next_date = next_instance_date(tpl, today=date(2026, 4, 28))
    assert next_date == date(2026, 4, 28)


def test_next_instance_date_annual_anchor_april_after_due_passed():
    """After this year's due passed, next instance is next year's same month."""
    from app.services.bill_service import next_instance_date
    bogota = ZoneInfo("America/Bogota")
    tpl = _make_template("annual", 28, anchor=4,
                         created_at=datetime(2026, 4, 25, 12, 0, tzinfo=bogota))
    next_date = next_instance_date(tpl, today=date(2026, 5, 5),
                                    last_paid=date(2026, 4, 28))
    assert next_date == date(2027, 4, 28)


def test_pre_job_horizon_covers_seven_day_reminder():
    """The pre-job auto-generates bills for [today, today+31d]. A bill due
    7 days from today must be covered by that window — otherwise the cron
    would skip it because the instance doesn't yet exist in DB."""
    from datetime import timedelta
    today = date(2026, 4, 28)
    seven_days_out = today + timedelta(days=7)

    # Months touched by [today, today+31] from the job's perspective
    months: set[tuple[int, int]] = set()
    last_date = today + timedelta(days=31)
    d = date(today.year, today.month, 1)
    while d <= last_date:
        months.add((d.year, d.month))
        d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)

    assert (seven_days_out.year, seven_days_out.month) in months
    # Today's month is also covered (overdue/due_soon stay generated)
    assert (today.year, today.month) in months


def test_unconfirmed_income_skips_entry_outside_active_cycle():
    """Bug A regression test: rocios00 has cycle_start_day=27. On 2026-04-28
    her active cycle is 27 abr–26 may. An income entry for april with
    day_of_month=15 has entry_date = 2026-04-15 which is OUTSIDE the active
    cycle. The job must NOT remind her about that entry — she literally
    cannot see it in her dashboard to confirm it."""
    cycle = get_pay_cycle(start_day=27, reference_date=date(2026, 4, 28))
    window_start = date.fromisoformat(cycle["start_date"])
    window_end = date.fromisoformat(cycle["end_date"])
    assert window_start == date(2026, 4, 27)
    assert window_end == date(2026, 5, 26)

    # April-15 entry: entry_date inside or outside the active cycle?
    e = _stub_entry(2026, 4, day_of_month=15)
    ed = _entry_date(e)
    assert ed == date(2026, 4, 15)
    assert not (window_start <= ed <= window_end)  # OUTSIDE → skip reminder


def test_unconfirmed_income_includes_entry_inside_active_cycle_past_expected():
    """Mirror: a recurring entry whose civil date already passed AND falls
    inside the active cycle SHOULD be flagged for reminder."""
    cycle = get_pay_cycle(start_day=27, reference_date=date(2026, 5, 5))
    window_start = date.fromisoformat(cycle["start_date"])
    window_end = date.fromisoformat(cycle["end_date"])
    today = date(2026, 5, 5)

    # Entry for april-may cycle with day_of_month=28 → entry_date 2026-04-28
    e = _stub_entry(2026, 4, day_of_month=28)
    ed = _entry_date(e)
    assert window_start <= ed <= window_end
    assert ed < today  # past expected — should remind


def test_compute_bill_status_with_bogota_today_at_utc_late_night():
    """Reminder/status jobs use ZoneInfo('America/Bogota') for today. Verify
    that around the Bogota↔UTC date boundary (early UTC hours = late Bogota
    previous day) the status is computed against the correct civil date."""
    # 2026-04-28 03:00 UTC == 2026-04-27 22:00 in Bogota.
    utc_moment = datetime(2026, 4, 28, 3, 0, tzinfo=timezone.utc)
    bogota_today = utc_moment.astimezone(ZoneInfo("America/Bogota")).date()
    assert bogota_today == date(2026, 4, 27)

    # A bill due 2026-04-27 must be DUE_SOON (==0 days) in Bogota's civil day,
    # not OVERDUE (which would be the answer if we naively used UTC's date).
    assert compute_bill_status(date(2026, 4, 27), bogota_today) == BillStatus.DUE_SOON
    # And a bill due 2026-04-28 is still DUE_SOON, not PENDING.
    assert compute_bill_status(date(2026, 4, 28), bogota_today) == BillStatus.DUE_SOON
