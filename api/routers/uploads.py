"""File upload router — accepts image uploads, stores them in uploads/ dir."""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel

from api.deps import CurrentUser
from services.upload_service import IMAGE_TYPES, MODEL_TYPES, VIDEO_TYPES, accept_upload

router = APIRouter(tags=["uploads"])

_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
# Animated map surfaces (Plan 71): looping MP4/WebM under the table layers.
_MAP_TYPES = IMAGE_TYPES | VIDEO_TYPES
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_MAX_MAP_BYTES = 80 * 1024 * 1024  # 80 MB — 4K stills and animated loops
# Rigged figures for the immersive table (Plan 111): a binary glTF.
_MAX_MODEL_BYTES = 30 * 1024 * 1024  # 30 MB — a 1K-textured, meshopt-packed character
# SEC-004: every upload's type comes from its bytes (services/upload_service.py),
# never from the client's filename or content-type, so no .html/.svg is stored.


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
        HTTPException 415: If the bytes are not a JPEG, PNG, WebP or GIF.
        HTTPException 413: If the file exceeds 5 MB.
    """
    contents = await file.read()
    if len(contents) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 5 MB.",
        )
    kind = accept_upload(contents, IMAGE_TYPES)
    if kind is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, WebP, or GIF images are allowed.",
        )

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.{kind.ext}"
    (_UPLOAD_DIR / filename).write_bytes(contents)

    return UploadResponse(url=f"/uploads/{filename}")


@router.post("/uploads/map", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_map(
    file: UploadFile,
    _user: CurrentUser,
) -> UploadResponse:
    """Upload a large battle-map image (up to 80 MB) for the Table View (Plan 42).

    Prefers Vercel Blob so the map survives Render's ephemeral filesystem and is
    CDN-served to the projector; falls back to the local ``uploads/`` dir in dev
    when ``BLOB_READ_WRITE_TOKEN`` is unset. Only raster image types are
    accepted (SVG/HTML are rejected — no active content can be stored).

    Args:
        file: Multipart image upload.
        _user: Authenticated DM (required; not used beyond auth).

    Returns:
        UploadResponse with the stored map's public URL.

    Raises:
        HTTPException 415: If the bytes are not an allowed image or video.
        HTTPException 413: If the file exceeds 80 MB.
    """
    contents = await file.read()
    if len(contents) > _MAX_MAP_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Map file too large. Maximum size is 80 MB.",
        )
    kind = accept_upload(contents, _MAP_TYPES)
    if kind is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, WebP, GIF images or MP4/WebM loops are allowed.",
        )

    filename = f"{uuid.uuid4()}.{kind.ext}"
    try:
        from integrations import blob_storage

        url = blob_storage.upload(
            path=f"maps/{filename}",
            data=contents,
            content_type=kind.content_type,
        )
        return UploadResponse(url=url)
    except PermissionError:
        # No blob token (local dev) — store under uploads/ and serve statically.
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (_UPLOAD_DIR / filename).write_bytes(contents)
        return UploadResponse(url=f"/uploads/{filename}")


@router.post("/uploads/model", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile,
    _user: CurrentUser,
) -> UploadResponse:
    """Upload a rigged ``.glb`` figure for the immersive table (Plan 111).

    Stored on Vercel Blob under ``models/`` (CDN, cross-origin, immutable
    cache) so every player's engine page loads it directly; falls back to the
    local ``uploads/`` dir in dev. Only a binary glTF 2 is accepted, by its
    header — a ``.gltf`` with side-car files cannot be a single upload.

    Args:
        file: Multipart ``.glb`` upload.
        _user: Authenticated DM (required; not used beyond auth).

    Returns:
        UploadResponse with the stored model's public URL.

    Raises:
        HTTPException 415: If the bytes are not a binary glTF 2.
        HTTPException 413: If the file exceeds 30 MB.
    """
    contents = await file.read()
    if len(contents) > _MAX_MODEL_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Model too large. Maximum size is 30 MB — pack it with tools/figures first.",
        )
    if accept_upload(contents, MODEL_TYPES) is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only a binary glTF (.glb) figure is allowed.",
        )

    filename = f"{uuid.uuid4()}.glb"
    try:
        from integrations import blob_storage

        url = blob_storage.upload(
            path=f"models/{filename}",
            data=contents,
            content_type="model/gltf-binary",
        )
        return UploadResponse(url=url)
    except PermissionError:
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (_UPLOAD_DIR / filename).write_bytes(contents)
        return UploadResponse(url=f"/uploads/{filename}")
