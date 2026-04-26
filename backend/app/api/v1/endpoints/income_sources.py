import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.income_source import IncomeSource
from app.schemas.income_source import IncomeSourceCreate, IncomeSourceUpdate, IncomeSourceResponse

router = APIRouter(prefix="/income-sources", tags=["income-sources"])


@router.post("", response_model=IncomeSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_income_source(
    data: IncomeSourceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source = IncomeSource(
        user_id=user.id,
        name=data.name,
        amount=data.amount,
        day_of_month=data.day_of_month,
        notes=data.notes,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)
    return source


@router.get("", response_model=list[IncomeSourceResponse])
async def list_income_sources(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IncomeSource)
        .where(IncomeSource.user_id == user.id)
        .order_by(IncomeSource.day_of_month)
    )
    return list(result.scalars().all())


@router.patch("/{source_id}", response_model=IncomeSourceResponse)
async def update_income_source(
    source_id: uuid.UUID,
    data: IncomeSourceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IncomeSource).where(IncomeSource.id == source_id, IncomeSource.user_id == user.id)
    )
    source = result.scalars().first()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(source, key, value)
    await db.flush()
    await db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income_source(
    source_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IncomeSource).where(IncomeSource.id == source_id, IncomeSource.user_id == user.id)
    )
    source = result.scalars().first()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income source not found")
    await db.delete(source)
