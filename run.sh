#!/usr/bin/env bash
# QuestLab — one-command startup script
# Usage: bash run.sh            (starts both backend + frontend dev servers)
#        bash run.sh --prod     (builds frontend, starts backend serving dist/)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"

# ── Preflight checks ────────────────────────────────────────────────────────

if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example and fill in your values:"
    echo "  cp .env.example .env"
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is not installed. Install it from https://nodejs.org"
    exit 1
fi

# ── Activate venv (create if missing) ────────────────────────────────────────

if [ ! -d .venv ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate

# ── Install Python deps ─────────────────────────────────────────────────────

echo "Installing Python dependencies..."
pip install -q -r requirements.txt

# ── Install frontend deps ────────────────────────────────────────────────────

if [ ! -d frontend/node_modules ]; then
    echo "Installing frontend dependencies..."
    (cd frontend && npm install)
fi

# ── Run Alembic migrations (postgres only) ───────────────────────────────────

DB_BACKEND=$(grep -E '^DB_BACKEND=' .env | cut -d= -f2 | tr -d '[:space:]')

if [ "$DB_BACKEND" = "postgres" ]; then
    echo "Running Alembic migrations..."
    alembic upgrade head
else
    echo "Using DuckDB — skipping Alembic (tables created at startup)."
fi

# ── Launch ───────────────────────────────────────────────────────────────────

echo ""
echo "========================================="
echo "  QuestLab starting..."
echo "========================================="

if [ "$MODE" = "--prod" ]; then
    echo "  Mode: production"
    echo "  Building frontend..."
    (cd frontend && npm run build)
    echo ""
    echo "  App: http://localhost:8000"
    echo "========================================="
    echo ""
    uvicorn api.main:app --host 0.0.0.0 --port 8000
else
    echo "  Mode: development"
    echo "  API:      http://localhost:8000/docs"
    echo "  Frontend: http://localhost:5173"
    echo "========================================="
    echo ""
    # Start API server in background, frontend in foreground
    uvicorn api.main:app --reload --port 8000 &
    API_PID=$!
    trap "kill $API_PID 2>/dev/null" EXIT
    (cd frontend && npm run dev)
fi
