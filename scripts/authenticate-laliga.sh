#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
AUTH_DIR="${REPO_ROOT}/backend/auth"

if ! command -v uv >/dev/null 2>&1; then
    echo "Required command not found: uv" >&2
    exit 1
fi

if [[ ! -f "${AUTH_DIR}/.env" ]]; then
    cp "${AUTH_DIR}/.env.example" "${AUTH_DIR}/.env"
    echo "Created backend/auth/.env from .env.example" >&2
fi

cd "${AUTH_DIR}"
# This wrapper uses backend/auth/.venv even when the caller activated the root venv.
unset VIRTUAL_ENV
uv sync --all-extras
uv run playwright install chromium
if [[ $# -eq 0 ]]; then
    set -- --pair-only
fi
exec uv run authenticate-laliga "$@"
