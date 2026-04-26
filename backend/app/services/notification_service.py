"""Notification service for sending email and Telegram reminders.
Reads SMTP/Telegram config from user_settings in DB (not from .env)."""

import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib
import httpx

from app.core.encryption import decrypt

logger = logging.getLogger(__name__)


async def send_email_with_settings(user_settings, to: str, subject: str, body_html: str) -> bool:
    """Send email using SMTP config from user_settings (DB)."""
    if not user_settings.smtp_host or not user_settings.smtp_user:
        logger.warning("SMTP not configured for user, skipping email to %s", to)
        return False

    try:
        password = decrypt(user_settings.smtp_password_encrypted) if user_settings.smtp_password_encrypted else ""
        from_email = user_settings.smtp_from_email or user_settings.smtp_user

        message = MIMEMultipart("alternative")
        message["From"] = f"ROHU PayControl <{from_email}>"
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            message,
            hostname=user_settings.smtp_host,
            port=user_settings.smtp_port,
            username=user_settings.smtp_user,
            password=password,
            use_tls=user_settings.smtp_tls,
        )
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, str(e))
        return False


async def send_telegram_with_settings(user_settings, message: str, chat_id: str | None = None) -> bool:
    """Send Telegram message using config from user_settings (DB)."""
    token = decrypt(user_settings.telegram_bot_token_encrypted) if user_settings.telegram_bot_token_encrypted else ""
    target_chat = chat_id or user_settings.telegram_chat_id

    if not token or not target_chat:
        logger.warning("Telegram not configured, skipping message")
        return False

    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={
                "chat_id": target_chat,
                "text": message,
                "parse_mode": "HTML",
            })
            if resp.status_code == 200:
                logger.info("Telegram message sent to %s", target_chat)
                return True
            else:
                logger.error("Telegram API error: %s", resp.text)
                return False
    except Exception as e:
        logger.error("Failed to send Telegram message: %s", str(e))
        return False


def build_reminder_email(bill_name: str, amount: str, due_date: str, days_text: str) -> str:
    """Build HTML email body for bill reminder."""
    return f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1E3A8A, #06B6D4); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">ROHU PayControl</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0;">Recordatorio de pago</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #EF4444; font-weight: 600; font-size: 14px; margin: 0 0 12px;">⚠️ {days_text}</p>
            <div style="background: #F8FAFC; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <p style="font-weight: 700; font-size: 18px; margin: 0; color: #0F172A;">{bill_name}</p>
                <p style="color: #64748B; margin: 4px 0 0;">Monto: <strong style="color: #1E3A8A;">{amount}</strong></p>
                <p style="color: #64748B; margin: 4px 0 0;">Vence: <strong>{due_date}</strong></p>
            </div>
            <p style="color: #64748B; font-size: 13px; text-align: center; margin: 0;">
                Entra a PayControl para registrar tu pago y subir evidencia.
            </p>
        </div>
    </div>
    """


def build_reminder_telegram(bill_name: str, amount: str, due_date: str, days_text: str) -> str:
    """Build Telegram message for bill reminder."""
    return (
        f"🔔 <b>ROHU PayControl</b>\n\n"
        f"⚠️ {days_text}\n\n"
        f"📋 <b>{bill_name}</b>\n"
        f"💰 Monto: <b>{amount}</b>\n"
        f"📅 Vence: {due_date}\n\n"
        f"Entra a PayControl para registrar el pago."
    )
