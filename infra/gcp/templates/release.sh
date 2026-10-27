#!/bin/bash
set -euo pipefail
umask 077
source /etc/fantasybuilder/host.env
export APP_DOMAIN
exec 9>/run/lock/fantasybuilder-operation.lock
flock -n 9 || { echo 'Another application release is already running.' >&2; exit 1; }
/usr/local/sbin/fantasybuilder-metadata-guard
install -d -m 0700 /etc/fantasybuilder/releases
staging=$(mktemp -d /etc/fantasybuilder/releases/release.XXXXXX)
started=false
committed=false
cleanup() {
  if ! "$committed"; then
    if "$started"; then
      echo "Release failed after container startup; inspect candidate $staging before recovery." >&2
    else
      rm -rf "$staging"
    fi
  fi
}
trap cleanup EXIT
/usr/local/sbin/fantasybuilder-fetch-secrets "$staging"
for image in IDENTITY AUTH API SCRAPING FRONTEND; do
  if ! grep -Eq "^$image"'_IMAGE=[^[:space:]]+@sha256:[a-f0-9]{64}$' "$staging/runtime.env"; then
    echo "$image image must have an unquoted immutable sha256 digest in runtime.env." >&2
    exit 1
  fi
done
export CONFIG_DIR="$staging"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
compose=(docker compose --env-file "$staging/runtime.env" -f /opt/fantasybuilder/compose.yml)
"${compose[@]}" config --quiet
# Immutable image references belong in runtime.env; no builds run on this host.
"${compose[@]}" pull
started=true
"${compose[@]}" up --detach --no-build --wait --wait-timeout 240
# Switch all five files together only after validation, pull, and startup succeed.
python3 - "$staging" /etc/fantasybuilder/current <<'PY'
import os
import sys

candidate, current = sys.argv[1:]
link = candidate + ".link"
os.symlink(candidate, link)
os.replace(link, current)
PY
committed=true
