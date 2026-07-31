"""Town Crier domain models — NPC-voiced Discord posts (Plan 56).

The DM posts to a campaign Discord as different NPCs between sessions.
A Discord webhook is bound to one channel, but every POST may override
``username`` and ``avatar_url`` per message — so one webhook per channel
serves unlimited NPC identities.

Security shape: ``CrierChannel.webhook_url`` is a credential. Anyone
holding it can post to that channel as anything, forever, with no further
auth. It is therefore never serialized to a client: ``CrierChannelRead``
omits it and carries only ``configured`` plus a masked tail for the DM to
recognise which webhook is which.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from pydantic import Field as PField
from pydantic import model_validator
from sqlmodel import Field, SQLModel

# Discord's documented limits, enforced at our boundary so an over-long
# message fails in Pydantic with a clear error instead of as a 400 from
# Discord after the DM has already hit send.
MAX_CONTENT = 2000
MAX_EMBED_DESCRIPTION = 4096
MAX_USERNAME = 80


class CrierChannel(SQLModel, table=True):
    """One Discord channel the DM can post into, with its webhook."""

    __tablename__ = "crier_channels"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # The DM's label for the channel, e.g. "#blackreef-cove".
    label: str = Field(min_length=1, max_length=100)
    # CREDENTIAL — never leaves the server. See module docstring.
    webhook_url: str = Field(min_length=1, max_length=500)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CrierNpc(SQLModel, table=True):
    """An NPC identity the DM can post as (name + face + accent colour)."""

    __tablename__ = "crier_npcs"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    # Discord truncates usernames past 80 chars; reject rather than truncate.
    name: str = Field(min_length=1, max_length=MAX_USERNAME)
    # Absolute public URL — Discord fetches this itself, so a relative path
    # or a localhost URL will silently render as the webhook's default face.
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    # Embed accent bar, stored as a Discord integer colour (0xRRGGBB).
    embed_color: int = Field(default=0x2B2D31, ge=0, le=0xFFFFFF)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CrierPost(SQLModel, table=True):
    """Sent-log row. Written for failures too, so nothing posts silently."""

    __tablename__ = "crier_posts"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    channel_id: Optional[uuid.UUID] = Field(default=None, foreign_key="crier_channels.id")
    npc_id: Optional[uuid.UUID] = Field(default=None, foreign_key="crier_npcs.id")
    # Snapshots — the log stays readable after a channel or NPC is renamed
    # or deleted, which is the whole point of keeping a log.
    channel_label: str = Field(default="", max_length=100)
    npc_name: str = Field(default="", max_length=MAX_USERNAME)
    content: Optional[str] = Field(default=None, max_length=MAX_CONTENT)
    embed_description: Optional[str] = Field(default=None, max_length=MAX_EMBED_DESCRIPTION)
    # "sent" | "failed"
    status: str = Field(default="sent", max_length=20)
    error: Optional[str] = Field(default=None, max_length=500)
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Boundary models ───────────────────────────────────────────────────────────


class CrierChannelCreate(BaseModel):
    """Input for registering a channel webhook."""

    label: str = PField(min_length=1, max_length=100)
    webhook_url: str = PField(min_length=1, max_length=500)
    sort_order: int = 0


class CrierChannelUpdate(BaseModel):
    """Partial update. Omitting ``webhook_url`` leaves the stored one intact."""

    label: Optional[str] = PField(default=None, min_length=1, max_length=100)
    webhook_url: Optional[str] = PField(default=None, min_length=1, max_length=500)
    sort_order: Optional[int] = None


class CrierChannelRead(BaseModel):
    """Output for a channel — deliberately WITHOUT the webhook URL.

    ``url_hint`` is the last few characters only, enough for the DM to tell
    two webhooks apart and not enough to post with.
    """

    id: uuid.UUID
    label: str
    configured: bool
    url_hint: str
    sort_order: int


class CrierNpcCreate(BaseModel):
    """Input for adding an NPC identity."""

    name: str = PField(min_length=1, max_length=MAX_USERNAME)
    avatar_url: Optional[str] = PField(default=None, max_length=500)
    embed_color: int = PField(default=0x2B2D31, ge=0, le=0xFFFFFF)
    sort_order: int = 0


class CrierNpcUpdate(BaseModel):
    """Partial update for an NPC identity."""

    name: Optional[str] = PField(default=None, min_length=1, max_length=MAX_USERNAME)
    avatar_url: Optional[str] = PField(default=None, max_length=500)
    embed_color: Optional[int] = PField(default=None, ge=0, le=0xFFFFFF)
    sort_order: Optional[int] = None


class CrierNpcRead(BaseModel):
    """Output for an NPC identity."""

    id: uuid.UUID
    name: str
    avatar_url: Optional[str] = None
    embed_color: int
    sort_order: int

    model_config = {"from_attributes": True}


class CrierSendRequest(BaseModel):
    """A composed message: which channel, whose voice, what text."""

    channel_id: uuid.UUID
    npc_id: uuid.UUID
    content: Optional[str] = PField(default=None, max_length=MAX_CONTENT)
    embed_description: Optional[str] = PField(default=None, max_length=MAX_EMBED_DESCRIPTION)

    @model_validator(mode="after")
    def _require_some_body(self) -> "CrierSendRequest":
        """Reject an empty post — Discord 400s on it anyway."""
        if not (self.content or "").strip() and not (self.embed_description or "").strip():
            raise ValueError("A post needs content, an embed description, or both.")
        return self


class CrierPostRead(BaseModel):
    """Output for one sent-log row."""

    id: uuid.UUID
    channel_label: str
    npc_name: str
    content: Optional[str] = None
    embed_description: Optional[str] = None
    status: str
    error: Optional[str] = None
    sent_at: datetime

    model_config = {"from_attributes": True}
