from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user import UserLogin, UserResponse, TokenResponse
from app.services.notification_service import send_telegram_with_settings, send_email_with_settings, build_reminder_email

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=6)
    full_name: str = Field(max_length=255)


class RegisterResponse(BaseModel):
    message: str
    pending_approval: bool = True


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Create user as INACTIVE (pending admin approval)
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role="user",
        is_active=False,
    )
    db.add(user)
    await db.flush()

    # Notify ALL admins via Telegram + Email
    admin_result = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
    admins = admin_result.scalars().all()

    telegram_msg = (
        f"🆕 <b>Nuevo usuario registrado</b>\n\n"
        f"👤 <b>{data.full_name}</b>\n"
        f"📧 {data.email}\n\n"
        f"Actívalo desde el panel de Usuarios en PayControl."
    )
    email_subject = f"🆕 Nuevo usuario: {data.full_name} ({data.email})"
    email_body = build_reminder_email(
        f"Nuevo usuario: {data.full_name}",
        data.email,
        "Pendiente de aprobación",
        "Nuevo registro en PayControl",
    )

    for admin in admins:
        settings_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == admin.id)
        )
        admin_settings = settings_result.scalars().first()
        if not admin_settings:
            continue

        # Telegram
        if admin_settings.telegram_enabled and admin_settings.telegram_bot_token_encrypted:
            await send_telegram_with_settings(admin_settings, telegram_msg)

        # Email
        if admin_settings.email_enabled and admin_settings.smtp_host:
            await send_email_with_settings(admin_settings, admin.email, email_subject, email_body)

    return RegisterResponse(
        message="Registro exitoso. Tu cuenta será activada por el administrador.",
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalars().first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está pendiente de aprobación. Contacta al administrador.",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user
