"""Pydantic schemas for WebAuthn / Passkey endpoints.

The actual `options` payload is the JSON produced by py_webauthn's
`options_to_json()` helper — its shape is dictated by the WebAuthn spec.
We keep the Python typing loose (`dict[str, Any]`) on those fields so the
spec-conformant payload flows through unchanged to the browser SDK.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---- Registration (enrollment) ----


class PasskeyRegistrationOptionsRequest(BaseModel):
    device_name: str | None = Field(default=None, max_length=120)


class PasskeyRegistrationOptionsResponse(BaseModel):
    options: dict[str, Any]
    state_token: str


class PasskeyRegistrationVerifyRequest(BaseModel):
    response: dict[str, Any]
    state_token: str
    device_name: str | None = Field(default=None, max_length=120)


class PasskeyCredentialResponse(BaseModel):
    id: uuid.UUID
    device_name: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- Authentication (login) ----


class PasskeyAuthenticationOptionsResponse(BaseModel):
    options: dict[str, Any]
    state_token: str


class PasskeyAuthenticationVerifyRequest(BaseModel):
    response: dict[str, Any]
    state_token: str
