import calendar
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.bill_template import BillTemplate
from app.models.bill_instance import BillInstance, BillStatus
from app.models.payment import Payment
from app.models.attachment import Attachment
from app.models.notification_rule import NotificationRule
from app.models.notification_log import NotificationLog
from app.schemas.bill import BillTemplateCreate, BillTemplateUpdate, BillInstanceUpdate


async def create_bill_template(
    db: AsyncSession, user_id: uuid.UUID, data: BillTemplateCreate
) -> BillTemplate:
    template = BillTemplate(
        user_id=user_id,
        category_id=data.category_id,
        name=data.name,
        provider=data.provider,
        estimated_amount=data.estimated_amount,
        due_day_of_month=data.due_day_of_month,
        due_month_of_year=data.due_month_of_year,
        recurrence_type=data.recurrence_type,
        notes=data.notes,
    )
    db.add(template)
    await db.flush()

    # Auto-create default notification rule (anti-olvido: active by default)
    rule = NotificationRule(
        bill_template_id=template.id,
        user_id=user_id,
        remind_days_before="7,3,1,0",
        remind_overdue_daily=True,
        channels="email,telegram",
        is_active=True,
    )
    db.add(rule)
    await db.flush()

    await db.refresh(template, ["category"])
    return template


async def get_bill_templates(db: AsyncSession, user_id: uuid.UUID) -> list[BillTemplate]:
    result = await db.execute(
        select(BillTemplate)
        .options(joinedload(BillTemplate.category))
        .where(BillTemplate.user_id == user_id)
        .order_by(BillTemplate.name)
    )
    return list(result.scalars().unique().all())


async def get_bill_template(
    db: AsyncSession, template_id: uuid.UUID, user_id: uuid.UUID
) -> BillTemplate | None:
    result = await db.execute(
        select(BillTemplate)
        .options(joinedload(BillTemplate.category))
        .where(BillTemplate.id == template_id, BillTemplate.user_id == user_id)
    )
    return result.scalars().first()


async def update_bill_template(
    db: AsyncSession, template: BillTemplate, data: BillTemplateUpdate
) -> BillTemplate:
    update_data = data.model_dump(exclude_unset=True)

    # Capture old values before mutation (for propagation)
    old_amount = template.estimated_amount if "estimated_amount" in update_data else None
    old_name = template.name if "name" in update_data else None
    old_due_day = template.due_day_of_month if "due_day_of_month" in update_data else None
    old_anchor = template.due_month_of_year if "due_month_of_year" in update_data else None
    anchor_changed_to_set = "due_month_of_year" in update_data and update_data["due_month_of_year"] != old_anchor

    for key, value in update_data.items():
        setattr(template, key, value)
    await db.flush()

    # Propagate changes to unpaid bill instances (current + future months)
    if old_amount is not None or old_name is not None or old_due_day is not None:
        await propagate_template_changes_to_instances(
            db, template, old_amount, old_name, old_due_day
        )

    # When the anchor month changes (or is reactivated), regenerate any missing
    # instance for the look-ahead window so the new schedule appears immediately
    # in the dashboard. Idempotent: skips if instance already exists.
    if anchor_changed_to_set or update_data.get("is_active") is True:
        from datetime import timedelta
        today = datetime.now(ZoneInfo("America/Bogota")).date()
        last_date = today + timedelta(days=31)
        months_touched: set[tuple[int, int]] = set()
        d = date(today.year, today.month, 1)
        while d <= last_date:
            months_touched.add((d.year, d.month))
            d = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
        for y, m in sorted(months_touched):
            try:
                await generate_monthly_bills(db, template.user_id, y, m)
            except Exception:
                pass

    await db.refresh(template, ["category"])
    return template


