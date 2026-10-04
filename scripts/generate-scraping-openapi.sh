#!/usr/bin/env bash
# Regenerate backend/scraping/openapi.json; exit 1 when the file changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/backend/scraping/openapi.json"

before="$(cksum "$TARGET" 2>/dev/null || true)"
(
  cd "$ROOT"
  SCRAPER_CONTACT="${SCRAPER_CONTACT:-openapi@local}" \
    uv run --directory backend/scraping generate-openapi
)
after="$(cksum "$TARGET")"

if [ "$before" != "$after" ]; then
  echo "backend/scraping/openapi.json updated — stage it and re-commit"
  exit 1
fi

echo "backend/scraping/openapi.json is up to date"
