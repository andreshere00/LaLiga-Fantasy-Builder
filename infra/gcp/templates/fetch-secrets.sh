#!/bin/bash
set -euo pipefail
umask 077
# Public, Terraform-managed host configuration; directory and file are root-only.
source /etc/fantasybuilder/host.env
# The release caller owns this private candidate directory. Never write active files.
staging=${1:?Supply a private candidate configuration directory}
test -d "$staging"

for name in runtime identity auth api scraping; do
  gcloud secrets versions access latest \
    --project="$PROJECT_ID" --secret="$SECRET_PREFIX-$name-env" \
    --out-file="$staging/$name.env" --quiet
  chmod 0600 "$staging/$name.env"
done