async def propagate_template_changes_to_instances(
    db: AsyncSession,
    template: BillTemplate,
    old_amount: Decimal | None,
    old_name: str | None,
    old_due_day: int | None,
) -> int:
    """Propagate template changes to unpaid bill instances.

    Rules:
    - Past months: NEVER change (historical data)
    - Current month: Update only PENDING or DUE_SOON
    - Future months: Update anything not PAID or CANCELLED
    """
    today = date.today()
    current_month_start = date(today.year, today.month, 1)

    amount_changed = old_amount is not None and template.estimated_amount != old_amount
    name_changed = old_name is not None and template.name != old_name
    due_day_changed = old_due_day is not None and template.due_day_of_month != old_due_day

    if not amount_changed and not name_changed and not due_day_changed:
        return 0

    result = await db.execute(
        select(BillInstance).where(BillInstance.bill_template_id == template.id)
    )
    instances = result.scalars().all()
    updated = 0

    for instance in instances:
        instance_month_start = date(instance.year, instance.month, 1)

        if instance_month_start < current_month_start:
            continue  # Past month: never touch

        if instance_month_start == current_month_start:
            if instance.status not in (BillStatus.PENDING, BillStatus.DUE_SOON):
                continue  # Current month: only PENDING/DUE_SOON
        else:
            if instance.status in (BillStatus.PAID, BillStatus.CANCELLED):
                continue  # Future month: skip PAID/CANCELLED

        if amount_changed:
            instance.expected_amount = template.estimated_amount
        if name_changed:
            instance.name = template.name
        if due_day_changed:
            last_day = calendar.monthrange(instance.year, instance.month)[1]
            new_day = min(template.due_day_of_month, last_day)
            instance.due_date = date(instance.year, instance.month, new_day)
        updated += 1

    if updated:
        await db.flush()
    return updated


