import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.payment import PaymentMethod
from app.schemas.payment import PaymentCreate, PaymentResponse, PaymentWithBillResponse
from app.services import bill_service, payment_service

router = APIRouter(tags=["payments"])


@router.post(
    "/bills/instances/{instance_id}/payments",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_payment(
    instance_id: uuid.UUID,
    amount: Decimal = Form(...),
    payment_date: date = Form(...),
    payment_method: PaymentMethod = Form(...),
    reference: str | None = Form(None),
    notes: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    instance = await bill_service.get_bill_instance(db, instance_id, user.id)
    if not instance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill instance not found")

    data = PaymentCreate(
        amount=amount,
        payment_date=payment_date,
        payment_method=payment_method,
        reference=reference,
        notes=notes,
    )
    payment = await payment_service.record_payment(db, instance, user.id, data, files or None, user.full_name)
    return payment


@router.get("/payments", response_model=list[PaymentWithBillResponse])
async def list_payments(
    year: int | None = Query(None),
    month: int | None = Query(None, ge=1, le=12),
    search: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await payment_service.list_payments(db, user.id, year, month, search)


@router.get("/payments/{payment_id}/attachments/{attachment_id}")
async def get_attachment_file(
    payment_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment = await payment_service.get_attachment(db, user.id, payment_id, attachment_id)
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    import os
    file_path = attachment.file_path

    # Detect if it's a local path or Google Drive file ID
    if "/" in file_path or file_path.startswith("."):
        # Local filesystem (legacy or development)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
        return FileResponse(path=file_path, media_type=attachment.file_type, filename=attachment.file_name)
    else:
        # Google Drive file ID
        from app.services.gdrive_service import download_from_drive
        content = await download_from_drive(file_path)
        if not content:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in Google Drive")
        return Response(
            content=content,
            media_type=attachment.file_type,
            headers={"Content-Disposition": f'inline; filename="{attachment.file_name}"'},
        )


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def reverse_payment(
    payment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await payment_service.reverse_payment(db, payment_id, user.id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
