import calendar
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

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

    for key, value in update_data.items():
        setattr(template, key, value)
    await db.flush()

    # Propagate changes to unpaid bill instances (current + future months)
    if old_amount is not None or old_name is not None or old_due_day is not None:
        await propagate_template_changes_to_instances(
            db, template, old_amount, old_name, old_due_day
        )

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
    """Check if a template should generate an instance for the given month."""
    recurrence = template.recurrence_type.value
    if recurrence == "monthly":
        return True
    if recurrence == "bimonthly":
        return month % 2 == 1  # odd months
    if recurrence == "quarterly":
        return month in (1, 4, 7, 10)
    if recurrence == "semiannual":
        return month in (1, 7)
    if recurrence == "annual":
        return month == 1
    return True


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


async def update_bill_statuses(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Update bill instance statuses based on current date. Returns count of updated bills."""
    today = date.today()
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
        if instance.due_date < today and instance.status != BillStatus.OVERDUE:
            instance.status = BillStatus.OVERDUE
            updated += 1
        elif (
            instance.due_date >= today
            and (instance.due_date - today).days <= 7
            and instance.status == BillStatus.PENDING
        ):
            instance.status = BillStatus.DUE_SOON
            updated += 1

    if updated:
        await db.flush()
    return updated


async def delete_bill_template(db: AsyncSession, template: BillTemplate) -> None:
    """Permanently delete a template and all associated data (CASCADE: instances, payments, attachments, rules)."""
    import os
    import logging
    from app.services.gdrive_service import delete_from_drive

    logger = logging.getLogger(__name__)

    # Delete attachment files (Drive or local) before CASCADE delete
    try:
        instances_result = await db.execute(
            select(BillInstance).where(BillInstance.bill_template_id == template.id)
        )
        for instance in instances_result.scalars().all():
            payments_result = await db.execute(
                select(Payment).options(joinedload(Payment.attachments)).where(Payment.bill_instance_id == instance.id)
            )
            for payment in payments_result.scalars().unique().all():
                for att in payment.attachments:
                    try:
                        await delete_from_drive(att.file_path)
                    except Exception as e:
                        logger.warning("Failed to delete Drive file %s: %s", att.file_path, e)
                    if os.path.exists(att.file_path):
                        os.remove(att.file_path)
    except Exception as e:
        logger.warning("Error cleaning up files for template %s: %s", template.id, e)

    # CASCADE delete handles DB records
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
        payments_result = await db.execute(
            select(Payment).options(joinedload(Payment.attachments)).where(Payment.bill_instance_id == instance.id)
        )
        for payment in payments_result.scalars().unique().all():
            for att in payment.attachments:
                await delete_from_drive(att.file_path)
                if os.path.exists(att.file_path):
                    os.remove(att.file_path)
                deleted_files += 1
            deleted_payments += 1

        # Delete notification logs
        await db.execute(
            select(NotificationLog).where(NotificationLog.bill_instance_id == instance.id)
        )

        await db.delete(instance)  # CASCADE deletes payments, attachments, logs
        deleted_instances += 1

    await db.flush()
    return {
        "year": year,
        "month": month,
        "deleted_instances": deleted_instances,
        "deleted_payments": deleted_payments,
        "deleted_files": deleted_files,
    }
