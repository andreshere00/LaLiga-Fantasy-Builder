#!/usr/bin/env bash
# Regenerate committed OpenAPI for api and auth; fail when files drift.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/generate-openapi.sh"
bash "$ROOT/scripts/generate-auth-openapi.sh"
