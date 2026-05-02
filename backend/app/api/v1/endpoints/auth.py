import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.user import UserLogin, UserResponse, TokenResponse
from app.schemas.webauthn import (
    PasskeyAuthenticationOptionsResponse,
    PasskeyAuthenticationVerifyRequest,
    PasskeyCredentialResponse,
    PasskeyRegistrationOptionsRequest,
    PasskeyRegistrationOptionsResponse,
    PasskeyRegistrationVerifyRequest,
)
from app.services.notification_service import send_telegram_with_settings, send_email_with_settings, build_reminder_email
from app.services import webauthn_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=6)
    full_name: str = Field(max_length=255)
    whatsapp: str | None = Field(None, max_length=30)


class RegisterResponse(BaseModel):
    message: str
    pending_approval: bool = True


def _wa_me_link(raw: str | None) -> str | None:
    """Build a https://wa.me/<digits> link from a raw whatsapp value."""
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    return f"https://wa.me/{digits}" if len(digits) >= 7 else None


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Create user as INACTIVE (pending admin approval)
    whatsapp_clean = data.whatsapp.strip() if data.whatsapp else None
    if whatsapp_clean == "":
        whatsapp_clean = None
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        whatsapp=whatsapp_clean,
        role="user",
        is_active=False,
    )
    db.add(user)
    await db.flush()

    # Notify ALL admins via Telegram + Email
    admin_result = await db.execute(select(User).where(User.role == "admin", User.is_active == True))
    admins = admin_result.scalars().all()

    wa_link = _wa_me_link(whatsapp_clean)
    whatsapp_line_tg = ""
    if whatsapp_clean:
        if wa_link:
            whatsapp_line_tg = f'\n📱 WhatsApp: <a href="{wa_link}">{whatsapp_clean}</a>'
        else:
            whatsapp_line_tg = f"\n📱 WhatsApp: {whatsapp_clean}"

    telegram_msg = (
        f"🆕 <b>Nuevo usuario registrado</b>\n\n"
        f"👤 <b>{data.full_name}</b>\n"
        f"📧 {data.email}"
        f"{whatsapp_line_tg}\n\n"
        f"Actívalo desde el panel de Usuarios en PayControl."
    )
    email_subject = f"🆕 Nuevo usuario: {data.full_name} ({data.email})"
    email_contact_line = (
        f"{data.email}"
        if not whatsapp_clean
        else f"{data.email} · WhatsApp: {whatsapp_clean}"
        + (f' (<a href="{wa_link}">contactar</a>)' if wa_link else "")
    )
    email_body = build_reminder_email(
        f"Nuevo usuario: {data.full_name}",
        email_contact_line,
        "Pendiente de aprobación",
        "Nuevo registro en PayControl",
    )

    logger.info("Notifying %d admin(s) about new registration: %s", len(admins), data.email)

    for admin in admins:
        settings_result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == admin.id)
        )
        admin_settings = settings_result.scalars().first()
        if not admin_settings:
            logger.warning("Admin %s has no UserSettings, skipping notification", admin.email)
            continue

        logger.info("Admin %s settings: email_enabled=%s, telegram_enabled=%s, smtp_host=%s, telegram_token_set=%s",
                     admin.email, admin_settings.email_enabled, admin_settings.telegram_enabled,
                     bool(admin_settings.smtp_host), bool(admin_settings.telegram_bot_token_encrypted))

        # Telegram
        if admin_settings.telegram_enabled and admin_settings.telegram_bot_token_encrypted:
            try:
                success = await send_telegram_with_settings(admin_settings, telegram_msg)
                logger.info("Telegram notification to admin %s: %s", admin.email, "sent" if success else "failed")
            except Exception as e:
                logger.error("Telegram notification error for admin %s: %s", admin.email, e)

        # Email
        if admin_settings.email_enabled and admin_settings.smtp_host:
            try:
                success = await send_email_with_settings(admin_settings, admin.email, email_subject, email_body)
                logger.info("Email notification to admin %s: %s", admin.email, "sent" if success else "failed")
            except Exception as e:
                logger.error("Email notification error for admin %s: %s", admin.email, e)

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


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token no es de refresh")
    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin sujeto")
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no disponible")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role,
    )


# ---- Passkey / WebAuthn (biometric login) ----


@router.post(
    "/passkey/register/options",
    response_model=PasskeyRegistrationOptionsResponse,
)
async def passkey_register_options(
    _data: PasskeyRegistrationOptionsRequest,
    user: User = Depends(get_current_user),
):
    existing_ids = [c.credential_id for c in user.webauthn_credentials]
    options, state_token = webauthn_service.build_registration_options(user, existing_ids)
    return PasskeyRegistrationOptionsResponse(options=options, state_token=state_token)


@router.post(
    "/passkey/register/verify",
    response_model=PasskeyCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def passkey_register_verify(
    data: PasskeyRegistrationVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    credential = await webauthn_service.verify_registration(
        db=db,
        user=user,
        response_payload=data.response,
        state_token=data.state_token,
        device_name=data.device_name,
    )
    return credential


@router.post(
    "/passkey/login/options",
    response_model=PasskeyAuthenticationOptionsResponse,
)
async def passkey_login_options():
    options, state_token = webauthn_service.build_authentication_options()
    return PasskeyAuthenticationOptionsResponse(options=options, state_token=state_token)


@router.post("/passkey/login/verify", response_model=TokenResponse)
async def passkey_login_verify(
    data: PasskeyAuthenticationVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await webauthn_service.verify_authentication(
        db=db, response_payload=data.response, state_token=data.state_token
    )
    user.last_login = datetime.now(timezone.utc)
    await db.flush()
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role,
    )


@router.get("/passkey", response_model=list[PasskeyCredentialResponse])
async def list_passkeys(user: User = Depends(get_current_user)):
    return sorted(user.webauthn_credentials, key=lambda c: c.created_at, reverse=True)


@router.delete("/passkey/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passkey(
    credential_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await webauthn_service.delete_user_credential(db, user, credential_id)
    return None
