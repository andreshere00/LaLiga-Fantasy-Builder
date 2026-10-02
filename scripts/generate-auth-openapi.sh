#!/usr/bin/env bash
# Regenerate backend/auth/openapi.json; exit 1 when the file changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/backend/auth/openapi.json"

before="$(cksum "$TARGET" 2>/dev/null || true)"
(
  cd "$ROOT"
  uv run --directory backend/auth generate-openapi
)
after="$(cksum "$TARGET")"

if [ "$before" != "$after" ]; then
  echo "backend/auth/openapi.json updated — stage it and re-commit"
  exit 1
fi

echo "backend/auth/openapi.json is up to date"
