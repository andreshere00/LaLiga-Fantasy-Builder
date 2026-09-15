#!/usr/bin/env bash
# Regenerate backend/api/openapi.json; exit 1 when the file changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/backend/api/openapi.json"

before="$(cksum "$TARGET" 2>/dev/null || true)"
(
  cd "$ROOT"
  uv run --directory backend/api generate-openapi
)
after="$(cksum "$TARGET")"

if [ "$before" != "$after" ]; then
  echo "openapi.json updated — stage backend/api/openapi.json and re-commit"
  exit 1
fi

echo "openapi.json is up to date"
