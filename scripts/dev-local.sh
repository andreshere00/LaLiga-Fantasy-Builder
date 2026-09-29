#!/usr/bin/env bash
# Auth :8000, API :8001, Vite :3000 on the host. Keycloak is not started here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

test -f backend/auth/.env || cp backend/auth/.env.example backend/auth/.env
test -f backend/api/.env || cp backend/api/.env.example backend/api/.env

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install deps: uv run poe install" >&2
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting auth on :8000, API on :8001, frontend on :3000"
echo "Keycloak (if needed): docker compose up -d keycloak"

uv run --directory backend/auth uvicorn fantasy_auth.main:app --reload --port 8000 &
uv run --directory backend/api uvicorn fantasy_api.main:app --reload --port 8001 &

if command -v bun >/dev/null 2>&1; then
  (cd frontend && bun run dev) &
else
  (cd frontend && npm run dev) &
fi

wait
