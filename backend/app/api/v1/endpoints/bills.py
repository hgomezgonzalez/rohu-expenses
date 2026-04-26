import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user, get_current_admin
from app.models.user import User
from app.models.bill_instance import BillStatus
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


# --- Bill Templates ---

@router.post("/templates", response_model=BillTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: BillTemplateCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.create_bill_template(db, user.id, data)
    return template


@router.get("/templates", response_model=list[BillTemplateResponse])
async def list_templates(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await bill_service.get_bill_templates(db, user.id)


@router.get("/templates/{template_id}", response_model=BillTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    template = await bill_service.get_bill_template(db, template_id, user.id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


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
    return await bill_service.update_bill_template(db, template, data)


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
