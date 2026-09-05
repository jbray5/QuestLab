"""User accounts and AI usage (Plan 73 — publishable QuestLab).

A ``User`` row appears the first time someone signs in through OAuth (or
is seen through the trusted header). Email stays the identity every other
table keys on (``campaign.dm_email``), so nothing downstream changes.
"""

import uuid
from datetime import UTC, datetime
from typing import Optional

from pydantic import BaseModel
from pydantic import Field as PField
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """A signed-in DM. Email is the identity; providers are links to it."""

    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    display_name: str = Field(default="", max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=1000)
    discord_id: Optional[str] = Field(default=None, index=True, max_length=64)
    patreon_id: Optional[str] = Field(default=None, index=True, max_length=64)
    # Membership snapshot — refreshed on every Patreon sign-in / link.
    patron_active: bool = Field(default=False)
    patron_tier_cents: int = Field(default=0, ge=0)
    patron_checked_at: Optional[datetime] = Field(default=None)
    # Email + password accounts (Plan 73b) — scrypt hash, null for OAuth-only users.
    password_hash: Optional[str] = Field(default=None, max_length=300)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AiUsage(SQLModel, table=True):
    """Per-user, per-day count of AI generations (quota + cost visibility)."""

    __tablename__ = "ai_usage"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, max_length=320)
    day: str = Field(index=True, max_length=10)  # YYYY-MM-DD (UTC)
    count: int = Field(default=0, ge=0)


class UserRead(BaseModel):
    """What the client learns about the signed-in DM."""

    email: str
    display_name: str
    avatar_url: Optional[str] = None
    discord_linked: bool = False
    patreon_linked: bool = False
    patron_active: bool = False
    is_admin: bool = False
    ai_allowed: bool = True
    ai_reason: Optional[str] = None
    ai_remaining_today: Optional[int] = None
    # Plan 77 — "open" (gate off), "free", a tier name, or "admin".
    tier: str = "open"
    ai_daily_limit: Optional[int] = None


class SignupRequest(BaseModel):
    """Create an account with a name, email and password."""

    name: str = PField(min_length=1, max_length=120)
    email: str = PField(min_length=3, max_length=320)
    password: str = PField(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    """Sign in with email and password."""

    email: str = PField(min_length=3, max_length=320)
    password: str = PField(min_length=1, max_length=200)


class SessionResponse(BaseModel):
    """A fresh session token plus the profile it belongs to."""

    token: str
    user: "UserRead"


class AuthProviders(BaseModel):
    """Which sign-in methods this deployment offers."""

    providers: list[str]
    # Email + password accounts need APP_SECRET to mint sessions.
    password_signup: bool = False
    mode: str  # "oauth" | "header"
    patreon_url: Optional[str] = None
    ai_gate: str  # "off" | "patreon"


class AiPlan(BaseModel):
    """One Patreon tier as shown in the paywall and the guide (Plan 77)."""

    name: str
    label: str
    price_cents: int
    daily: int
    scope: str  # "text" | "all"
    blurb: str


class AiPlans(BaseModel):
    """The public tier table."""

    gate: str  # "off" | "patreon"
    patreon_url: Optional[str] = None
    plans: list[AiPlan]
