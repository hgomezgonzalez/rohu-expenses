"""Google Drive storage service for payment evidence files.
Adapted from Recuerdos project (same OAuth2 pattern)."""

import asyncio
import io
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

_drive_service = None
_folder_cache: dict[str, str] = {}  # user_name → folder_id

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def is_gdrive_available() -> bool:
    """Return True if Google Drive OAuth2 is fully configured."""
    return (
        bool(settings.gdrive_client_id)
        and bool(settings.gdrive_client_secret)
        and bool(settings.gdrive_refresh_token)
    )


def _get_drive_service():
    """Build and cache the Google Drive API service using OAuth2 refresh token."""
    global _drive_service
    if _drive_service is not None:
        return _drive_service

    if not is_gdrive_available():
        raise RuntimeError("Google Drive is not configured.")

    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=None,
        refresh_token=settings.gdrive_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.gdrive_client_id,
        client_secret=settings.gdrive_client_secret,
        scopes=SCOPES,
    )
    creds.refresh(Request())

    _drive_service = build("drive", "v3", credentials=creds)
    logger.info("Google Drive service initialized via OAuth2.")
    return _drive_service


def _sync_get_or_create_folder(folder_name: str, parent_id: str) -> str:
    """Find or create a folder in Google Drive. Synchronous."""
    if folder_name in _folder_cache:
        return _folder_cache[folder_name]

    service = _get_drive_service()

    # Sanitize folder name
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', folder_name).strip()
    if not safe_name:
        safe_name = "default"

    # Check if folder exists
    query = (
        f"name = '{safe_name}' and '{parent_id}' in parents "
        f"and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    results = service.files().list(q=query, fields="files(id)").execute()
    existing = results.get("files", [])
    if existing:
        folder_id = existing[0]["id"]
        _folder_cache[folder_name] = folder_id
        return folder_id

    # Create folder
    folder_metadata = {
        "name": safe_name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = service.files().create(body=folder_metadata, fields="id").execute()
    folder_id = folder["id"]
    _folder_cache[folder_name] = folder_id
    logger.info("Created Drive folder '%s': %s", safe_name, folder_id)
    return folder_id


def _sync_upload(content: bytes, filename: str, mime_type: str, folder_id: str) -> str:
    """Upload bytes to Google Drive. Returns file_id. Synchronous."""
    from googleapiclient.http import MediaIoBaseUpload

    service = _get_drive_service()
    file_metadata = {"name": filename, "parents": [folder_id]}
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=False)

    result = service.files().create(
        body=file_metadata, media_body=media, fields="id",
    ).execute()

    file_id = result["id"]
    logger.info("Uploaded %s (%s) to Drive: %s", filename, mime_type, file_id)
    return file_id


def _sync_download(file_id: str) -> bytes | None:
    """Download file bytes from Google Drive. Returns None on error. Synchronous."""
    from googleapiclient.http import MediaIoBaseDownload

    try:
        service = _get_drive_service()
        request = service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buffer.getvalue()
    except Exception as e:
        logger.error("Failed to download Drive file %s: %s", file_id, e)
        return None


def _sync_delete(file_id: str) -> None:
    """Delete a file from Google Drive. Fire-and-forget. Synchronous."""
    try:
        service = _get_drive_service()
        service.files().delete(fileId=file_id).execute()
        logger.info("Deleted Drive file: %s", file_id)
    except Exception as e:
        logger.warning("Failed to delete Drive file %s: %s", file_id, e)


def _sync_get_usage() -> dict:
    """Get Drive storage usage. Synchronous."""
    try:
        service = _get_drive_service()
        about = service.about().get(fields="storageQuota").execute()
        quota = about.get("storageQuota", {})
        limit_bytes = int(quota.get("limit", 0))
        used_bytes = int(quota.get("usage", 0))
        limit_gb = round(limit_bytes / (1024**3), 2) if limit_bytes else 15.0
        used_gb = round(used_bytes / (1024**3), 2)
        used_pct = round((used_bytes / limit_bytes) * 100, 1) if limit_bytes else 0
        return {
            "drive_enabled": True,
            "storage_limit_gb": limit_gb,
            "storage_used_gb": used_gb,
            "storage_used_pct": used_pct,
            "alert": used_pct > 80,
        }
    except Exception as e:
        logger.error("Failed to get Drive usage: %s", e)
        return {"drive_enabled": False, "error": str(e)}


# --- Async wrappers (for FastAPI async endpoints) ---

async def upload_to_drive(content: bytes, filename: str, mime_type: str, user_name: str) -> str | None:
    """Upload file to Drive in user's folder. Returns file_id or None on failure."""
    if not is_gdrive_available():
        return None
    try:
        loop = asyncio.get_event_loop()
        parent = settings.gdrive_folder_id
        if parent:
            folder_id = await loop.run_in_executor(None, _sync_get_or_create_folder, user_name, parent)
        else:
            folder_id = None
        file_id = await loop.run_in_executor(None, _sync_upload, content, filename, mime_type, folder_id or parent)
        return file_id
    except Exception as e:
        logger.error("Drive upload failed for %s: %s", filename, e)
        return None


async def download_from_drive(file_id: str) -> bytes | None:
    """Download file bytes from Drive. Returns None on failure."""
    if not is_gdrive_available():
        return None
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_download, file_id)


async def delete_from_drive(file_path: str) -> None:
    """Delete file from Drive if file_path looks like a Drive ID (not a local path)."""
    if not is_gdrive_available():
        return
    if "/" in file_path or file_path.startswith("."):
        return  # Local path, skip
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_delete, file_path)


async def get_drive_usage() -> dict:
    """Get Drive storage usage info."""
    if not is_gdrive_available():
        return {"drive_enabled": False}
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_get_usage)
