#!/bin/bash
# One Madrid-calendar extraction day per week, for the explicitly selected clubs.
set -euo pipefail
case "${1:-}" in ''|--check) ;; *) echo 'Use no arguments or --check.' >&2; exit 2 ;; esac
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export SCRAPING_BASE_URL=${SCRAPING_BASE_URL:-http://127.0.0.1:8002}
cd "$repo_root/backend/api"
exec .venv/bin/python -m fantasy_api.cli.radar_sync weekly \
  --work-dir "$repo_root/data/radar/staging" \
  --root "$repo_root/data/radar/published" \
  --registry "$repo_root/data/radar-review/registry.json" \
  --audits "$repo_root/data/radar-review/audits.json" \
  --captures "$repo_root/data/radar-review/captures" \
  --observations "$repo_root/backend/api/data/radar-discovery-barcelona-madrid.json" \
  --team-id 4 --team-id 15 --weekday wed "$@"
