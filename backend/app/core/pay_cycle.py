"""Pay cycle calculation for users with non-calendar-month pay periods.

A user who gets paid on the 25th sees bills from the 25th of one month
to the 24th of the next month as a single "cycle"."""

import calendar
from datetime import date, timedelta

MONTH_NAMES_ES = [
    "", "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
]


def _clamp_day(year: int, month: int, day: int) -> int:
    """Clamp day to the last day of the given month."""
    last_day = calendar.monthrange(year, month)[1]
    return min(day, last_day)


def get_pay_cycle(start_day: int, reference_date: date) -> dict:
    """Calculate the pay cycle window that contains the reference_date.

    Example: start_day=25, reference_date=2026-05-10
    → start=2026-04-25, end=2026-05-24, label="25 abr – 24 may 2026"

    Returns: {start_date, end_date, label, start_day}
    """
    y, m = reference_date.year, reference_date.month
    clamped = _clamp_day(y, m, start_day)

    if reference_date.day >= clamped:
        # We're in a cycle that started this month
        cycle_start = date(y, m, clamped)
    else:
        # We're in a cycle that started last month
        if m == 1:
            prev_y, prev_m = y - 1, 12
        else:
            prev_y, prev_m = y, m - 1
        cycle_start = date(prev_y, prev_m, _clamp_day(prev_y, prev_m, start_day))

    # End date = day before start_day of next month
    s_y, s_m = cycle_start.year, cycle_start.month
    if s_m == 12:
        next_y, next_m = s_y + 1, 1
    else:
        next_y, next_m = s_y, s_m + 1
    cycle_end = date(next_y, next_m, _clamp_day(next_y, next_m, start_day)) - timedelta(days=1)

    # Label
    start_label = f"{cycle_start.day} {MONTH_NAMES_ES[cycle_start.month]}"
    end_label = f"{cycle_end.day} {MONTH_NAMES_ES[cycle_end.month]}"
    year_label = str(cycle_end.year)
    if cycle_start.year != cycle_end.year:
        start_label += f" {cycle_start.year}"
    label = f"{start_label} – {end_label} {year_label}"

    return {
        "start_date": cycle_start.isoformat(),
        "end_date": cycle_end.isoformat(),
        "label": label,
        "start_day": start_day,
    }


def navigate_pay_cycle(start_day: int, reference_date: date, delta: int) -> dict:
    """Navigate to previous (delta=-1) or next (delta=+1) pay cycle."""
    current = get_pay_cycle(start_day, reference_date)
    current_start = date.fromisoformat(current["start_date"])

    if delta > 0:
        # Next cycle: jump to day after current end
        next_ref = date.fromisoformat(current["end_date"]) + timedelta(days=1)
    else:
        # Previous cycle: jump to day before current start
        next_ref = current_start - timedelta(days=1)

    return get_pay_cycle(start_day, next_ref)
