import uuid

from pydantic import BaseModel


class NotificationRuleResponse(BaseModel):
    id: uuid.UUID
    bill_template_id: uuid.UUID
    remind_days_before: str  # "7,3,1,0"
    remind_overdue_daily: bool
    channels: str  # "email,telegram"
    extra_emails: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class NotificationRuleUpdate(BaseModel):
    remind_days_before: str | None = None  # "7,3,1,0"
    remind_overdue_daily: bool | None = None
    channels: str | None = None  # "email,telegram"
    extra_emails: str | None = None
    is_active: bool | None = None
