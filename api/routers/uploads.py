"""File upload router — accepts image uploads, stores them in uploads/ dir."""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel

from api.deps import CurrentUser

router = APIRouter(tags=["uploads"])

_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Animated map surfaces (Plan 71): looping MP4/WebM under the table layers.
_ALLOWED_MAP_CONTENT_TYPES = _ALLOWED_CONTENT_TYPES | {"video/mp4", "video/webm"}
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_MAX_MAP_BYTES = 80 * 1024 * 1024  # 80 MB — 4K stills and animated loops
# Rigged figures for the immersive table (Plan 111): a binary glTF, checked by
# its magic rather than the browser's content-type, which is usually blank
# or octet-stream for a .glb.
_MAX_MODEL_BYTES = 30 * 1024 * 1024  # 30 MB — a 1K-textured, meshopt-packed character
_GLB_MAGIC = b"glTF"


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


@router.post("/uploads/map", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_map(
    file: UploadFile,
    _user: CurrentUser,
) -> UploadResponse:
    """Upload a large battle-map image (up to 40 MB) for the Table View (Plan 42).

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
        HTTPException 415: If the file is not an allowed raster image type.
        HTTPException 413: If the file exceeds 40 MB.
    """
    if file.content_type not in _ALLOWED_MAP_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, WebP, GIF images or MP4/WebM loops are allowed.",
        )
    contents = await file.read()
    if len(contents) > _MAX_MAP_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Map file too large. Maximum size is 80 MB.",
        )

    original = file.filename or "map"
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else "png"
    filename = f"{uuid.uuid4()}.{ext}"
    try:
        from integrations import blob_storage

        url = blob_storage.upload(
            path=f"maps/{filename}",
            data=contents,
            content_type=file.content_type or "image/png",
        )
        return UploadResponse(url=url)
    except PermissionError:
        # No blob token (local dev) — store under uploads/ and serve statically.
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (_UPLOAD_DIR / filename).write_bytes(contents)
        return UploadResponse(url=f"/uploads/{filename}")


def is_glb(contents: bytes) -> bool:
    """True when the bytes are a binary glTF 2.0 container.

    The 12-byte header is ``"glTF"``, the version (``2``) and the total length
    as little-endian uint32s. Checking the magic and version keeps HTML, SVG
    or a mislabelled picture out of the model store.

    Args:
        contents: The uploaded bytes.

    Returns:
        Whether the header is a glTF 2 binary.
    """
    if len(contents) < 12 or contents[:4] != _GLB_MAGIC:
        return False
    return int.from_bytes(contents[4:8], "little") == 2


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
    if not is_glb(contents):
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
