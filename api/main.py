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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from api.routers import (
    admin,
    adventures,
    auth,
    battle_maps,
    beta,
    campaigns,
    characters,
    combat_beats,
    crier,
    duels,
    encounters,
    features,
    homebrew,
    inventory,
    items,
    maps,
    me,
    monsters,
    notebooks,
    npcs,
    play,
    puzzles,
    rest,
    sessions,
    shops,
    spellcasting,
    spells,
    stream,
    table,
    uploads,
    waitlist,
)
from integrations import rate_limit
from services.plan_service import PlanLimitError
from services.upload_service import is_servable

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
    from integrations.dnd_rules.class_features_2014 import CLASS_FEATURES_2014
    from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
    from integrations.dnd_rules.srd_armor_2024 import SRD_ARMOR_2024
    from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024
    from integrations.dnd_rules.stat_blocks import seed_monsters
    from services.feature_service import seed_and_backfill as seed_class_features
    from services.item_service import (
        backfill_weapon_stats,
        seed_armor,
        seed_magic_items,
        seed_weapons,
    )
    from services.spell_service import seed_srd_spells

    create_db_and_tables()
    patch_duckdb_schema()
    engine = get_engine()
    with Session(engine) as db:
        seed_monsters(db)
        seed_magic_items(db)
        seed_weapons(db, SRD_WEAPONS_2024)
        seed_armor(db, SRD_ARMOR_2024)
        # Plan 131 — the 2024 (SRD 5.2.1) and 2014 (SRD 5.1) spells, each edition
        # inserted only while it has no rows.
        seed_srd_spells(db)
        # Plan 131 — both editions' trackers, insert-if-missing; a row only goes to its
        # own edition's characters.
        seed_class_features(db, [*CLASS_FEATURES_2024, *CLASS_FEATURES_2014])
        # After all seeds, backfill magic-weapon items with stats from the
        # mundane weapon catalog so AttacksList (Plan 22) can render them.
        backfill_weapon_stats(db)
    yield


app = FastAPI(
    title="QuestLab API",
    description="Plan, run, and play D&D 5e campaigns — REST API.",
    version="1.11.0",
    lifespan=lifespan,
)

# ── Compression (Plan 128) — the builder's options payload is ~415 KB of JSON;
# gzip takes it to ~97 KB. Starlette never compresses text/event-stream, so the
# live table's SSE streams are untouched.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── CORS — allow Vite dev server (port 5173) and same-origin prod ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    # Vercel preview deployments get a unique subdomain per push — allow the
    # whole *.vercel.app pattern so branch previews can talk to the API.
    # (Not a security boundary here: auth is the explicit identity header.)
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Rate limiting (Plan 77) — per-IP windows on auth + writes; reads untouched ──
@app.middleware("http")
async def _throttle(request: Request, call_next):
    """Answer 429 (with Retry-After) when a client IP exceeds its per-minute bucket."""
    wait = rate_limit.check(
        request.url.path,
        request.method,
        request.headers,
        request.client.host if request.client else "?",
    )
    if wait is not None:
        return JSONResponse(
            status_code=429,
            content={"detail": {"code": "rate_limited", "retry_after": wait}},
            headers={"Retry-After": str(wait)},
        )
    return await call_next(request)


# ── Security headers (SEC-004) — no MIME sniffing anywhere; uploads are inert ──
_UPLOAD_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    """Refuse non-media files under /uploads and add no-sniff (and a sandbox CSP for uploads)."""
    path = request.url.path
    is_upload = path.startswith("/uploads/")
    if is_upload and not is_servable(path):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if is_upload:
        response.headers["Content-Security-Policy"] = _UPLOAD_CSP
    return response


# ── Routers ────────────────────────────────────────────────────────────────────
_PREFIX = "/api"

app.include_router(auth.router, prefix=_PREFIX)
app.include_router(campaigns.router, prefix=_PREFIX)
app.include_router(adventures.router, prefix=_PREFIX)
app.include_router(characters.router, prefix=_PREFIX)
app.include_router(encounters.router, prefix=_PREFIX)
app.include_router(maps.router, prefix=_PREFIX)
app.include_router(sessions.router, prefix=_PREFIX)
app.include_router(monsters.router, prefix=_PREFIX)
app.include_router(items.router, prefix=_PREFIX)
app.include_router(spells.router, prefix=_PREFIX)
app.include_router(homebrew.router, prefix=_PREFIX)
app.include_router(inventory.router, prefix=_PREFIX)
app.include_router(spellcasting.router, prefix=_PREFIX)
app.include_router(features.router, prefix=_PREFIX)
app.include_router(rest.router, prefix=_PREFIX)
app.include_router(uploads.router, prefix=_PREFIX)
app.include_router(admin.router, prefix=_PREFIX)
app.include_router(play.router, prefix=_PREFIX)
app.include_router(duels.router, prefix=_PREFIX)
app.include_router(stream.router, prefix=_PREFIX)
app.include_router(npcs.router, prefix=_PREFIX)
app.include_router(combat_beats.router, prefix=_PREFIX)
app.include_router(battle_maps.router, prefix=_PREFIX)
app.include_router(table.router, prefix=_PREFIX)
app.include_router(shops.router, prefix=_PREFIX)
app.include_router(waitlist.router, prefix=_PREFIX)
app.include_router(puzzles.router, prefix=_PREFIX)
app.include_router(crier.router, prefix=_PREFIX)
app.include_router(notebooks.router, prefix=_PREFIX)
app.include_router(beta.router, prefix=_PREFIX)
app.include_router(me.router, prefix=_PREFIX)


# ── Plan 130 — a plan limit (new campaign or upload past the Free plan) is a 402
# from whichever route hit it, with the plain-words detail the frontend shows.
@app.exception_handler(PlanLimitError)
async def _plan_limit(request: Request, exc: PlanLimitError) -> JSONResponse:
    """Answer 402 with ``{"detail": {"code": "plan_limit", "limit", "message"}}``."""
    return JSONResponse(status_code=402, content={"detail": exc.detail()})


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
