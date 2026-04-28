import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.bill_template import RecurrenceType
from app.models.bill_instance import BillStatus


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    icon: str | None
    color: str | None

    model_config = {"from_attributes": True}


class BillTemplateCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(max_length=200)
    provider: str | None = Field(None, max_length=200)
    estimated_amount: Decimal = Field(gt=0, decimal_places=2)
    due_day_of_month: int = Field(ge=1, le=31)
    due_month_of_year: int | None = Field(None, ge=1, le=12)
    recurrence_type: RecurrenceType = RecurrenceType.MONTHLY
    notes: str | None = Field(None, max_length=500)


class BillTemplateUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    provider: str | None = Field(None, max_length=200)
    estimated_amount: Decimal | None = Field(None, gt=0, decimal_places=2)
    due_day_of_month: int | None = Field(None, ge=1, le=31)
    due_month_of_year: int | None = Field(None, ge=1, le=12)
    recurrence_type: RecurrenceType | None = None
    is_active: bool | None = None
    notes: str | None = Field(None, max_length=500)


class BillTemplateResponse(BaseModel):
    id: uuid.UUID
    category: CategoryResponse
    name: str
    provider: str | None
    estimated_amount: Decimal
    due_day_of_month: int
    due_month_of_year: int | None = None
    recurrence_type: RecurrenceType
    is_active: bool
    notes: str | None
    created_at: datetime
    next_instance_date: date | None = None

    model_config = {"from_attributes": True}


class BillInstanceResponse(BaseModel):
    id: uuid.UUID
    bill_template_id: uuid.UUID
    category: CategoryResponse
    year: int
    month: int
    name: str
    expected_amount: Decimal
    due_date: date
    status: BillStatus
    notes: str | None
    paid_at: datetime | None
    total_paid: Decimal = Decimal("0")
    created_at: datetime

    model_config = {"from_attributes": True}


class BillInstanceUpdate(BaseModel):
    expected_amount: Decimal | None = Field(None, gt=0, decimal_places=2)
    status: BillStatus | None = None
    notes: str | None = Field(None, max_length=500)
