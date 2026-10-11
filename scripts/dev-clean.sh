#!/usr/bin/env bash
# Clear stale project app processes before starting the hot-reload dev stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required to check development ports." >&2
  exit 1
fi

# Docker may still own the published ports from `poe up`.
if command -v docker >/dev/null 2>&1; then
  docker compose --profile apps stop auth api scraping frontend >/dev/null 2>&1 || true
fi

service_for_port() {
  case "$1" in
    8000) printf '%s\n' "auth fantasy_auth.main:app" ;;
    8001) printf '%s\n' "api fantasy_api.main:app" ;;
    8002) printf '%s\n' "scraping fantasy_scraping.main:create_app" ;;
  esac
}

stop_old_uvicorn() {
  local port="$1" service module pid command parent parent_command
  read -r service module < <(service_for_port "$port")

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    command="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" != *"$ROOT/backend/$service/.venv/bin/uvicorn $module"* ]]; then
      continue
    fi

    # Stop uv's reloader first so it cannot respawn the listener process.
    parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    while [[ -n "$parent" && "$parent" -gt 1 ]]; do
      parent_command="$(ps -ww -p "$parent" -o command= 2>/dev/null || true)"
      if [[ "$parent_command" == *"uv run --directory backend/$service uvicorn $module"* ]]; then
        kill -TERM "$parent" 2>/dev/null || true
        break
      fi
      parent="$(ps -p "$parent" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    done
    kill -TERM "$pid" 2>/dev/null || true
    echo "Stopped stale $service server (PID $pid) on port $port."
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

  for _ in {1..10}; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
}

for port in 8000 8001 8002; do
  stop_old_uvicorn "$port"
done

for port in 3000 8000 8001 8002; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is still occupied by another process:" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2
    exit 1
  fi
done

exec env -u DEBUG bash scripts/dev-local.sh
