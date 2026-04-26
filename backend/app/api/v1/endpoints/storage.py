from fastapi import APIRouter, Depends

from app.api.v1.deps import get_current_admin
from app.models.user import User
from app.services.gdrive_service import get_drive_usage

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/usage")
async def storage_usage(admin: User = Depends(get_current_admin)):
    """Get Google Drive storage usage. Admin only. Alert if > 80%."""
    return await get_drive_usage()
