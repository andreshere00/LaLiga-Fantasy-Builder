#!/bin/bash
set -euo pipefail
umask 077
source /etc/fantasybuilder/host.env
export APP_DOMAIN
test -f /etc/fantasybuilder/enabled || exit 0
exec 9>/run/lock/fantasybuilder-operation.lock
flock -n 9 || exit 0
staging=$(mktemp -d /var/lib/fantasybuilder-backup.XXXXXX)
trap 'rm -rf "$staging"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%S)-$(cat /proc/sys/kernel/random/uuid)
compose=(docker compose --env-file /etc/fantasybuilder/current/runtime.env -f /opt/fantasybuilder/compose.yml)
for database in fantasy_identity fantasy_auth; do
  "${compose[@]}" exec -T postgres pg_dump -U fantasy --format=custom "$database" > "$staging/$database.dump"
done
for database in fantasy_identity fantasy_auth; do
  # Unique object names let the VM upload with objectCreator, without delete/read access.
  gcloud storage cp "$staging/$database.dump" \
    "gs://$BACKUP_BUCKET/postgres/$stamp/$database.dump" --project="$PROJECT_ID" --quiet
done
printf '%s\n' '{"format":1,"databases":["fantasy_identity","fantasy_auth"]}' > "$staging/manifest.json"
gcloud storage cp "$staging/manifest.json" \
  "gs://$BACKUP_BUCKET/postgres/$stamp/manifest.json" --project="$PROJECT_ID" --quiet
echo 'Both PostgreSQL database backups uploaded.'
