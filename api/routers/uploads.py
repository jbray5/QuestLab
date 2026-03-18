"""File upload router — accepts image uploads, stores them in uploads/ dir."""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel

from api.deps import CurrentUser

router = APIRouter(tags=["uploads"])

_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


class UploadResponse(BaseModel):
    """Response returned after a successful file upload."""

    url: str


@router.post("/uploads", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile,
    _user: CurrentUser,
) -> UploadResponse:
    """Upload an image file and return its public URL.

    Accepts JPEG, PNG, WebP, or GIF up to 5 MB. Saves the file to the
    ``uploads/`` directory and returns a ``/uploads/{filename}`` URL that
    FastAPI serves as a static file.

    Args:
        file: Multipart image upload.
        _user: Authenticated DM (required; not used beyond auth check).

    Returns:
        UploadResponse with the public URL for the stored image.

    Raises:
        HTTPException 415: If the file is not an allowed image type.
        HTTPException 413: If the file exceeds 5 MB.
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, WebP, or GIF images are allowed.",
        )

    contents = await file.read()
    if len(contents) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 5 MB.",
        )

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original = file.filename or "upload"
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    (_UPLOAD_DIR / filename).write_bytes(contents)

    return UploadResponse(url=f"/uploads/{filename}")
