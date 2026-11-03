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
# Fail before weekly claims its durable slot when deployment inputs are absent.
if [[ "$mode" == refresh ]]; then
  for required in "$RADAR_DATA_DIR/staging/catalog.json" \
    "$RADAR_REVIEW_DIR/registry.json" "$RADAR_REVIEW_DIR/audits.json"; do
    if [[ ! -s "$required" ]]; then
      echo "Missing radar input: $required. Seed reviewed data before refreshing." >&2
      exit 1
    fi
  done
  if [[ ! -d "$RADAR_REVIEW_DIR/captures" ]]; then
    echo 'Missing radar captures directory. Seed reviewed data before refreshing.' >&2
    exit 1
  fi
fi
exec 9>"${RADAR_JOB_LOCK:-/run/lock/fantasybuilder-operation.lock}"
flock -n 9 || { echo 'Another application operation is running.' >&2; exit 1; }
export CONFIG_DIR=${CONFIG_DIR:-/etc/fantasybuilder/current}
compose=(docker compose --env-file "$CONFIG_DIR/runtime.env" -f "${RADAR_COMPOSE_FILE:-/opt/fantasybuilder/compose.yml}" --profile radar-jobs)
job=("${compose[@]}" run --rm --no-deps -T radar-job)
review=(--work-dir /data/radar/staging --registry /data/radar-review/registry.json --audits /data/radar-review/audits.json --captures /data/radar-review/captures)
if [[ "$mode" == refresh ]]; then
  : "${RADAR_TEAM_IDS:?Set the reviewed current-season club IDs}"
  # weekly claims its durable slot before any catalog/provider access. Do not
  # run inventory separately here or bypass that guard with a standalone fetch.
  teams=()
  read -r -a team_ids <<< "$RADAR_TEAM_IDS"
  for team in "${team_ids[@]}"; do teams+=(--team-id "$team"); done
  weekly=("${job[@]}" weekly "${review[@]}" --root /data/radar/published \
    --observations /data/radar-config/observations.json \
    --eligibility /data/radar-config/eligibility.json "${teams[@]}" --weekday wed \
    --stale-days "${RADAR_STALE_DAYS:-8}" --maximum-days "${RADAR_MAXIMUM_DAYS:-30}")
  if [[ -n "${RADAR_IMPORTS_FILE:-}" ]]; then weekly+=(--imports "$RADAR_IMPORTS_FILE"); fi
  "${weekly[@]}"
  "${job[@]}" report --root /data/radar/published
  exit 0
fi
"${job[@]}" inventory --season "$RADAR_SEASON" --work-dir /data/radar/staging --minimum-count "$RADAR_MINIMUM_CATALOG_COUNT"
"${job[@]}" plan "${review[@]}"
"${job[@]}" validate "${review[@]}" --stale-days "${RADAR_STALE_DAYS:-8}" --maximum-days "${RADAR_MAXIMUM_DAYS:-30}"
"${job[@]}" publish --validated /data/radar/staging/validated.json --root /data/radar/published
"${job[@]}" report --root /data/radar/published
