"""Waitlist domain models — beta interest capture (Plan 54)."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from pydantic import Field as PField
from sqlmodel import Field, SQLModel


class WaitlistEntry(SQLModel, table=True):
    """One beta-waitlist signup from the public landing page."""

    __tablename__ = "waitlist_entries"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(min_length=3, max_length=320, index=True)
    # Where the signup came from ("demo-landing", "reddit", ...).
    source: Optional[str] = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WaitlistCreate(BaseModel):
    """Public signup payload."""

    email: str = PField(min_length=3, max_length=320)
    source: Optional[str] = None


class WaitlistRead(BaseModel):
    """Signup acknowledgement."""

    email: str
    already_registered: bool = False