async def generate_monthly_bills(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> dict:
    """Generate bill instances from active templates for a given month.
    Also syncs existing unpaid instances with current template values.
    Returns {"created": [...], "synced": int}."""
    templates = await db.execute(
        select(BillTemplate).where(
            BillTemplate.user_id == user_id,
            BillTemplate.is_active == True,
        )
    )
    templates = list(templates.scalars().all())

    created = []
    synced = 0
    last_day = calendar.monthrange(year, month)[1]

    for template in templates:
        # Check if should generate for this month based on recurrence
        if not _should_generate(template, year, month):
            continue

        # Idempotency: check if instance already exists
        existing_result = await db.execute(
            select(BillInstance).where(
                BillInstance.bill_template_id == template.id,
                BillInstance.year == year,
                BillInstance.month == month,
            )
        )
        existing = existing_result.scalars().first()
        if existing:
            # Sync template values to unpaid instances (PENDING, DUE_SOON, OVERDUE)
            if existing.status not in (BillStatus.PAID, BillStatus.CANCELLED):
                due_day = min(template.due_day_of_month, last_day)
                changed = False
                if existing.expected_amount != template.estimated_amount:
                    existing.expected_amount = template.estimated_amount
                    changed = True
                if existing.name != template.name:
                    existing.name = template.name
                    changed = True
                if existing.due_date != date(year, month, due_day):
                    existing.due_date = date(year, month, due_day)
                    changed = True
                if changed:
                    synced += 1
            continue

        # Calculate due date (handle months with fewer days)
        due_day = min(template.due_day_of_month, last_day)
        due_date = date(year, month, due_day)

        # Skip retroactive instances: a template created on the 26th must NOT
        # spawn an instance for the 5th of that same month — the user never
        # had a chance to record it. created_at is UTC; convert to Bogota so a
        # template created at 23:30 UTC on the 25th still counts as the 25th.
        created_local = template.created_at.astimezone(ZoneInfo("America/Bogota")).date()
        if due_date < created_local:
            continue

        instance = BillInstance(
            bill_template_id=template.id,
            user_id=user_id,
            category_id=template.category_id,
            year=year,
            month=month,
            name=template.name,
            expected_amount=template.estimated_amount,
            due_date=due_date,
            status=BillStatus.PENDING,
        )
        db.add(instance)
        created.append(instance)

    await db.flush()
    return {"created": created, "synced": synced}


def _should_generate(template: BillTemplate, year: int, month: int) -> bool:
    """Decide whether to generate an instance for this template in (year, month).

    For non-monthly recurrences the user can configure `due_month_of_year` to
    anchor when the cycle fires. Without an anchor we fall back to the legacy
    defaults (annual = January, semiannual = Jan+Jul, etc.) so existing data
    keeps its old behavior.
    """
    recurrence = template.recurrence_type.value
    if recurrence == "monthly":
        return True

    anchor = getattr(template, "due_month_of_year", None)
    if anchor is not None and 1 <= anchor <= 12:
        if recurrence == "annual":
            return month == anchor
        if recurrence == "semiannual":
            return month in (anchor, ((anchor - 1 + 6) % 12) + 1)
        if recurrence == "quarterly":
            return month in {((anchor - 1 + k) % 12) + 1 for k in (0, 3, 6, 9)}
        if recurrence == "bimonthly":
            return (month - anchor) % 2 == 0

    # Legacy default
    if recurrence == "bimonthly":
        return month % 2 == 1
    if recurrence == "quarterly":
        return month in (1, 4, 7, 10)
    if recurrence == "semiannual":
        return month in (1, 7)
    if recurrence == "annual":
        return month == 1
    return True


def next_instance_date(
    template: BillTemplate,
    today: date,
    last_paid: date | None = None,
    horizon_months: int = 24,
) -> date | None:
    """Compute the next calendar date this template will generate an instance for.

    Walks forward up to `horizon_months` from `today` looking for the first
    (year, month) where `_should_generate` is True AND the resulting due_date
    is strictly after `today`, `template.created_at`, and `last_paid` if any.

    Returns None if no match within the horizon (defensive guard).
    """
    created_local = template.created_at.astimezone(ZoneInfo("America/Bogota")).date()
    floor = today
    if created_local > floor:
        floor = created_local
    if last_paid and last_paid >= floor:
        floor = last_paid

    y, m = today.year, today.month
    for _ in range(horizon_months):
        if _should_generate(template, y, m):
            last_day = calendar.monthrange(y, m)[1]
            due = date(y, m, min(template.due_day_of_month, last_day))
            # The first instance can be exactly today (still actionable),
            # so we accept due >= today; later instances must be strictly
            # after the floor (today, created, last paid).
            if due >= today and due >= created_local and (last_paid is None or due > last_paid):
                return due
        m += 1
        if m > 12:
            m = 1
            y += 1
    return None


async def get_bill_instances(
    db: AsyncSession, user_id: uuid.UUID, year: int, month: int, status: BillStatus | None = None
) -> list[BillInstance]:
    query = (
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(
            BillInstance.user_id == user_id,
            BillInstance.year == year,
            BillInstance.month == month,
        )
    )
    if status:
        query = query.where(BillInstance.status == status)
    query = query.order_by(BillInstance.due_date)

    result = await db.execute(query)
    return list(result.scalars().unique().all())


async def get_bill_instance(
    db: AsyncSession, instance_id: uuid.UUID, user_id: uuid.UUID
) -> BillInstance | None:
    result = await db.execute(
        select(BillInstance)
        .options(joinedload(BillInstance.category), joinedload(BillInstance.payments))
        .where(BillInstance.id == instance_id, BillInstance.user_id == user_id)
    )
    return result.scalars().first()


DUE_SOON_DAYS = 7


def compute_bill_status(due_date: date, today: date | None = None) -> BillStatus:
    """Pure helper: derive a bill's lifecycle status from its due_date.

    OVERDUE if past due, DUE_SOON within DUE_SOON_DAYS days, PENDING otherwise.
    PAID and CANCELLED are terminal states owned by the payment/cancel flows
    and are NOT computed here — callers must skip those instances.
    """
    if today is None:
        today = date.today()
    days_to_due = (due_date - today).days
    if days_to_due < 0:
        return BillStatus.OVERDUE
    if days_to_due <= DUE_SOON_DAYS:
        return BillStatus.DUE_SOON
    return BillStatus.PENDING


async def update_bill_statuses(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Recompute statuses for non-terminal bills based on current date.

    Returns count of updated bills. Idempotent — runs the full transition
    matrix (e.g. OVERDUE→DUE_SOON when a corrected due_date moves to the
    future, OVERDUE→PENDING, DUE_SOON→OVERDUE, etc).
    """
    today = datetime.now(ZoneInfo("America/Bogota")).date()
    updated = 0

    # Get all non-paid, non-cancelled instances
    result = await db.execute(
        select(BillInstance).where(
            BillInstance.user_id == user_id,
            BillInstance.status.notin_([BillStatus.PAID, BillStatus.CANCELLED]),
        )
    )
    instances = result.scalars().all()

    for instance in instances:
        target = compute_bill_status(instance.due_date, today)
        if instance.status != target:
            instance.status = target
            updated += 1

    if updated:
        await db.flush()
    return updated


async def delete_bill_template(db: AsyncSession, template: BillTemplate) -> None:
    """Permanently delete a template and all associated data.
    Does NOT rely on CASCADE (FK constraints may not exist in DB)."""
    import os
    import logging
    from app.services.gdrive_service import delete_from_drive

    logger = logging.getLogger(__name__)

    # 1. Find all instances for this template
    instances_result = await db.execute(
        select(BillInstance).where(BillInstance.bill_template_id == template.id)
    )
    instances = list(instances_result.scalars().all())

    for instance in instances:
        # 2. Delete attachment files (Drive or local)
        payments_result = await db.execute(
            select(Payment).options(joinedload(Payment.attachments))
            .where(Payment.bill_instance_id == instance.id)
        )
        for payment in payments_result.scalars().unique().all():
            for att in payment.attachments:
                try:
                    await delete_from_drive(att.file_path)
                except Exception as e:
                    logger.warning("Failed to delete Drive file %s: %s", att.file_path, e)
                if os.path.exists(att.file_path):
                    os.remove(att.file_path)
                # 3. Delete attachment record
                await db.delete(att)

            # 4. Delete payment record
            await db.delete(payment)

        # 5. Delete notification logs for this instance
        logs_result = await db.execute(
            select(NotificationLog).where(NotificationLog.bill_instance_id == instance.id)
        )
        for log in logs_result.scalars().all():
            await db.delete(log)

        # 6. Delete bill instance
        await db.delete(instance)

    # 7. Delete notification rules for this template
    from app.models.notification_rule import NotificationRule
    rules_result = await db.execute(
        select(NotificationRule).where(NotificationRule.bill_template_id == template.id)
    )
    for rule in rules_result.scalars().all():
        await db.delete(rule)

    # 8. Delete the template itself
    await db.delete(template)
    await db.flush()


async def purge_month_data(db: AsyncSession, year: int, month: int) -> dict:
    """Admin: permanently delete all bill instance data for a specific month across ALL users."""
    import os
    from app.services.gdrive_service import delete_from_drive

    result = await db.execute(
        select(BillInstance)
        .where(BillInstance.year == year, BillInstance.month == month)
    )
    instances = list(result.scalars().all())

    deleted_instances = 0
    deleted_payments = 0
    deleted_files = 0

    for instance in instances:
        # Delete attachments + payments manually (no CASCADE)
        payments_result = await db.execute(
            select(Payment).options(joinedload(Payment.attachments)).where(Payment.bill_instance_id == instance.id)
        )
        for payment in payments_result.scalars().unique().all():
            for att in payment.attachments:
                try:
                    await delete_from_drive(att.file_path)
                except Exception:
                    pass
                if os.path.exists(att.file_path):
                    os.remove(att.file_path)
                await db.delete(att)
                deleted_files += 1
            await db.delete(payment)
            deleted_payments += 1

        # Delete notification logs
        logs_result = await db.execute(
            select(NotificationLog).where(NotificationLog.bill_instance_id == instance.id)
        )
        for log in logs_result.scalars().all():
            await db.delete(log)

        await db.delete(instance)
        deleted_instances += 1

    await db.flush()
    return {
        "year": year,
        "month": month,
        "deleted_instances": deleted_instances,
        "deleted_payments": deleted_payments,
        "deleted_files": deleted_files,
    }
