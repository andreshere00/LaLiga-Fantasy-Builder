#!/usr/bin/env bash
# Auth :8000, API :8001, Vite :3000 on the host. Identity :8003; PostgreSQL and a mail sink are required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

test -f backend/identity/.env || cp backend/identity/.env.example backend/identity/.env

test -f backend/auth/.env || cp backend/auth/.env.example backend/auth/.env
test -f backend/api/.env || cp backend/api/.env.example backend/api/.env
test -f backend/scraping/.env || cp backend/scraping/.env.example backend/scraping/.env

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install deps: uv run poe install" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to check identity readiness." >&2
  exit 1
fi

children=()
cleanup() {
  trap - EXIT INT TERM
  for child in "${children[@]}"; do kill -TERM "$child" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "Starting auth on :8000, API on :8001, frontend on :3000"
echo "Starting scraping on :8002"
echo "Dependencies: docker compose up -d postgres redis mailpit"
export INTERNAL_JWT_ISSUER="${INTERNAL_JWT_ISSUER:-http://localhost:3000/auth}"
export AUTH_JWKS_URL="${AUTH_JWKS_URL:-http://localhost:8003/auth/jwks}"
(cd backend/identity && bun run migrate && exec bun run dev) &
children+=("$!")
identity_pid=$!

# Migration and the Node watcher can take longer than Vite to start. Do not
# expose the frontend until its session endpoint has a healthy dependency.
echo "Waiting for identity on :8003 (database and mail transport)..."
identity_deadline=$((SECONDS + 60))
until curl --silent --fail --output /dev/null --max-time 2 \
  http://127.0.0.1:8003/health/ready; do
  if ! kill -0 "$identity_pid" 2>/dev/null; then
    echo "Identity exited during startup. Check the migration/configuration error above." >&2
    exit 1
  fi
  if (( SECONDS >= identity_deadline )); then
    echo "Identity is not ready. Check PostgreSQL, Mailpit and backend/identity/.env." >&2
    exit 1
  fi
  sleep 1
done

# The API and scraper share this token for the private scrape endpoints.
SCRAPING_BASE_URL="${SCRAPING_BASE_URL:-http://localhost:8002}"
SCRAPING_SERVICE_TOKEN="${SCRAPING_SERVICE_TOKEN:-$(sed -n 's/^SCRAPING_SERVICE_TOKEN=//p' backend/scraping/.env | head -n 1)}"
export SCRAPING_BASE_URL SCRAPING_SERVICE_TOKEN

uv run --directory backend/auth uvicorn fantasy_auth.main:app --reload --port 8000 &
children+=("$!")
uv run --directory backend/api uvicorn fantasy_api.main:app --reload --port 8001 &
children+=("$!")
uv run --directory backend/scraping uvicorn fantasy_scraping.main:create_app --factory --reload --port 8002 &
children+=("$!")

if command -v bun >/dev/null 2>&1; then
  (cd frontend && exec bun run dev) &
else
  (cd frontend && exec npm run dev) &
fi

children+=("$!")
wait
