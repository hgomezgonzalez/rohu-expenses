"""Scheduled jobs for sending bill payment reminders.
Reads SMTP/Telegram config from user_settings table in DB."""

import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import async_session_factory
from app.core.pay_cycle import get_pay_cycle
from app.models.bill_instance import BillInstance, BillStatus
from app.models.bill_template import BillTemplate
from app.models.notification_rule import NotificationRule
from app.models.notification_log import NotificationLog
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.models.income_source import IncomeSource
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.bill_service import generate_monthly_bills, update_bill_statuses
from app.services.income_service import (
    _get_pay_cycle_start_day,
    _months_in_cycle,
    entry_date,
    generate_income_entries,
)
from app.services.notification_service import (
    send_email_with_settings, send_telegram_with_settings,
    build_reminder_email, build_reminder_telegram,
    build_income_reminder_email, build_income_reminder_telegram,
    get_admin_smtp_settings,
)

logger = logging.getLogger(__name__)


# Look-ahead horizon for bill auto-generation. Covers the largest practical
# "remind_days_before" window plus margin. Capped at 31 so we touch at most
# the next calendar month.
HORIZON_DAYS = 31
MAX_INCOME_REMINDERS = 3


async def _pre_generate_bills_and_income(db: AsyncSession, today: date) -> None:
    """Idempotently create the bill_instances and income_entries that today's
    reminders may need to notify. Without this, instances for the next
    calendar month don't exist when the cron fires (they're only created when
    a user opens the dashboard), and upcoming reminders silently no-op.
    """
    last_date = today + timedelta(days=HORIZON_DAYS)
    months_touched: set[tuple[int, int]] = set()
    d = date(today.year, today.month, 1)
    while d <= last_date:
        months_touched.add((d.year, d.month))
        d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)

    # Bills: every user with at least one active template
    bill_users_q = await db.execute(
        select(User.id)
        .join(BillTemplate, BillTemplate.user_id == User.id)
        .where(BillTemplate.is_active == True)  # noqa: E712
        .distinct()
    )
    for (uid,) in bill_users_q.all():
        for y, m in sorted(months_touched):
            try:
                await generate_monthly_bills(db, uid, y, m)
            except Exception as exc:
                logger.warning("Pre-job bill gen failed user=%s %s-%02d: %s", uid, y, m, exc)
        try:
            await update_bill_statuses(db, uid)
        except Exception as exc:
            logger.warning("Pre-job status update failed user=%s: %s", uid, exc)

    # Income: every user with at least one active source
    income_users_q = await db.execute(
        select(User.id)
        .join(IncomeSource, IncomeSource.user_id == User.id)
        .where(IncomeSource.is_active == True)  # noqa: E712
        .distinct()
    )
    for (uid,) in income_users_q.all():
        for y, m in sorted(months_touched):
            try:
                await generate_income_entries(db, uid, y, m)
            except Exception as exc:
                logger.warning("Pre-job income gen failed user=%s %s-%02d: %s", uid, y, m, exc)

    await db.flush()


