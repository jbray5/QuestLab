"""BattleMap domain models — campaign-scoped battle-map library (Plan 42).

A BattleMap is one imported map image (Czepeku/Roll20 export, etc.) with
optional prep-authored fog **regions**: named polygons in image-pixel
coordinates the DM reveals one tap at a time during play. Regions are stored
as JSON on the row (they are display geometry read/written as a set, not
relational data).
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from pydantic import BaseModel
from pydantic import Field as PydField
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class BattleMap(SQLModel, table=True):
    """One battle-map image in a campaign's library."""

    __tablename__ = "battle_maps"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    name: str = Field(min_length=1, max_length=120)
    image_url: str = Field(min_length=1, max_length=1000)
    # Native pixel dimensions of the image — the Table View uses them as the
    # SVG viewBox so all token/region coordinates are plain image pixels.
    width: int = Field(ge=1, le=20000)
    height: int = Field(ge=1, le=20000)
    # Optional square-grid size in pixels (Czepeku maps are typically 140–160
    # px/square). None = gridless; the view then hides the grid overlay.
    grid_size: Optional[int] = Field(default=None, ge=8, le=1000)
    # JSON list of fog regions: [{id, name, points: [[x,y], ...]}]. Points are
    # image-pixel coords. Authored at prep time; revealed live per-session.
    regions: Optional[list] = Field(default=None, sa_column=Column(JSON, nullable=True))
    # AI-generated 360° panorama wrapped around the 3D board (Plan 45).
    backdrop_url: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class FogRegion(BaseModel):
    """A named fog polygon in image-pixel coordinates."""

    id: str = PydField(min_length=1, max_length=40)
    name: str = PydField(default="", max_length=80)
    points: list[list[float]] = PydField(default_factory=list)


class BattleMapCreate(BaseModel):
    """Input schema for adding a map to the library."""

    name: str = PydField(min_length=1, max_length=120)
    image_url: str = PydField(min_length=1, max_length=1000)
    width: int = PydField(ge=1, le=20000)
    height: int = PydField(ge=1, le=20000)
    grid_size: Optional[int] = PydField(default=None, ge=8, le=1000)
    regions: list[FogRegion] = PydField(default_factory=list)


class BattleMapUpdate(BaseModel):
    """Partial update for a battle map (rename, regrid, edit fog regions, backdrop)."""

    name: Optional[str] = PydField(default=None, min_length=1, max_length=120)
    grid_size: Optional[int] = PydField(default=None, ge=8, le=1000)
    regions: Optional[list[FogRegion]] = None
    backdrop_url: Optional[str] = PydField(default=None, max_length=1000)


class BattleMapRead(BaseModel):
    """Output schema for a battle map."""

    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    image_url: str
    width: int
    height: int
    grid_size: Optional[int] = None
    regions: list[dict[str, Any]] = PydField(default_factory=list)
    backdrop_url: Optional[str] = None

    model_config = {"from_attributes": True}
