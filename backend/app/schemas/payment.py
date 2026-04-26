import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.payment import PaymentMethod


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)
    payment_date: date
    payment_method: PaymentMethod
    reference: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=500)


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentResponse(BaseModel):
    id: uuid.UUID
    bill_instance_id: uuid.UUID
    amount: Decimal
    payment_date: date
    payment_method: PaymentMethod
    reference: str | None
    notes: str | None
    attachments: list[AttachmentResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentWithBillResponse(BaseModel):
    id: uuid.UUID
    bill_instance_id: uuid.UUID
    bill_name: str
    bill_category: str
    amount: Decimal
    payment_date: date
    payment_method: PaymentMethod
    reference: str | None
    notes: str | None
    attachments: list[AttachmentResponse] = []
    created_at: datetime