async def check_and_send_reminders():
    """Check all bill instances and send reminders based on notification rules.
    Reads notification channel config from user_settings in DB."""
    logger.info("Running reminder check...")
    # Always anchor "today" to America/Bogota — Heroku containers run in UTC and
    # date.today() near midnight UTC would mis-classify days_until_due.
    today = datetime.now(ZoneInfo("America/Bogota")).date()

    async with async_session_factory() as db:
        # Pre-generate bills and income for the look-ahead window so the job
        # finds upcoming instances even on the first day of a new cycle.
        await _pre_generate_bills_and_income(db, today)

        # Get all unpaid bill instances with templates and rules
        result = await db.execute(
            select(BillInstance)
            .options(
                joinedload(BillInstance.template).joinedload(BillTemplate.notification_rules),
                joinedload(BillInstance.template).joinedload(BillTemplate.user),
            )
            .where(BillInstance.status.notin_([BillStatus.PAID, BillStatus.CANCELLED]))
        )
        instances = list(result.scalars().unique().all())

        # Cache user_settings per user_id
        settings_cache: dict[str, UserSettings | None] = {}

        # Get admin SMTP settings for fallback email sending
        admin_smtp = await get_admin_smtp_settings(db)

        sent_count = 0
        for instance in instances:
            days_until_due = (instance.due_date - today).days
            template = instance.template
            if not template or not template.notification_rules:
                continue

            user = template.user
            user_id_str = str(user.id)

            # Load user settings (cached)
            if user_id_str not in settings_cache:
                us_result = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == user.id)
                )
                settings_cache[user_id_str] = us_result.scalars().first()

            user_settings = settings_cache[user_id_str]

            for rule in template.notification_rules:
                if not rule.is_active:
                    continue

                should_notify = False
                days_text = ""

                if days_until_due in rule.remind_days_list:
                    should_notify = True
                    if days_until_due > 0:
                        days_text = f"Vence en {days_until_due} día{'s' if days_until_due > 1 else ''}"
                    elif days_until_due == 0:
                        days_text = "¡VENCE HOY!"
                elif days_until_due < 0 and rule.remind_overdue_daily:
                    should_notify = True
                    days_text = f"VENCIDA hace {abs(days_until_due)} día{'s' if abs(days_until_due) > 1 else ''}"

                if not should_notify:
                    continue

                # Dedup: skip if a SUCCESSFUL notification already exists for
                # this instance today (Bogota day). We don't dedup on failed
                # logs — those should be retried on the next run.
                bogota_midnight = datetime(today.year, today.month, today.day, tzinfo=ZoneInfo("America/Bogota"))
                existing = await db.execute(
                    select(NotificationLog).where(
                        NotificationLog.bill_instance_id == instance.id,
                        NotificationLog.created_at >= bogota_midnight.astimezone(timezone.utc),
                        NotificationLog.status == "sent",
                    )
                )
                if existing.scalars().first():
                    continue

                # Cap overdue reminders so a single unpaid bill cannot generate
                # an unbounded daily stream.
                if days_until_due < 0:
                    overdue_count_q = await db.execute(
                        select(NotificationLog).where(
                            NotificationLog.bill_instance_id == instance.id,
                            NotificationLog.template_key == "bill_reminder_overdue",
                            NotificationLog.status == "sent",
                        )
                    )
                    overdue_count = len(overdue_count_q.scalars().all())
                    if overdue_count >= rule.overdue_max_reminders:
                        continue

                amount = f"${instance.expected_amount:,.0f}"
                due_str = instance.due_date.strftime("%d/%m/%Y")
                channels = rule.channels_list

                for channel in channels:
                    success = False
                    recipient = ""

                    if channel == "email":
                        # Use user's SMTP if configured, otherwise admin's SMTP as fallback
                        smtp_settings = user_settings if (user_settings and user_settings.email_enabled and user_settings.smtp_host) else admin_smtp
                        if smtp_settings:
                            recipient = user.email
                            html = build_reminder_email(instance.name, amount, due_str, days_text)
                            success = await send_email_with_settings(
                                smtp_settings, user.email,
                                f"💰 {days_text} - {instance.name}", html
                            )
                            # Distribution list: extra_emails configured in the rule.
                            for extra in rule.extra_emails_list:
                                await send_email_with_settings(
                                    smtp_settings, extra,
                                    f"💰 {days_text} - {instance.name}", html
                                )

                    elif channel == "telegram":
                        # Telegram always uses user's own settings
                        if user_settings and user_settings.telegram_enabled:
                            recipient = "telegram"
                            msg = build_reminder_telegram(instance.name, amount, due_str, days_text)
                            success = await send_telegram_with_settings(user_settings, msg)

                    if not recipient:
                        continue

                    log = NotificationLog(
                        bill_instance_id=instance.id,
                        user_id=instance.user_id,
                        channel=channel,
                        template_key=f"bill_reminder_{'overdue' if days_until_due < 0 else 'upcoming'}",
                        recipient=recipient,
                        status="sent" if success else "failed",
                        sent_at=datetime.now(timezone.utc) if success else None,
                    )
                    db.add(log)
                    if success:
                        sent_count += 1

        # --- Income unconfirmed reminders ---
        income_sent = await _check_unconfirmed_income(db, settings_cache, today, admin_smtp)
        sent_count += income_sent

        await db.commit()
        logger.info("Reminder check complete. Sent %d notifications (including %d income).", sent_count, income_sent)
        return sent_count


