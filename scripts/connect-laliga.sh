#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AUTH_DIR="${SCRIPT_DIR}/../backend/auth"
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "The LaLiga helper currently supports macOS only." >&2
    exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
    echo "Install uv before running the LaLiga helper." >&2
    exit 1
fi
if [[ $# -ne 0 ]]; then
    echo "This connection command does not accept arguments." >&2
    exit 1
fi
unset VIRTUAL_ENV INTERNAL_JWT FANTASY_AUTH_BASE FANTASY_API_BASE FANTASY_ORIGIN
WORK_DIR="$(mktemp -d)"
trap 'rmdir "${WORK_DIR}"' EXIT
cd "${WORK_DIR}"
uv sync --project "${AUTH_DIR}" --extra browser
uv run --project "${AUTH_DIR}" playwright install chromium
uv run --project "${AUTH_DIR}" fantasy-browser-session \
    --auth-base https://fantasybuilder.es \
    --api-base https://fantasybuilder.es/api \
    --origin https://fantasybuilder.es \
    --pair-only
if ! open "https://fantasybuilder.es/connect-laliga"; then
    echo "Connection succeeded. Open https://fantasybuilder.es/connect-laliga yourself." >&2
fi
