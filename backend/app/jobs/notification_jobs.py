"""Scheduled jobs for sending bill payment reminders.
Reads SMTP/Telegram config from user_settings table in DB."""

import logging
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import async_session_factory
from app.models.bill_instance import BillInstance, BillStatus
from app.models.bill_template import BillTemplate
from app.models.notification_rule import NotificationRule
from app.models.notification_log import NotificationLog
from app.models.income_entry import IncomeEntry, IncomeEntryStatus
from app.models.income_source import IncomeSource
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.notification_service import (
    send_email_with_settings, send_telegram_with_settings,
    build_reminder_email, build_reminder_telegram,
    build_income_reminder_email, build_income_reminder_telegram,
    get_admin_smtp_settings,
)

logger = logging.getLogger(__name__)


async def check_and_send_reminders():
    """Check all bill instances and send reminders based on notification rules.
    Reads notification channel config from user_settings in DB."""
    logger.info("Running reminder check...")
    # Always anchor "today" to America/Bogota — Heroku containers run in UTC and
    # date.today() near midnight UTC would mis-classify days_until_due.
    today = datetime.now(ZoneInfo("America/Bogota")).date()

    async with async_session_factory() as db:
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

                # Check if already notified today (Bogota day) for this instance.
                # Convert Bogota midnight to UTC for the timestamp comparison.
                bogota_midnight = datetime(today.year, today.month, today.day, tzinfo=ZoneInfo("America/Bogota"))
                existing = await db.execute(
                    select(NotificationLog).where(
                        NotificationLog.bill_instance_id == instance.id,
                        NotificationLog.created_at >= bogota_midnight.astimezone(timezone.utc),
                    )
                )
                if existing.scalars().first():
                    continue

                # Cap overdue reminders so a single unpaid bill cannot generate
                # an unbounded daily stream. Counts only the overdue logs for
                # this instance (not pre-due reminders) and respects the rule's
                # configured cap.
                if days_until_due < 0:
                    overdue_count_q = await db.execute(
                        select(NotificationLog).where(
                            NotificationLog.bill_instance_id == instance.id,
                            NotificationLog.template_key == "bill_reminder_overdue",
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


MAX_INCOME_REMINDERS = 3


async def _check_unconfirmed_income(
    db: AsyncSession, settings_cache: dict, today: date, admin_smtp=None
) -> int:
    """Send reminders for unconfirmed income entries past their expected day."""
    sent_count = 0

    # Find unconfirmed entries for current month where expected day has passed
    result = await db.execute(
        select(IncomeEntry)
        .join(IncomeSource, IncomeEntry.income_source_id == IncomeSource.id, isouter=True)
        .where(
            IncomeEntry.year == today.year,
            IncomeEntry.month == today.month,
            IncomeEntry.status == IncomeEntryStatus.EXPECTED.value,
            IncomeEntry.unconfirmed_reminder_count < MAX_INCOME_REMINDERS,
        )
    )
    entries = list(result.scalars().all())

    for entry in entries:
        # Determine the expected day (from source or default to 1)
        day_of_month = 1
        if entry.income_source and entry.income_source.day_of_month:
            day_of_month = entry.income_source.day_of_month

        # Only remind if we're past the expected day + 1 grace day
        if today.day <= day_of_month + 1:
            continue

        # Load user settings
        user_id_str = str(entry.user_id)
        if user_id_str not in settings_cache:
            us_result = await db.execute(
                select(UserSettings).where(UserSettings.user_id == entry.user_id)
            )
            settings_cache[user_id_str] = us_result.scalars().first()

        user_settings = settings_cache.get(user_id_str)

        # Load user for email
        user_result = await db.execute(select(User).where(User.id == entry.user_id))
        user = user_result.scalars().first()
        if not user:
            continue

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
