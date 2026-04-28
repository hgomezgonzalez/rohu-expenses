"""Read-only audit of what the reminders job WOULD send right now if dedup
were disabled. Useful to validate consistency between dashboard state and
the job's decisions without sending real emails.

Output is aggregated counts (no PII): how many bills qualify, how many
would send via each channel, how many are skipped and why.

Usage:
    cd backend && python3 -m scripts.audit_reminders
    heroku run --app rohu-expenses-api "cd backend && python3 -m scripts.audit_reminders"
"""

import asyncio
import sys
import os
from collections import Counter
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, and_, or_
from sqlalchemy.orm import joinedload

from app.core.database import async_session_factory
from app.core.pay_cycle import get_pay_cycle
from app.models.bill_instance import BillInstance, BillStatus
from app.models.bill_template import BillTemplate
from app.models.notification_log import NotificationLog
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.models.income_source import IncomeSource
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.income_service import (
    _get_pay_cycle_start_day, _months_in_cycle, entry_date,
)
from app.services.notification_service import get_admin_smtp_settings


TARGETS = ["hgomezgonzalez@gmail.com", "rocios00@hotmail.com", "rociosd52@gmail.com"]
BOGOTA = ZoneInfo("America/Bogota")


async def main():
    today = datetime.now(BOGOTA).date()
    print(f"audit.today.bogota: {today.isoformat()}")
    bogota_midnight_utc = datetime(today.year, today.month, today.day, tzinfo=BOGOTA).astimezone(timezone.utc)

    async with async_session_factory() as db:
        admin_smtp = await get_admin_smtp_settings(db)

        users_q = await db.execute(select(User).where(User.email.in_(TARGETS)))
        users = {u.id: u for u in users_q.scalars().all()}

        # ----- Bills audit -----
        bills_q = await db.execute(
            select(BillInstance)
            .options(
                joinedload(BillInstance.template).joinedload(BillTemplate.notification_rules),
                joinedload(BillInstance.template).joinedload(BillTemplate.user),
            )
            .where(BillInstance.status.notin_([BillStatus.PAID, BillStatus.CANCELLED]))
        )
        bills = list(bills_q.scalars().unique().all())

        for idx, target_email in enumerate(TARGETS, start=1):
            label = f"user{idx}"
            user = next((u for u in users.values() if u.email == target_email), None)
            if not user:
                print(f"{label}.error: user not found")
                continue

            counters = Counter()
            user_bills = [b for b in bills if b.template and b.template.user_id == user.id]
            counters["bills.candidate.total"] = len(user_bills)

            us_q = await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))
            us = us_q.scalars().first()

            # Distribution of how rules look across the user's bills
            for b in user_bills:
                tpl = b.template
                if not tpl or not tpl.notification_rules:
                    continue
                for r in tpl.notification_rules:
                    if r.is_active:
                        counters["rules.active.count"] += 1
                        if r.remind_days_before == "7,3,1,0":
                            counters["rules.active.default_days"] += 1
                        else:
                            counters["rules.active.custom_days"] += 1
                        if r.extra_emails:
                            counters["rules.active.with_extra_emails"] += 1
                    else:
                        counters["rules.inactive.count"] += 1

            for b in user_bills:
                tpl = b.template
                if not tpl or not tpl.notification_rules:
                    counters["bills.skip.no_rule"] += 1
                    continue
                days = (b.due_date - today).days
                # Bucket by days for diagnosability
                if days < 0:
                    counters["bills.days_bucket.overdue"] += 1
                elif days == 0:
                    counters["bills.days_bucket.today"] += 1
                elif days <= 7:
                    counters[f"bills.days_bucket.in_{days}d"] += 1
                else:
                    counters["bills.days_bucket.gt_7d"] += 1
                fired = False
                for rule in tpl.notification_rules:
                    if not rule.is_active:
                        continue
                    if days in rule.remind_days_list:
                        kind = "upcoming"
                    elif days < 0 and rule.remind_overdue_daily:
                        kind = "overdue"
                    else:
                        continue
                    fired = True
                    counters[f"bills.would_fire.{kind}"] += 1

                    # Dedup check (today, status=sent)
                    dedup_q = await db.execute(
                        select(NotificationLog).where(
                            NotificationLog.bill_instance_id == b.id,
                            NotificationLog.created_at >= bogota_midnight_utc,
                            NotificationLog.status == "sent",
                        )
                    )
                    if dedup_q.scalars().first():
                        counters[f"bills.dedup_skip.{kind}"] += 1
                        continue

                    # Overdue cap
                    if kind == "overdue":
                        cap_q = await db.execute(
                            select(NotificationLog).where(
                                NotificationLog.bill_instance_id == b.id,
                                NotificationLog.template_key == "bill_reminder_overdue",
                                NotificationLog.status == "sent",
                            )
                        )
                        cap_count = len(cap_q.scalars().all())
                        if cap_count >= rule.overdue_max_reminders:
                            counters[f"bills.cap_skip.{kind}"] += 1
                            continue

                    for ch in rule.channels_list:
                        if ch == "email":
                            smtp = us if (us and us.email_enabled and us.smtp_host) else admin_smtp
                            if not smtp:
                                counters[f"bills.would_send.{kind}.email.no_smtp"] += 1
                            elif smtp.smtp_user and smtp.smtp_user.strip().lower() == user.email.strip().lower():
                                counters[f"bills.would_send.{kind}.email.self_loop_skip"] += 1
                            else:
                                counters[f"bills.would_send.{kind}.email.ok"] += 1
                        elif ch == "telegram":
                            if us and us.telegram_enabled:
                                counters[f"bills.would_send.{kind}.telegram.ok"] += 1
                            else:
                                counters[f"bills.would_send.{kind}.telegram.disabled"] += 1
                if not fired:
                    counters["bills.skip.no_match_today"] += 1

            # ----- Income audit -----
            cycle_day = await _get_pay_cycle_start_day(db, user.id)
            if cycle_day:
                cycle = get_pay_cycle(cycle_day, today)
                ws = datetime.fromisoformat(cycle["start_date"]).date() if isinstance(cycle["start_date"], str) else cycle["start_date"]
                we = datetime.fromisoformat(cycle["end_date"]).date() if isinstance(cycle["end_date"], str) else cycle["end_date"]
                from datetime import date as _date
                ws = _date.fromisoformat(cycle["start_date"])
                we = _date.fromisoformat(cycle["end_date"])
                months = _months_in_cycle(ws, we)
                counters["income.window"] = "cycle"
            else:
                from calendar import monthrange
                ws = today.replace(day=1)
                we = today.replace(day=monthrange(today.year, today.month)[1])
                months = [(today.year, today.month)]
                counters["income.window"] = "calendar"

            if months:
                or_filter = or_(*[and_(IncomeEntry.year == y, IncomeEntry.month == m) for (y, m) in months])
                inc_q = await db.execute(
                    select(IncomeEntry).options(joinedload(IncomeEntry.income_source))
                    .where(IncomeEntry.user_id == user.id, or_filter,
                           IncomeEntry.status == IncomeEntryStatus.EXPECTED.value)
                )
                inc_list = list(inc_q.scalars().unique().all())
                for e in inc_list:
                    ed = entry_date(e)
                    if ws <= ed <= we and ed < today:
                        counters["income.would_remind"] += 1
                    elif not (ws <= ed <= we):
                        counters["income.skip.outside_cycle"] += 1
                    elif ed >= today:
                        counters["income.skip.future"] += 1

            for k, v in sorted(counters.items()):
                print(f"{label}.{k}: {v}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