async def _check_unconfirmed_income(
    db: AsyncSession, settings_cache: dict, today: date, admin_smtp=None
) -> int:
    """Send reminders for unconfirmed income entries past their expected date.

    Honors the user's pay cycle: an entry is only considered "pending" if
    its civil date (entry_date) falls inside the user's *current* cycle
    window AND has already passed. Without this, users on a non-calendar
    cycle keep getting reminders for entries from the previous calendar
    month that they cannot see (let alone confirm) in the dashboard.
    """
    sent_count = 0

    # All users with at least one active income source
    users_q = await db.execute(
        select(User.id)
        .join(IncomeSource, IncomeSource.user_id == User.id)
        .where(IncomeSource.is_active == True)  # noqa: E712
        .distinct()
    )
    user_ids = [r[0] for r in users_q.all()]

    for user_id in user_ids:
        # Determine the relevant window: pay cycle if configured, else current
        # calendar month.
        cycle_start_day = await _get_pay_cycle_start_day(db, user_id)
        if cycle_start_day:
            cycle = get_pay_cycle(cycle_start_day, today)
            window_start = date.fromisoformat(cycle["start_date"])
            window_end = date.fromisoformat(cycle["end_date"])
            months = _months_in_cycle(window_start, window_end)
        else:
            last_day = calendar.monthrange(today.year, today.month)[1]
            window_start = date(today.year, today.month, 1)
            window_end = date(today.year, today.month, last_day)
            months = [(today.year, today.month)]

        if not months:
            continue
        or_filter = or_(*[and_(IncomeEntry.year == y, IncomeEntry.month == m) for (y, m) in months])

        candidates_q = await db.execute(
            select(IncomeEntry)
            .options(joinedload(IncomeEntry.income_source))
            .where(
                IncomeEntry.user_id == user_id,
                or_filter,
                IncomeEntry.status == IncomeEntryStatus.EXPECTED.value,
                IncomeEntry.unconfirmed_reminder_count < MAX_INCOME_REMINDERS,
            )
        )
        candidates = list(candidates_q.scalars().unique().all())
        # Filter to entries whose civil date is inside the window AND has passed.
        candidates = [
            e for e in candidates
            if window_start <= entry_date(e) <= window_end and entry_date(e) < today
        ]

        if not candidates:
            continue

        # Load user settings (cached) and User row
        user_id_str = str(user_id)
        if user_id_str not in settings_cache:
            us_result = await db.execute(
                select(UserSettings).where(UserSettings.user_id == user_id)
            )
            settings_cache[user_id_str] = us_result.scalars().first()
        user_settings = settings_cache.get(user_id_str)

        user_q = await db.execute(select(User).where(User.id == user_id))
        user = user_q.scalars().first()
        if not user:
            continue

        for entry in candidates:
            day_of_month = (
                entry.income_source.day_of_month
                if entry.income_source and entry.income_source.day_of_month
                else 1
            )
            amount = f"${entry.expected_amount:,.0f}"
            subject = f"💵 Ingreso pendiente - {entry.name}"

            # Telegram: user's own settings
            if user_settings and user_settings.telegram_enabled:
                msg = build_income_reminder_telegram(entry.name, amount, day_of_month)
                success = await send_telegram_with_settings(user_settings, msg)
                if success:
                    sent_count += 1

            # Email: user's SMTP or admin's SMTP as fallback
            smtp_settings = user_settings if (user_settings and user_settings.email_enabled and user_settings.smtp_host) else admin_smtp
            if smtp_settings:
                html = build_income_reminder_email(entry.name, amount, day_of_month)
                success = await send_email_with_settings(smtp_settings, user.email, subject, html)
                if success:
                    sent_count += 1

            entry.unconfirmed_reminder_count += 1

    return sent_count
