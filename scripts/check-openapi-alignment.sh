#!/usr/bin/env bash
# Check API, auth, scraping OpenAPI and generated endpoint Markdown for drift.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/generate-openapi.sh"
bash "$ROOT/scripts/generate-auth-openapi.sh"
bash "$ROOT/scripts/generate-scraping-openapi.sh"

uv run --directory "$ROOT/backend/api" generate-endpoint-schemas --check
