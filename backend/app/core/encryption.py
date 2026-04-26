"""Simple symmetric encryption for storing secrets in DB (SMTP passwords, tokens)."""

import base64
import hashlib
from app.core.config import settings


def _get_key() -> bytes:
    return hashlib.sha256(settings.secret_key.encode()).digest()


def encrypt(plain_text: str) -> str:
    if not plain_text:
        return ""
    key = _get_key()
    # Simple XOR cipher with base64 encoding (sufficient for DB storage with app-level access control)
    encrypted = bytes(a ^ b for a, b in zip(plain_text.encode(), (key * (len(plain_text) // len(key) + 1))[:len(plain_text)]))
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    key = _get_key()
    encrypted = base64.urlsafe_b64decode(cipher_text.encode())
    decrypted = bytes(a ^ b for a, b in zip(encrypted, (key * (len(encrypted) // len(key) + 1))[:len(encrypted)]))
    return decrypted.decode()
