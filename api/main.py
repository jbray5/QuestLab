"""QuestLab FastAPI application.

Mounts all routers under /api and serves the React frontend's static build
from frontend/dist/ when it exists. In development, Vite's dev server handles
the frontend and proxies /api to this process.

Run with:
    uvicorn api.main:app --reload --port 8000
"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import (
    admin,
    adventures,
    campaigns,
    characters,
    encounters,
    features,
    inventory,
    items,
    maps,
    monsters,
    npcs,
    play,
    rest,
    sessions,
    spellcasting,
    spells,
    stream,
    uploads,
)

load_dotenv()

_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

_DEFAULT_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:8000",  # FastAPI serving built frontend
]
# CORS_ORIGINS env var: comma-separated extra origins (e.g. the Container Apps URL)
_extra = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
_CORS_ORIGINS = _DEFAULT_ORIGINS + _extra


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed SRD monsters on startup if the monster table is empty.

    Args:
        app: The FastAPI application instance.

    Yields:
        Control back to FastAPI after startup tasks complete.
    """
    from sqlmodel import Session

    from db.base import create_db_and_tables, get_engine, patch_duckdb_schema
    from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
    from integrations.dnd_rules.srd_spells_2024 import SRD_SPELLS_2024
    from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024
    from integrations.dnd_rules.stat_blocks import seed_monsters
    from services.feature_service import seed_catalog as seed_class_features
    from services.item_service import backfill_weapon_stats, seed_magic_items, seed_weapons
    from services.spell_service import seed_spells

    create_db_and_tables()
    patch_duckdb_schema()
    engine = get_engine()
    with Session(engine) as db:
        seed_monsters(db)
        seed_magic_items(db)
        seed_weapons(db, SRD_WEAPONS_2024)
        seed_spells(db, SRD_SPELLS_2024)
        seed_class_features(db, CLASS_FEATURES_2024)
        # After all seeds, backfill magic-weapon items with stats from the
        # mundane weapon catalog so AttacksList (Plan 22) can render them.
        backfill_weapon_stats(db)
    yield


app = FastAPI(
    title="QuestLab API",
    description="AI-powered D&D 5e campaign planning tool — REST API.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — allow Vite dev server (port 5173) and same-origin prod ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
_PREFIX = "/api"

app.include_router(campaigns.router, prefix=_PREFIX)
app.include_router(adventures.router, prefix=_PREFIX)
app.include_router(characters.router, prefix=_PREFIX)
app.include_router(encounters.router, prefix=_PREFIX)
app.include_router(maps.router, prefix=_PREFIX)
app.include_router(sessions.router, prefix=_PREFIX)
app.include_router(monsters.router, prefix=_PREFIX)
app.include_router(items.router, prefix=_PREFIX)
app.include_router(spells.router, prefix=_PREFIX)
app.include_router(inventory.router, prefix=_PREFIX)
app.include_router(spellcasting.router, prefix=_PREFIX)
app.include_router(features.router, prefix=_PREFIX)
app.include_router(rest.router, prefix=_PREFIX)
app.include_router(uploads.router, prefix=_PREFIX)
app.include_router(admin.router, prefix=_PREFIX)
app.include_router(play.router, prefix=_PREFIX)
app.include_router(stream.router, prefix=_PREFIX)
app.include_router(npcs.router, prefix=_PREFIX)


@app.get("/api/health")
def health() -> dict:
    """Health check endpoint.

    Returns:
        Status dict with ``ok`` key.
    """
    return {"ok": True}


# ── Serve uploaded images ──────────────────────────────────────────────────────
_UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
_UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

# ── Serve React frontend (production build) ────────────────────────────────────
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
