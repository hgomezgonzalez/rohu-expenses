"""Read-only diagnostic for notifications and income state. No PII in output.

Usage:
    cd backend && python3 -m scripts.diagnose_notifications
    heroku run --app rohu-expenses-api "cd backend && python3 -m scripts.diagnose_notifications"
"""

import asyncio
import sys
import os
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func, and_, or_

from app.core.database import async_session_factory
from app.models.user import User
from app.models.bill_instance import BillInstance, BillStatus
from app.models.notification_log import NotificationLog
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.models.user_settings import UserSettings


TARGET_EMAILS = ["hgomezgonzalez@gmail.com", "rocios00@hotmail.com"]
BOGOTA_TZ = ZoneInfo("America/Bogota")


async def diagnose():
    today = datetime.now(BOGOTA_TZ).date()
    bogota_midnight_today = datetime(today.year, today.month, today.day, tzinfo=BOGOTA_TZ).astimezone(timezone.utc)
    bogota_midnight_tomorrow = datetime(today.year, today.month, today.day, tzinfo=BOGOTA_TZ)
    next_day = today.fromordinal(today.toordinal() + 1)
    bogota_midnight_tomorrow = datetime(next_day.year, next_day.month, next_day.day, tzinfo=BOGOTA_TZ).astimezone(timezone.utc)

    print(f"diagnose.today.bogota: {today.isoformat()}")

    async with async_session_factory() as db:
        users_q = await db.execute(select(User).where(User.email.in_(TARGET_EMAILS)))
        users = list(users_q.scalars().all())
        if len(users) < 2:
            print(f"diagnose.error: found {len(users)} users (expected 2)")

        for idx, user in enumerate(users, start=1):
            uid = user.id
            label = f"user{idx}"

            # Bills counts for current and next month
            for offset in (0, 1):
                if offset == 0:
                    y, m = today.year, today.month
                else:
                    y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)

                bill_counts = {}
                for status_val in [BillStatus.PENDING, BillStatus.DUE_SOON, BillStatus.OVERDUE, BillStatus.PAID, BillStatus.CANCELLED]:
                    cnt_q = await db.execute(
                        select(func.count(BillInstance.id)).where(
                            BillInstance.user_id == uid,
                            BillInstance.year == y,
                            BillInstance.month == m,
                            BillInstance.status == status_val,
                        )
                    )
                    bill_counts[status_val.value] = cnt_q.scalar() or 0
                print(f"{label}.bills.{y}-{m:02d}.pending: {bill_counts['pending']}")
                print(f"{label}.bills.{y}-{m:02d}.due_soon: {bill_counts['due_soon']}")
                print(f"{label}.bills.{y}-{m:02d}.overdue: {bill_counts['overdue']}")
                print(f"{label}.bills.{y}-{m:02d}.paid: {bill_counts['paid']}")

            # Notification logs created today (Bogota)
            log_today_q = await db.execute(
                select(NotificationLog.template_key, NotificationLog.channel, NotificationLog.status, func.count(NotificationLog.id))
                .where(
                    NotificationLog.user_id == uid,
                    NotificationLog.created_at >= bogota_midnight_today,
                    NotificationLog.created_at < bogota_midnight_tomorrow,
                )
                .group_by(NotificationLog.template_key, NotificationLog.channel, NotificationLog.status)
            )
            for tk, ch, st, cnt in log_today_q.all():
                print(f"{label}.logs.today.{tk}.{ch}.{st}: {cnt}")

            # Historical overdue logs distribution
            hist_q = await db.execute(
                select(NotificationLog.bill_instance_id, func.count(NotificationLog.id).label("c"))
                .where(NotificationLog.user_id == uid, NotificationLog.template_key == "bill_reminder_overdue")
                .group_by(NotificationLog.bill_instance_id)
            )
            bins = {"0": 0, "1-6": 0, "7+": 0}
            for _, c in hist_q.all():
                if c == 0:
                    bins["0"] += 1
                elif c <= 6:
                    bins["1-6"] += 1
                else:
                    bins["7+"] += 1
            print(f"{label}.logs.historical_overdue.bills_with_0: {bins['0']}")
            print(f"{label}.logs.historical_overdue.bills_with_1to6: {bins['1-6']}")
            print(f"{label}.logs.historical_overdue.bills_with_7plus: {bins['7+']}")

            # Income entries april & may
            for y, m in ((today.year, today.month), ((today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1))):
                exp_q = await db.execute(
                    select(func.count(IncomeEntry.id)).where(
                        IncomeEntry.user_id == uid,
                        IncomeEntry.year == y,
                        IncomeEntry.month == m,
                        IncomeEntry.status == IncomeEntryStatus.EXPECTED.value,
                    )
                )
                conf_q = await db.execute(
                    select(func.count(IncomeEntry.id)).where(
                        IncomeEntry.user_id == uid,
                        IncomeEntry.year == y,
                        IncomeEntry.month == m,
                        IncomeEntry.status == IncomeEntryStatus.CONFIRMED.value,
                    )
                )
                rem_q = await db.execute(
                    select(func.coalesce(func.sum(IncomeEntry.unconfirmed_reminder_count), 0)).where(
                        IncomeEntry.user_id == uid,
                        IncomeEntry.year == y,
                        IncomeEntry.month == m,
                    )
                )
                print(f"{label}.income.{y}-{m:02d}.expected: {exp_q.scalar() or 0}")
                print(f"{label}.income.{y}-{m:02d}.confirmed: {conf_q.scalar() or 0}")
                print(f"{label}.income.{y}-{m:02d}.unconfirmed_reminder_count_sum: {rem_q.scalar() or 0}")

            # Pay cycle
            us_q = await db.execute(select(UserSettings).where(UserSettings.user_id == uid))
            us = us_q.scalars().first()
            cycle_day = us.pay_cycle_start_day if us and us.pay_cycle_start_day else None
            print(f"{label}.pay_cycle_start_day: {cycle_day}")

            print()


if __name__ == "__main__":
    asyncio.run(diagnose())
