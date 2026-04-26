import uuid
from datetime import date, datetime
from decimal import Decimal

from typing import Annotated

from pydantic import BaseModel, Field, PlainSerializer, computed_field

Num = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]


class IncomeEntryGenerate(BaseModel):
    year: int = Field(ge=2020, le=2100)
    month: int = Field(ge=1, le=12)


class IncomeEntryCreate(BaseModel):
    """For creating one-time income entries (no template)."""
    name: str = Field(max_length=200)
    expected_amount: Decimal = Field(gt=0, decimal_places=2)
    year: int = Field(ge=2020, le=2100)
    month: int = Field(ge=1, le=12)
    notes: str | None = Field(None, max_length=500)


class IncomeEntryConfirm(BaseModel):
    """Shortcut to confirm an income entry with actual amount."""
    actual_amount: Decimal = Field(gt=0, decimal_places=2)
    received_at: date | None = None
    notes: str | None = Field(None, max_length=500)


class IncomeEntryUpdate(BaseModel):
    actual_amount: Decimal | None = Field(None, gt=0, decimal_places=2)
    status: str | None = Field(None, pattern="^(expected|confirmed|cancelled)$")
    received_at: date | None = None
    notes: str | None = Field(None, max_length=500)


class IncomeEntryResponse(BaseModel):
    id: uuid.UUID
    income_source_id: uuid.UUID | None
    year: int
    month: int
    name: str
    expected_amount: Num
    actual_amount: Num | None
    status: str
    is_one_time: bool
    received_at: date | None
    notes: str | None
    created_at: datetime

    @computed_field
    @property
    def effective_amount(self) -> float:
        """Returns actual_amount if confirmed, otherwise expected_amount."""
        if self.actual_amount is not None:
            return float(self.actual_amount)
        return float(self.expected_amount)

    model_config = {"from_attributes": True}


class IncomeGenerateResult(BaseModel):
    generated: int
    skipped: int
    entries: list[IncomeEntryResponse]
