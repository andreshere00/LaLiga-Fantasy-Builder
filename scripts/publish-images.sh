#!/bin/bash
# Publish only images already built and checked by the main-branch CI run.
set -euo pipefail
if [[ "${GITHUB_EVENT_NAME:-}" != push || "${GITHUB_REF:-}" != refs/heads/main ]]; then
  echo 'Image publishing is restricted to pushes to main.' >&2
  exit 1
fi
if [[ ! "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'A full Git commit SHA is required.' >&2
  exit 1
fi
if [[ ! "${GCP_ARTIFACT_REGISTRY:-}" =~ ^[a-z0-9-]+-docker\.pkg\.dev/[a-z][a-z0-9-]+/[a-z][a-z0-9_-]*$ ]]; then
  echo 'GCP_ARTIFACT_REGISTRY must be an Artifact Registry repository path.' >&2
  exit 1
fi
staging=$(mktemp)
trap 'rm -f "$staging"' EXIT
# A failed run must not leave a previous manifest that looks complete.
rm -f release-images.env
for service in identity auth api scraping frontend; do
  image="$GCP_ARTIFACT_REGISTRY/$service:sha-$GITHUB_SHA"
  docker tag "fantasybuilder/$service:$GITHUB_SHA" "$image"
  push_log=$(mktemp)
  docker push "$image" 2>&1 | tee "$push_log"
  prefix="$GCP_ARTIFACT_REGISTRY/$service@sha256:"
  # RepoDigests may list other repositories (or be empty on some image stores),
  # so select the entry for this registry path and fall back to the push output.
  reference=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image" \
    | grep -F -m1 "$prefix" || true)
  if [[ -z "$reference" ]]; then
    pushed=$(sed -nE "s/^sha-${GITHUB_SHA}: digest: (sha256:[a-f0-9]{64}) .*/\1/p" "$push_log" | tail -n1)
    [[ -n "$pushed" ]] && reference="$GCP_ARTIFACT_REGISTRY/$service@$pushed"
  fi
  rm -f "$push_log"
  digest=${reference#"$prefix"}
  if [[ "$reference" != "$prefix"* || ! "$digest" =~ ^[a-f0-9]{64}$ ]]; then
    echo "No valid published digest for $service." >&2
    exit 1
  fi
  name=$(printf '%s' "$service" | tr '[:lower:]' '[:upper:]')
  printf '%s_IMAGE=%s\n' "$name" "$reference" >> "$staging"
done
mv "$staging" release-images.env
