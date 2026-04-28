import os
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from fastapi import UploadFile

from app.models.bill_instance import BillInstance, BillStatus
from app.models.payment import Payment
from app.models.attachment import Attachment
from app.schemas.payment import PaymentCreate, PaymentWithBillResponse, AttachmentResponse
from app.core.config import settings
from app.services.bill_service import compute_bill_status


async def record_payment(
    db: AsyncSession,
    bill_instance: BillInstance,
    user_id: uuid.UUID,
    data: PaymentCreate,
    files: list[UploadFile] | None = None,
    user_name: str = "default",
) -> Payment:
    payment = Payment(
        bill_instance_id=bill_instance.id,
        user_id=user_id,
        amount=data.amount,
        payment_date=data.payment_date,
        payment_method=data.payment_method,
        reference=data.reference,
        notes=data.notes,
    )
    db.add(payment)
    await db.flush()

    # Handle file uploads
    if files:
        for file in files:
            attachment = await _save_attachment(db, payment.id, file, user_name)
            if attachment:
                db.add(attachment)

    # Update bill instance status to PAID
    bill_instance.status = BillStatus.PAID
    bill_instance.paid_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(payment, ["attachments"])

    return payment


async def _save_attachment(
    db: AsyncSession, payment_id: uuid.UUID, file: UploadFile, user_name: str = "default"
) -> Attachment | None:
    if not file.filename:
        return None

    if file.content_type not in settings.allowed_file_types_list:
        return None

    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        return None

    content_type = file.content_type or "application/octet-stream"

    # Compress images with Pillow (reduces 5-10MB phone photos to ~100-200KB)
    if content_type.startswith("image/"):
        from PIL import Image
        from io import BytesIO
        img = Image.open(BytesIO(content))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        if img.width > settings.image_max_width:
            ratio = settings.image_max_width / img.width
            img = img.resize((settings.image_max_width, int(img.height * ratio)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=settings.image_quality, optimize=True)
        content = buf.getvalue()
        content_type = "image/jpeg"
        safe_filename = f"{uuid.uuid4()}.jpg"
    else:
        ext = os.path.splitext(file.filename)[1]
        safe_filename = f"{uuid.uuid4()}{ext}"

    # Upload to Google Drive if available, otherwise save locally
    from app.services.gdrive_service import is_gdrive_available, upload_to_drive

    if is_gdrive_available():
        drive_file_id = await upload_to_drive(content, safe_filename, content_type, user_name)
        if drive_file_id:
            return Attachment(
                payment_id=payment_id,
                file_path=drive_file_id,
                file_name=file.filename,
                file_type=content_type,
                file_size=len(content),
            )
        # Drive upload failed — fall through to local storage
        import logging
        logging.getLogger(__name__).warning("Drive upload failed, saving locally")

    # Local fallback (development or Drive unavailable)
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, safe_filename)
    with open(file_path, "wb") as f:
        f.write(content)

    return Attachment(
        payment_id=payment_id,
        file_path=file_path,
        file_name=file.filename,
        file_type=content_type,
        file_size=len(content),
    )


async def list_payments(
    db: AsyncSession,
    user_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
    search: str | None = None,
) -> list[PaymentWithBillResponse]:
    query = (
        select(Payment)
        .options(
            joinedload(Payment.bill_instance).joinedload(BillInstance.category),
            joinedload(Payment.attachments),
        )
        .join(BillInstance, Payment.bill_instance_id == BillInstance.id)
        .where(Payment.user_id == user_id)
    )

    if year:
        query = query.where(extract("year", Payment.payment_date) == year)
    if month:
        query = query.where(extract("month", Payment.payment_date) == month)
    if search:
        query = query.where(BillInstance.name.ilike(f"%{search}%"))

    query = query.order_by(Payment.payment_date.desc())
    result = await db.execute(query)
    payments = list(result.scalars().unique().all())

    return [
        PaymentWithBillResponse(
            id=p.id,
            bill_instance_id=p.bill_instance_id,
            bill_name=p.bill_instance.name,
            bill_category=p.bill_instance.category.name,
            amount=p.amount,
            payment_date=p.payment_date,
            payment_method=p.payment_method,
            reference=p.reference,
            notes=p.notes,
            attachments=[AttachmentResponse.model_validate(a) for a in p.attachments],
            created_at=p.created_at,
        )
        for p in payments
    ]


async def get_attachment(
    db: AsyncSession, user_id: uuid.UUID, payment_id: uuid.UUID, attachment_id: uuid.UUID
) -> Attachment | None:
    result = await db.execute(
        select(Attachment)
        .join(Payment, Attachment.payment_id == Payment.id)
        .where(
            Attachment.id == attachment_id,
            Attachment.payment_id == payment_id,
            Payment.user_id == user_id,
        )
    )
    return result.scalars().first()


async def reverse_payment(db: AsyncSession, payment_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """Delete a payment and revert the bill instance status based on current date."""
    from datetime import date

    result = await db.execute(
        select(Payment)
        .options(joinedload(Payment.attachments))
        .where(Payment.id == payment_id, Payment.user_id == user_id)
    )
    payment = result.scalars().first()
    if not payment:
        return False

    # Delete attachments (files + DB records) manually — FK CASCADE may not exist in DB
    from app.services.gdrive_service import delete_from_drive
    for att in payment.attachments:
        try:
            await delete_from_drive(att.file_path)
        except Exception:
            pass
        if os.path.exists(att.file_path):
            os.remove(att.file_path)
        await db.delete(att)

    # Get the bill instance
    bi_result = await db.execute(
        select(BillInstance).where(BillInstance.id == payment.bill_instance_id)
    )
    bill_instance = bi_result.scalars().first()

    # Delete the payment
    await db.delete(payment)
    await db.flush()

    # Recalculate bill instance status
    if bill_instance:
        # Check if there are other payments for this instance
        other_payments = await db.execute(
            select(Payment).where(Payment.bill_instance_id == bill_instance.id)
        )
        if not other_payments.scalars().first():
            # No more payments — revert status based on due_date.
            bill_instance.status = compute_bill_status(bill_instance.due_date)
            bill_instance.paid_at = None
            await db.flush()

    return True
