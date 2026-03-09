"""QuestLab FastAPI application.

Mounts all routers under /api and serves the React frontend's static build
from frontend/dist/ when it exists. In development, Vite's dev server handles
the frontend and proxies /api to this process.

Run with:
    uvicorn api.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import admin, adventures, campaigns, characters, encounters, maps, sessions

load_dotenv()

_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed SRD monsters on startup if the monster table is empty.

    Args:
        app: The FastAPI application instance.

    Yields:
        Control back to FastAPI after startup tasks complete.
    """
    from sqlmodel import Session

    from db.base import get_engine
    from integrations.dnd_rules.stat_blocks import seed_monsters

    engine = get_engine()
    with Session(engine) as db:
        seed_monsters(db)
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
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:8000",  # FastAPI serving built frontend
    ],
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
app.include_router(admin.router, prefix=_PREFIX)


@app.get("/api/health")
def health() -> dict:
    """Health check endpoint.

    Returns:
        Status dict with ``ok`` key.
    """
    return {"ok": True}


# ── Serve React frontend (production build) ────────────────────────────────────
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
