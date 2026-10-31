"""The friends beta (Plan 125): invite codes and in-app feedback."""

import uuid
from datetime import UTC, datetime
from typing import Literal, Optional

from pydantic import BaseModel
from pydantic import Field as PField
from sqlalchemy import Column, Text
from sqlalchemy.types import DateTime
from sqlmodel import Field, SQLModel

FeedbackKind = Literal["loved", "confusing", "broken", "idea"]


class BetaInvite(SQLModel, table=True):
    """A personal invite code Justin hands a friend; creating an account may need one."""

    __tablename__ = "beta_invites"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(index=True, sa_column_kwargs={"unique": True}, max_length=40)
    # Who it is for ("Sam's table"); greets them on the sign-up page.
    label: str = Field(default="", max_length=120)
    max_uses: int = Field(default=3, ge=1, le=100)
    uses: int = Field(default=0, ge=0)
    revoked: bool = Field(default=False)
    created_by_email: str = Field(default="", max_length=320)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class Feedback(SQLModel, table=True):
    """One note a DM sent from the app's feedback sheet."""

    __tablename__ = "feedback"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, max_length=320)
    kind: str = Field(default="idea", max_length=20)
    text: str = Field(sa_column=Column(Text, nullable=False))
    page: str = Field(default="", max_length=300)
    viewport: str = Field(default="", max_length=40)
    seen: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class InviteCreate(BaseModel):
    """Make an invite: who it's for and how many accounts it may start."""

    label: str = PField(min_length=1, max_length=120)
    max_uses: int = PField(default=3, ge=1, le=100)


class InviteJoiner(BaseModel):
    """A DM who signed up with an invite."""

    email: str
    display_name: str


class InviteRead(BaseModel):
    """An invite as the admin sees it."""

    id: uuid.UUID
    code: str
    label: str
    max_uses: int
    uses: int
    revoked: bool
    created_at: datetime
    joined: list[InviteJoiner] = []


class InviteCheck(BaseModel):
    """What the sign-up page learns about a code: is it usable, and who is it for."""

    valid: bool
    label: Optional[str] = None


class FeedbackCreate(BaseModel):
    """A note from the feedback sheet."""

    kind: FeedbackKind = "idea"
    text: str = PField(min_length=1, max_length=4000)
    page: str = PField(default="", max_length=300)
    viewport: str = PField(default="", max_length=40)


class FeedbackRead(BaseModel):
    """A note as the admin inbox shows it."""

    id: uuid.UUID
    email: str
    display_name: str = ""
    kind: str
    text: str
    page: str
    viewport: str
    seen: bool
    created_at: datetime


class BetaDm(BaseModel):
    """One DM in the beta and how much they've used QuestLab."""

    email: str
    display_name: str
    invite_code: Optional[str] = None
    created_at: datetime
    last_seen_at: datetime
    campaigns: int
    sessions: int


class BetaOverview(BaseModel):
    """The admin's view of the beta: is sign-up invite-only, and who's in."""

    invites_required: bool
    dms: list[BetaDm]
