#!/bin/bash
# Activate a complete published main release; never print runtime dotenv payloads.
set -euo pipefail
umask 077
if [[ "${GITHUB_EVENT_NAME:-}" != push || "${GITHUB_REF:-}" != refs/heads/main ||
      ! "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'Deployment requires a full commit SHA from a main push.' >&2
  exit 1
fi
for name in GCP_PROJECT_ID GCP_ARTIFACT_REGISTRY GCP_DEPLOY_ZONE GCP_DEPLOY_INSTANCE GCP_RUNTIME_SECRET DEPLOY_URL GITHUB_REPOSITORY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing deployment setting: $name" >&2
    exit 1
  fi
done
if [[ ! "$DEPLOY_URL" =~ ^https://[a-z0-9.-]+$ ]]; then
  echo 'DEPLOY_URL must be an HTTPS origin.' >&2
  exit 1
fi
# Concurrency alone does not guarantee queue order. Skip obsolete main runs/reruns.
head=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha')
if [[ "$head" != "$GITHUB_SHA" ]]; then
  echo 'Skipping superseded release; main has advanced.'
  exit 0
fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
private_dir=$(mktemp -d)
trap 'rm -rf "$private_dir"' EXIT
ssh_args=(compute ssh "$GCP_DEPLOY_INSTANCE" --project="$GCP_PROJECT_ID"
  --zone="$GCP_DEPLOY_ZONE" --tunnel-through-iap --quiet
  --ssh-key-file="$private_dir/ssh-key" --ssh-key-expire-after=30m)
# Fail on SSH/IAM problems before publishing a configuration that cannot be activated.
gcloud "${ssh_args[@]}" --command='sudo -n test -x /usr/local/sbin/fantasybuilder-deploy'
gcloud secrets versions access latest --project="$GCP_PROJECT_ID" \
  --secret="$GCP_RUNTIME_SECRET" --out-file="$private_dir/runtime.env" --quiet
python3 "$script_dir/merge-release-images.py" "$private_dir/runtime.env" \
  release-images.env "$GCP_ARTIFACT_REGISTRY" "$private_dir/candidate.env"
gcloud secrets versions add "$GCP_RUNTIME_SECRET" --project="$GCP_PROJECT_ID" \
  --data-file="$private_dir/candidate.env" --quiet
gcloud "${ssh_args[@]}" --command='sudo -n /usr/local/sbin/fantasybuilder-deploy'
curl --fail --silent --show-error --retry 5 --retry-delay 5 --max-time 30 \
  --output /dev/null "$DEPLOY_URL/"
echo "Development deployment completed for $GITHUB_SHA."
