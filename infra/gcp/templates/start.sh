#!/bin/bash
# Boot from the last validated release even if Secret Manager or the registry is down.
set -euo pipefail
umask 077
source /etc/fantasybuilder/host.env
export APP_DOMAIN
exec 9>/run/lock/fantasybuilder-operation.lock
flock -n 9 || { echo 'Another application operation is already running.' >&2; exit 1; }
export CONFIG_DIR=/etc/fantasybuilder/current
test -f "$CONFIG_DIR/runtime.env"
/usr/local/sbin/fantasybuilder-metadata-guard
compose=(docker compose --env-file "$CONFIG_DIR/runtime.env" -f /opt/fantasybuilder/compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" up --detach --no-build --pull never --wait --wait-timeout 240
