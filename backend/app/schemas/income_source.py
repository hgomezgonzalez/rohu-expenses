import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class IncomeSourceCreate(BaseModel):
    name: str = Field(max_length=200)
    amount: Decimal = Field(gt=0, decimal_places=2)
    day_of_month: int = Field(ge=1, le=31)
    notes: str | None = Field(None, max_length=500)


class IncomeSourceUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    amount: Decimal | None = Field(None, gt=0, decimal_places=2)
    day_of_month: int | None = Field(None, ge=1, le=31)
    is_active: bool | None = None
    notes: str | None = Field(None, max_length=500)


class IncomeSourceResponse(BaseModel):
    id: uuid.UUID
    name: str
    amount: Decimal
    day_of_month: int
    is_active: bool
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
