import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.encryption import encrypt, decrypt
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user_settings import UserSettingsUpdate, UserSettingsResponse
from app.services.notification_service import (
    send_email_with_settings, send_telegram_with_settings,
    build_reminder_email, build_reminder_telegram,
)
from app.jobs.notification_jobs import check_and_send_reminders

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def _get_or_create_settings(db: AsyncSession, user_id: uuid.UUID) -> UserSettings:
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    settings = result.scalars().first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        await db.flush()
        await db.refresh(settings)
    return settings


@router.get("/config", response_model=UserSettingsResponse)
async def get_notification_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, user.id)
    return UserSettingsResponse(
        smtp_host=s.smtp_host,
        smtp_port=s.smtp_port,
        smtp_user=s.smtp_user,
        smtp_password_set=bool(s.smtp_password_encrypted),
        smtp_from_email=s.smtp_from_email,
        smtp_tls=s.smtp_tls,
        telegram_bot_token_set=bool(s.telegram_bot_token_encrypted),
        telegram_chat_id=s.telegram_chat_id,
        email_enabled=s.email_enabled,
        telegram_enabled=s.telegram_enabled,
        notification_hour=s.notification_hour,
        notification_minute=s.notification_minute,
        pay_cycle_start_day=s.pay_cycle_start_day,
    )


@router.put("/config", response_model=UserSettingsResponse)
async def update_notification_config(
    data: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, user.id)

    update_fields = data.model_dump(exclude_unset=True)

    # Handle encrypted fields separately
    if "smtp_password" in update_fields:
        pwd = update_fields.pop("smtp_password")
        if pwd is not None:
            s.smtp_password_encrypted = encrypt(pwd)

    if "telegram_bot_token" in update_fields:
        token = update_fields.pop("telegram_bot_token")
        if token is not None:
            s.telegram_bot_token_encrypted = encrypt(token)

    # Update remaining fields
    for key, value in update_fields.items():
        if hasattr(s, key):
            setattr(s, key, value)

    await db.flush()
    await db.refresh(s)

    return UserSettingsResponse(
        smtp_host=s.smtp_host,
        smtp_port=s.smtp_port,
        smtp_user=s.smtp_user,
        smtp_password_set=bool(s.smtp_password_encrypted),
        smtp_from_email=s.smtp_from_email,
        smtp_tls=s.smtp_tls,
        telegram_bot_token_set=bool(s.telegram_bot_token_encrypted),
        telegram_chat_id=s.telegram_chat_id,
        email_enabled=s.email_enabled,
        telegram_enabled=s.telegram_enabled,
        notification_hour=s.notification_hour,
        notification_minute=s.notification_minute,
        pay_cycle_start_day=s.pay_cycle_start_day,
    )


class TestRequest(BaseModel):
    channel: str  # "email" or "telegram"



@router.post("/test")
async def test_notification(
    data: TestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_or_create_settings(db, user.id)

    if data.channel == "email":
        if not s.smtp_host or not s.smtp_user:
            raise HTTPException(status_code=400, detail="Configura SMTP primero (host, usuario, contraseña)")
        html = build_reminder_email("Factura de prueba", "$150,000", "25/04/2026", "Esto es una prueba")
        success = await send_email_with_settings(s, user.email, "🧪 Prueba ROHU PayControl", html)
        if not success:
            raise HTTPException(status_code=500, detail="Error enviando email. Verifica host, puerto, usuario y contraseña SMTP.")
        return {"message": f"Email de prueba enviado a {user.email}"}

    elif data.channel == "telegram":
        if not s.telegram_bot_token_encrypted or not s.telegram_chat_id:
            raise HTTPException(status_code=400, detail="Configura Telegram primero (bot token y chat ID)")
        msg = build_reminder_telegram("Factura de prueba", "$150,000", "25/04/2026", "Esto es una prueba")
        success = await send_telegram_with_settings(s, msg)
        if not success:
            raise HTTPException(status_code=500, detail="Error enviando Telegram. Verifica bot token y chat ID.")
        return {"message": "Mensaje de prueba enviado a Telegram"}

    raise HTTPException(status_code=400, detail="Canal no soportado. Usa 'email' o 'telegram'.")


@router.post("/send-reminders")
async def trigger_reminders(user: User = Depends(get_current_user)):
    sent = await check_and_send_reminders()
    return {"sent": sent, "message": f"Se enviaron {sent} notificaciones"}


# ─── Notification Rules per Template ───

from app.models.notification_rule import NotificationRule
from app.models.bill_template import BillTemplate
from app.schemas.notification_rule import NotificationRuleResponse, NotificationRuleUpdate


@router.get("/rules/{template_id}", response_model=NotificationRuleResponse)
async def get_notification_rule(
    template_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationRule).where(
            NotificationRule.bill_template_id == template_id,
            NotificationRule.user_id == user.id,
        )
    )
    rule = result.scalars().first()
    if not rule:
        # Auto-create with defaults if missing
        rule = NotificationRule(
            bill_template_id=template_id,
            user_id=user.id,
            remind_days_before="7,3,1,0",
            remind_overdue_daily=True,
            channels="email,telegram",
            is_active=True,
        )
        db.add(rule)
        await db.flush()
        await db.refresh(rule)
    return rule


@router.put("/rules/{template_id}", response_model=NotificationRuleResponse)
async def update_notification_rule(
    template_id: uuid.UUID,
    data: NotificationRuleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NotificationRule).where(
            NotificationRule.bill_template_id == template_id,
            NotificationRule.user_id == user.id,
        )
    )
    rule = result.scalars().first()
    if not rule:
        rule = NotificationRule(
            bill_template_id=template_id,
            user_id=user.id,
        )
        db.add(rule)
        await db.flush()

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)
    return rule
