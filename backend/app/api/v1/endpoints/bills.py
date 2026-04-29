import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user, get_current_admin
from app.models.user import User
from app.models.bill_instance import BillStatus, BillInstance
from app.models.bill_template import BillTemplate
from app.schemas.bill import (
    BillTemplateCreate,
    BillTemplateUpdate,
    BillTemplateResponse,
    BillInstanceResponse,
    BillInstanceUpdate,
    CategoryResponse,
)
from app.services import bill_service

router = APIRouter(prefix="/bills", tags=["bills"])


async def _build_template_response(
    db: AsyncSession,
    template: BillTemplate,
    cycle_window: tuple[date, date] | None = None,
) -> BillTemplateResponse:
    """Serialize a template, computing next_instance_date based on the last
    paid instance and the template's recurrence + anchor.

    `cycle_window` is the user's active pay cycle as (start, end). When
    provided, we mark next_in_current_cycle=False if the next date falls
    outside it, which the UI uses to highlight "won't appear in this cycle"
    templates so users don't lose track of bimonthly/annual ones.
    """
    today = datetime.now(ZoneInfo("America/Bogota")).date()
    last_paid_q = await db.execute(
        select(BillInstance.due_date)
        .where(
            BillInstance.bill_template_id == template.id,
            BillInstance.status == BillStatus.PAID,
        )
        .order_by(desc(BillInstance.due_date))
        .limit(1)
    )
    last_paid = last_paid_q.scalar()
    next_date = bill_service.next_instance_date(template, today, last_paid)

    in_cycle = True
    if cycle_window and next_date is not None:
        cs, ce = cycle_window
        in_cycle = cs <= next_date <= ce

    return BillTemplateResponse(
        id=template.id,
        category=CategoryResponse.model_validate(template.category),
        name=template.name,
        provider=template.provider,
        estimated_amount=template.estimated_amount,
        due_day_of_month=template.due_day_of_month,
        due_month_of_year=template.due_month_of_year,
        recurrence_type=template.recurrence_type,
        is_active=template.is_active,
        notes=template.notes,
        created_at=template.created_at,
        next_instance_date=next_date,
        next_in_current_cycle=in_cycle,
    )


async def _user_active_cycle(db: AsyncSession, user_id) -> tuple[date, date] | None:
    """Compute the active pay cycle for the user, or None if none configured."""
    from app.services.income_service import _get_pay_cycle_start_day
    from app.core.pay_cycle import get_pay_cycle
    start_day = await _get_pay_cycle_start_day(db, user_id)
    if not start_day:
        return None
    today = datetime.now(ZoneInfo("America/Bogota")).date()
    cycle = get_pay_cycle(start_day, today)
    return (date.fromisoformat(cycle["start_date"]), date.fromisoformat(cycle["end_date"]))


# --- Bill Templates ---

@router.post("/templates", response_model=BillTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: BillTemplateCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.create_bill_template(db, user.id, data)
    cycle = await _user_active_cycle(db, user.id)
    return await _build_template_response(db, template, cycle)


@router.get("/templates", response_model=list[BillTemplateResponse])
async def list_templates(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    templates = await bill_service.get_bill_templates(db, user.id)
    cycle = await _user_active_cycle(db, user.id)
    return [await _build_template_response(db, t, cycle) for t in templates]


@router.get("/templates/{template_id}", response_model=BillTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.get_bill_template(db, template_id, user.id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    cycle = await _user_active_cycle(db, user.id)
    return await _build_template_response(db, template, cycle)


@router.patch("/templates/{template_id}", response_model=BillTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    data: BillTemplateUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.get_bill_template(db, template_id, user.id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    updated = await bill_service.update_bill_template(db, template, data)
    cycle = await _user_active_cycle(db, user.id)
    return await _build_template_response(db, updated, cycle)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.get_bill_template(db, template_id, user.id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    await bill_service.delete_bill_template(db, template)


# --- Bill Instances ---

@router.post("/instances/generate", status_code=status.HTTP_201_CREATED)
async def generate_instances(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await bill_service.generate_monthly_bills(db, user.id, year, month)
    created_count = len(result["created"])
    synced_count = result["synced"]
    return {
        "created": created_count,
        "synced": synced_count,
        "message": f"Generated {created_count}, synced {synced_count} for {year}-{month:02d}",
    }


@router.get("/instances", response_model=list[BillInstanceResponse])
async def list_instances(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    status: BillStatus | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    instances = await bill_service.get_bill_instances(db, user.id, year, month, status)
    result = []
    for inst in instances:
        paid = sum(p.amount for p in inst.payments) if inst.payments else 0
        result.append(
            BillInstanceResponse(
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
                total_paid=paid,
                created_at=inst.created_at,
            )
        )
    return result


@router.get("/instances/{instance_id}", response_model=BillInstanceResponse)
async def get_instance(
    instance_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inst = await bill_service.get_bill_instance(db, instance_id, user.id)
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill instance not found")
    paid = sum(p.amount for p in inst.payments) if inst.payments else 0
    return BillInstanceResponse(
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
        total_paid=paid,
        created_at=inst.created_at,
    )


@router.post("/instances/update-statuses")
async def update_statuses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated = await bill_service.update_bill_statuses(db, user.id)
    return {"updated": updated}


@router.delete("/instances/purge")
async def purge_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: permanently delete all bill data for a specific month."""
    deleted = await bill_service.purge_month_data(db, year, month)
    return deleted
