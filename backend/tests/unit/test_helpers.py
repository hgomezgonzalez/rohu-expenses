"""Unit tests for pure helpers used by the cycle/income/whatsapp features."""

from datetime import date
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints.auth import _wa_me_link
from app.core.pay_cycle import get_pay_cycle, navigate_pay_cycle
from app.services.income_service import _entry_date, _months_in_cycle


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


def test_cycle_filter_includes_may_entry_with_day_below_cycle_end():
    """An entry with day_of_month=15 in May should fall in the 26 abr–25 may cycle."""
    cycle = get_pay_cycle(start_day=26, reference_date=date(2026, 5, 10))
    cycle_start = date.fromisoformat(cycle["start_date"])
    cycle_end = date.fromisoformat(cycle["end_date"])

    may_entry = _stub_entry(2026, 5, day_of_month=15)
    assert cycle_start <= _entry_date(may_entry) <= cycle_end
