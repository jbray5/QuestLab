"""The uploads ledger (Plan 130): one row per file a DM uploaded.

Each successful upload (portrait, battle map or figure) is recorded with its
owner, URL and size. A DM's storage use is the sum of their rows' bytes, which
the Free plan caps. Uploads made before the ledger existed have no row and so
count as 0. The rows will also feed the future orphan sweep (blobs nothing
points at any more).
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import BigInteger, Column
from sqlalchemy.types import DateTime
from sqlmodel import Field, SQLModel

UploadKind = Literal["portrait", "map", "model"]


class Upload(SQLModel, table=True):
    """One stored file: who uploaded it, where it lives and how big it is."""

    __tablename__ = "uploads"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_email: str = Field(index=True, max_length=320)
    url: str = Field(max_length=1000)
    # BigInteger, as in migration 0060 (the sum is what the cap reads).
    size_bytes: int = Field(default=0, ge=0, sa_type=BigInteger)
    # "portrait" (also notebook pictures), "map" or "model".
    kind: str = Field(default="portrait", max_length=20)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
