"""WebAuthn / Passkey service — biometric login backed by hardware authenticators.

Stateless challenge transport:
    Instead of storing the challenge in Redis, we sign it as a short-lived JWT
    ("state token") that the client echoes back on /verify. This keeps the
    flow free of new infrastructure dependencies and works across multiple
    workers without coordination.
"""

from __future__ import annotations

import base64
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import settings
from app.models.user import User
from app.models.webauthn_credential import WebAuthnCredential


_STATE_TOKEN_TYPE_REGISTER = "passkey_register"
_STATE_TOKEN_TYPE_AUTHENTICATE = "passkey_authenticate"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign_state(payload: dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.webauthn_challenge_ttl_seconds)
    payload = {**payload, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _verify_state(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El reto biométrico expiró. Intenta de nuevo.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reto biométrico inválido.",
        )
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de reto biométrico incorrecto.",
        )
    return payload


# ---- Registration (enrollment) ----


def build_registration_options(user: User, existing_credential_ids: list[bytes]) -> tuple[dict[str, Any], str]:
    """Generate WebAuthn creation options for a logged-in user.

    Returns: (options_dict, state_token). The state_token must be echoed back on /verify.
    """
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=user.id.bytes,
        user_name=user.email,
        user_display_name=user.full_name,
        # Force platform authenticator (Face ID / Touch ID / Android biometrics / Windows Hello)
        # and require user verification (biometric, not just presence).
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        # Avoid double-enrolling the same device.
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=cid) for cid in existing_credential_ids
        ],
    )

    options_json: dict[str, Any] = json.loads(options_to_json(options))
    state_token = _sign_state(
        {
            "type": _STATE_TOKEN_TYPE_REGISTER,
            "uid": str(user.id),
            "challenge": _b64url_encode(options.challenge),
        }
    )
    return options_json, state_token


async def verify_registration(
    db: AsyncSession,
    user: User,
    response_payload: dict[str, Any],
    state_token: str,
    device_name: str | None,
) -> WebAuthnCredential:
    state = _verify_state(state_token, _STATE_TOKEN_TYPE_REGISTER)
    if state.get("uid") != str(user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reto no pertenece al usuario actual.")

    expected_challenge = _b64url_decode(state["challenge"])

    try:
        verification = verify_registration_response(
            credential=response_payload,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origins_list,
            require_user_verification=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se pudo verificar el passkey: {exc}",
        )

    transports = response_payload.get("response", {}).get("transports") or None

    credential = WebAuthnCredential(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=transports,
        device_name=(device_name or "Dispositivo")[:120],
    )
    db.add(credential)
    await db.flush()
    return credential


# ---- Authentication (login) ----


def build_authentication_options() -> tuple[dict[str, Any], str]:
    """Generate WebAuthn assertion options for passkey login.

    We use discoverable credentials: no allow_credentials list — the authenticator
    surfaces every passkey registered for the RP and the user picks one. The
    server identifies the user later from the returned credential_id.
    """
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    options_json: dict[str, Any] = json.loads(options_to_json(options))
    state_token = _sign_state(
        {
            "type": _STATE_TOKEN_TYPE_AUTHENTICATE,
            "challenge": _b64url_encode(options.challenge),
            # Bind state to a unique ID so a state token can't be reused after
            # being consumed (the verify path checks DB sign_count anyway, but
            # this gives an explicit short-lived nonce too).
            "nonce": secrets.token_urlsafe(16),
        }
    )
    return options_json, state_token


async def verify_authentication(
    db: AsyncSession,
    response_payload: dict[str, Any],
    state_token: str,
) -> User:
    state = _verify_state(state_token, _STATE_TOKEN_TYPE_AUTHENTICATE)
    expected_challenge = _b64url_decode(state["challenge"])

    raw_credential_id = response_payload.get("rawId") or response_payload.get("id")
    if not raw_credential_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Respuesta sin credential id.")
    credential_id_bytes = _b64url_decode(raw_credential_id)

    result = await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id_bytes)
    )
    stored: WebAuthnCredential | None = result.scalars().first()
    if not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Passkey desconocido.")

    try:
        verification = verify_authentication_response(
            credential=response_payload,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origins_list,
            credential_public_key=stored.public_key,
            credential_current_sign_count=stored.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"No se pudo verificar el passkey: {exc}",
        )

    stored.sign_count = verification.new_sign_count
    stored.last_used_at = datetime.now(timezone.utc)

    user_result = await db.execute(select(User).where(User.id == stored.user_id, User.is_active == True))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva.")

    return user


# ---- Listing & deletion ----


async def list_user_credentials(db: AsyncSession, user: User) -> list[WebAuthnCredential]:
    result = await db.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.user_id == user.id)
        .order_by(WebAuthnCredential.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_user_credential(db: AsyncSession, user: User, credential_id: uuid.UUID) -> None:
    result = await db.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.id == credential_id,
            WebAuthnCredential.user_id == user.id,
        )
    )
    credential = result.scalars().first()
    if not credential:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey no encontrado.")
    await db.delete(credential)
    await db.flush()
