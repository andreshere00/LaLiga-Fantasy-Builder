#!/bin/bash
# Optional single-host radar job. Enabling the timer requires a validated supply pilot.
set -euo pipefail
umask 027
mode=${1:-}
case "$mode" in inventory|refresh) ;; *) echo 'Use inventory or refresh.' >&2; exit 2 ;; esac
config=${RADAR_JOB_CONFIG:-/etc/fantasybuilder/radar.env}
if [[ ! -f "$config" ]]; then
  echo 'Radar scheduling is disabled: no job configuration.'
  exit 0
fi
set -a
source "$config"
set +a
if [[ "${RADAR_JOB_ENABLED:-false}" != true ]]; then
  echo 'Radar scheduling is disabled.'
  exit 0
fi
: "${RADAR_SEASON:?Set the reviewed season}"
: "${RADAR_MINIMUM_CATALOG_COUNT:?Set a lower bound for the full catalog}"
: "${RADAR_DATA_DIR:?Set the durable host data directory}"
: "${RADAR_REVIEW_DIR:?Set the read-only approved supply directory}"
if [[ ! -d "$RADAR_DATA_DIR" || ! -d "$RADAR_REVIEW_DIR" ]]; then
  echo 'Radar data and review directories must exist before running the job.' >&2
  exit 1
fi
exec 9>"${RADAR_JOB_LOCK:-/run/lock/fantasybuilder-operation.lock}"
flock -n 9 || { echo 'Another application operation is running.' >&2; exit 1; }
export CONFIG_DIR=${CONFIG_DIR:-/etc/fantasybuilder/current}
compose=(docker compose --env-file "$CONFIG_DIR/runtime.env" -f "${RADAR_COMPOSE_FILE:-/opt/fantasybuilder/compose.yml}" --profile radar-jobs)
job=("${compose[@]}" run --rm --no-deps -T radar-job)
"${job[@]}" inventory --season "$RADAR_SEASON" --work-dir /data/radar/staging --minimum-count "$RADAR_MINIMUM_CATALOG_COUNT"
review=(--work-dir /data/radar/staging --registry /data/radar-review/registry.json --audits /data/radar-review/audits.json --captures /data/radar-review/captures)
"${job[@]}" plan "${review[@]}"
if [[ "$mode" == refresh ]]; then
  imports=()
  if [[ -n "${RADAR_IMPORTS_FILE:-}" ]]; then
    imports=(--imports "$RADAR_IMPORTS_FILE")
  fi
  "${job[@]}" fetch "${review[@]}" "${imports[@]}"
fi
"${job[@]}" validate "${review[@]}" --stale-days "${RADAR_STALE_DAYS:-8}" --maximum-days "${RADAR_MAXIMUM_DAYS:-30}"
"${job[@]}" publish --validated /data/radar/staging/validated.json --root /data/radar/published
"${job[@]}" report --root /data/radar/published
