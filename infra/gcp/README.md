# Google Cloud Terraform deployment

One regular `e2-small` VM runs the application for up to four concurrent users.
The default region is `us-central1`, with Standard Network Tier IPv4 and a 30 GiB
standard persistent disk. See the root [architecture](../../ARCHITECTURE.md) and
[cost assessment](../../docs/deployment/google-cloud-cost-architecture.md).

Terraform provisions resources and installs the host runtime. Application
activation follows image upload, secret configuration, and DNS. Running `apply`
does not publish an application with development credentials.

## Resources

| Resource | Purpose |
| --- | --- |
| Custom VPC and subnet | Isolate this VM from default-network firewall rules. |
| Reserved Standard Tier IPv4 | Stable DNS destination, with the costed network tier. |
| Web and IAP firewall rules | Public TCP 80/443; TCP 22 only from `35.235.240.0/20`. |
| Shielded Debian 12 VM | OS Login, blocked project SSH keys, dedicated service account. |
| Separate Terraform boot-disk resource | Docker data survives VM replacement; `auto_delete=false` and `prevent_destroy=true`. |
| Private backup bucket | Regional Standard storage, daily database dumps, lifecycle expiry after 14 days plus a 7-day soft-delete recovery window. |
| Artifact Registry Docker repository | App images, cleanup of old untagged versions, protection for the three most recent versions. Tagged releases require deliberate cleanup. |
| Five Secret Manager secret containers | Runtime, identity, auth, API, and scraper dotenv files; secret versions are uploaded outside Terraform. |
| Optional GitHub publisher | Keyless federation restricted to this repository ID, `main` push events, and the CI workflow; repository-scoped image writer. |
| Optional operator IAM | OS administrator login, Compute read access, instance-scoped IAP access, and service-account use. |
| Optional billing budget | Project usage before credits at 50%, 90%, and 100% thresholds. Alerts do not stop spending. |

The VM service account can read only this repository and these five secrets and
create objects only in the backup bucket. It cannot delete or download backups.
No service-account keys, application secrets, secret payload data sources, or
secret-version resources are used by Terraform.
Docker's forwarding chain blocks container HTTP calls to the metadata server;
host scripts retain metadata-based credentials. A Docker systemd pre-start rule
restores this protection before containers resume after a reboot.

## 1. Authenticate and provision

Install Terraform 1.9+ and the Google Cloud CLI. Use an existing project with
billing enabled. The provisioning identity needs permissions to enable APIs,
create the listed resources, and grant their IAM permissions; creating the
optional budget additionally needs billing-account access. This is separate from
the narrowly scoped runtime identity created by the module.

```bash
gcloud auth login
gcloud auth application-default login
cd infra/gcp
cp terraform.tfvars.example terraform.tfvars
# Edit project_id and admin_members; use your actual Google account.
terraform init
terraform fmt -check -recursive
terraform validate
terraform plan -out=deployment.tfplan
terraform apply deployment.tfplan
```

The example uses `fantasybuilder.es`; it does not manage your registrar or DNS.
Both `region` and `zone` must change together for a regional move. GCP does not
offer the same free allowances in every region. The `e2-small` VM itself is paid
after promotional credits; an eligible `e2-micro` is a separate sizing choice.

Commit `.terraform.lock.hcl`. State, plan files, and real `.tfvars` are ignored.
Local state still contains infrastructure metadata and IAM information; keep it
private and backed up. For collaborative use, migrate state into a separate,
private GCS backend with restricted access and versioning. The database-backup
bucket is not intended as a Terraform-state bucket.

## 2. Build and upload images

### Automatic publishing after CI on main

The GitHub workflow has three stages: `test` → `build` → `deploy`. Tests and
builds run for pull requests and pushes to every branch; tag pushes do not trigger
the workflow. Image builds wait for the test job, and the frontend image build
includes TypeScript checks and the production bundle. Every application image
must build successfully before deployment. On a `push` event on `refs/heads/main`,
the build job exports the five checked Linux amd64 images as a one-day artifact.
The deploy job downloads and loads those exact images without rebuilding, then
publishes them tagged `sha-<full commit SHA>`. Only deploy receives OIDC permission.
PRs, other branches, and tags do not publish. A rerun of a main push can republish
that commit. Registry pushes are not atomic: a failed push can leave some images
uploaded, but the release artifact is produced only when all five succeed.

Enable the optional publisher in your ignored `terraform.tfvars`:

```bash
gh api repos/andreshere00/LaLiga-Fantasy-Builder --jq '.id | tostring'
```

```hcl
github_actions = {
  repository    = "andreshere00/LaLiga-Fantasy-Builder"
  repository_id = "REPLACE_WITH_THE_NUMERIC_ID_PRINTED_ABOVE"
}
```

Apply the reviewed Terraform plan, then run:

```bash
terraform -chdir=infra/gcp output github_actions_variables
```

Copy its four values into GitHub **Settings → Secrets and variables → Actions →
Variables** (repository variables, not secrets):

| Variable | Source |
| --- | --- |
| `GCP_PROJECT_ID` | Existing GCP project ID. |
| `GCP_ARTIFACT_REGISTRY` | Regional registry path, without a scheme or trailing slash. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name including the numeric GCP project number. |
| `GCP_IMAGE_PUBLISHER` | Dedicated publisher service-account email. |

Terraform enables token-exchange APIs, creates the identity pool/provider and
publisher service account, and grants only repository-level Artifact Registry
writer access to that account. It does not grant VM, application-secret, or
backup-bucket access. The provider checks the repository's numeric ID and full
name, the push event, main ref, and `.github/workflows/ci.yml` workflow ref.
Short-lived federated credentials replace service-account keys. Allow a few
minutes for IAM changes to propagate before the first run.

After merging to main, download the `release-images-<full commit SHA>` artifact
from the successful Actions run. It contains `release-images.env` with only the
five pinned image references. Merge those five entries into your private
`runtime.env`, preserving its passwords and service tokens, upload a new runtime
secret version, and activate the VM using the deployment helper below. The
deploy stage publishes images; it does not update secrets or restart the live VM.
No release artifact is uploaded for PRs or a failed publishing run.

### Manual publishing fallback

Use immutable Linux **amd64** images for this x86 VM. This matters when building
on an Apple Silicon Mac. Run from the repository root after applying Terraform:

```bash
REGISTRY=$(terraform -chdir=infra/gcp output -raw registry)
REGISTRY_HOST=${REGISTRY%%/*}
RELEASE=$(git rev-parse --short HEAD)
gcloud auth configure-docker "$REGISTRY_HOST"

docker buildx build --platform linux/amd64 --push -t "$REGISTRY/identity:$RELEASE" backend/identity
docker buildx build --platform linux/amd64 --push -t "$REGISTRY/auth:$RELEASE" backend/auth
docker buildx build --platform linux/amd64 --push -t "$REGISTRY/api:$RELEASE" backend/api
docker buildx build --platform linux/amd64 --push -t "$REGISTRY/scraping:$RELEASE" backend/scraping
docker buildx build --platform linux/amd64 --push -t "$REGISTRY/frontend:$RELEASE" -f frontend/Dockerfile .
```

The identity used for manual publishing needs Artifact Registry writer access.
The optional `github_actions` configuration grants that access only to the
separate CI publisher. The VM retains repository reader access.

Read each uploaded image's digest from the build output or Artifact Registry.
In `runtime.env`, use `REGISTRY/service@sha256:...`, not `latest`. Keep a tag on the
active digest so cleanup of old untagged versions cannot remove it. Retain a
small set of known rollback tags and explicitly retire older tagged builds.
Automatic cleanup deletes only untagged images older than seven days, except the
three most recent versions of each image. It does not cap the number of tagged
releases or total registry storage. After confirming a digest is neither deployed
nor needed for rollback, remove its obsolete release tags so it can become
eligible for cleanup. A digest used by a running VM must remain tagged even if
it is older than the three most recent versions.

## 3. Configure application secrets

Copy the examples to an ignored directory on your workstation:

```bash
mkdir -p tmp/gcp-secrets
chmod 700 tmp/gcp-secrets
for service in runtime identity auth api scraping; do
  cp "infra/gcp/examples/$service.env.example" "tmp/gcp-secrets/$service.env"
  chmod 600 "tmp/gcp-secrets/$service.env"
done
```

Fill the files using a local editor or secret manager. For a new installation,
generate each password/service token independently with `openssl rand -hex 32`.
Database passwords are interpolated into connection URLs, so use these URL-safe
hex values. Generate the vault AES key with `openssl rand -base64 32`. Provide a
stable random `BETTER_AUTH_SECRET`, real authenticated SMTP credentials, a
verified email sender, and a real scraper contact. Unused social-provider keys
must be omitted entirely rather than set to empty strings.

For an existing installation, preserve the identity secret, vault key, passwords,
and data. Changing dotenv passwords does not change existing PostgreSQL roles;
changing the vault/identity encryption keys can make stored data unreadable.
Coordinate real rotations separately.

Upload all five files. The following uses the default `name_prefix`; use the
actual names from `terraform output secret_names` if you changed it:

```bash
PROJECT_ID=your-existing-project-id
for service in runtime identity auth api scraping; do
  gcloud secrets versions add "fantasybuilder-$service-env" \
    --project="$PROJECT_ID" --data-file="tmp/gcp-secrets/$service.env"
done
```

The uploader needs permission to add secret versions; the VM has read-only secret
access. Avoid uploading a second configuration concurrently with a release.
Disable obsolete versions after verifying a release to control the active-version
count. An explicit deployment stages the latest payloads into a root-only release
directory and commits the local snapshot after successful startup. Reboots do not
select newer secret versions. Downloaded files are under `/etc/fantasybuilder`; they are never
written to instance metadata or command output. Terraform creates the secret
containers but never reads their values.

The public origin, issuer, internal URLs, private ports, and production storage
mode are enforced by the production Compose file. Only the matching service's
dotenv file is passed to each backend. The root runtime dotenv is used for
Compose interpolation, not injected wholesale into containers.

## 4. Set DNS and activate

Use `terraform -chdir=infra/gcp output dns_a_record` to create the DNS A record
at your registrar. Remove a conflicting AAAA record if it points to another host.
Preserve existing mail-related records. Start with DNS-only routing: a proxy/CDN
requires a reviewed trusted-client-IP configuration for authentication limits.

Connect using the printed `ssh_command`. Wait for host bootstrap to finish:

```bash
sudo journalctl -u google-startup-scripts.service --no-pager
sudo docker compose version
sudo /usr/local/sbin/fantasybuilder-deploy
```

The deployment helper stages all five secret files, validates Compose without
printing resolved values, pulls images, runs identity migrations, starts the
stack, and waits for health checks. Only then does it atomically switch
`/etc/fantasybuilder/current` to the candidate configuration. Validation and pull
failures preserve the active snapshot and never update running containers.
Auth applies its existing additive migrations
at startup. Caddy obtains HTTPS certificates once DNS and ports 80/443 are ready.
Initial database provisioning reuses `docker/postgres/identity.sh` from this repo.

Validate registration, email verification, sign-in, existing LaLiga pairing,
read-only API features, and progress streaming on the HTTPS origin. Direct social
providers need registered callbacks. LaLiga browser SSO still needs its separate
approved client and callback; see the
[capability record](../../docs/authentication/laliga-sso-capability.md).

On later releases, upload changed secret versions or image digests and run the
same helper. Docker Compose reloads changed containers; the helper is not a
zero-downtime deployment system. A startup/health failure can leave containers
partially updated even though the saved snapshot still points to the preceding
release; failed candidate files are retained for inspection. There is no automatic
database rollback. Stop and inspect sanitized logs before recovery or retrying.
Restore data only through the reviewed recovery
procedure, never by deleting the production volume.

## Operations and recovery

The bootstrap installs root-owned systemd units and scripts. It does not clone a
repository or need GitHub credentials. The application becomes enabled only when
the deployment helper creates `/etc/fantasybuilder/enabled`; a fresh VM waits
until images, secrets, and DNS have been prepared and a first release succeeds.
Reboots use the committed local configuration and cached images with
`--pull never`; they do not need Secret Manager or the registry to be reachable.
The application still needs its normal upstream providers for provider-backed
features. Old local release directories contain secrets: retain only the active
snapshot and the rollback snapshots you need. Do not add ordinary users to the Docker group.

```bash
sudo systemctl status fantasybuilder.service
sudo systemctl status fantasybuilder-backup.timer
sudo systemctl start fantasybuilder-backup.service
sudo journalctl -u fantasybuilder-backup.service --no-pager
sudo docker stats --no-stream
df -h /var/lib/docker
```

Daily backups run around 03:30 UTC with a randomized delay and catch up after
downtime. Backups and deployments share an operation lock. Both local database
dumps must succeed before uploads begin. Each backup consists of two uniquely
named `pg_dump --format=custom` objects and a `manifest.json` completion marker,
uploaded last. Only prefixes containing that marker are complete backup pairs;
an interrupted upload may leave incomplete objects without a marker. Role definitions
and vault/identity secrets are not stored with database dumps. Keep the secrets
recoverable independently and verify both uploads regularly; this template does
not provision an external alerting service.
The two logical dumps are independent snapshots, not a cross-database atomic
recovery point. If coordinated recovery is required, pause account/vault writes
for the backup or implement PostgreSQL physical backups and WAL recovery.

Rehearse recovery on a separate disposable VM: provision the two non-superuser
roles/databases with the same credentials, download a backup pair whose prefix
contains `manifest.json` using
an administrator with object-read access, and restore each with `pg_restore` to
its corresponding database before starting the application. Do not restore over
live writes. Full provider/recovery checks remain in the
[release runbook](../../docs/authentication/better-auth-cutover.md).

VM deletion protection defaults to true. The separate disk additionally has
`prevent_destroy`, secrets have deletion protection, and a non-empty backup
bucket cannot be force-deleted. An intentional teardown requires explicit
configuration changes after recovery has been verified. These guards preserve
billable resources too: retained disks, addresses, buckets, images, and secret
versions can keep accruing charges after a VM is stopped or removed.

Startup scripts run at boot. Terraform updates metadata without replacing the
VM; it does not immediately execute updated bootstrap contents on a running VM.
Apply infrastructure changes, review the plan for replacements, then use a
maintenance reboot or explicitly rerun the guest startup-script runner to install
updated units/configuration. Schedule OS/Docker updates separately. Source images
initialize only empty disks; an advancing Debian image family never refreshes a
populated database disk automatically.

## Validate without deploying

```bash
terraform -chdir=infra/gcp fmt -check -recursive
terraform -chdir=infra/gcp init -backend=false
terraform -chdir=infra/gcp validate
terraform -chdir=infra/gcp test
python3 -m unittest discover -s infra/gcp/tests -p 'test_*.py' -v
bash -n infra/gcp/templates/fetch-secrets.sh
bash -n infra/gcp/templates/release.sh
bash -n infra/gcp/templates/start.sh
bash -n infra/gcp/templates/backup.sh
bash -n infra/gcp/templates/deploy.sh
```

Terraform tests use a mocked Google provider and create no GCP resources. Runtime
tests fake cloud commands; the Compose contract test needs the Docker CLI but no
daemon. A real authenticated `terraform plan`, provisioning rehearsal, HTTPS
validation, load test, and restore exercise are still required on your project.

Provider and platform references:
[Compute instance](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_instance),
[IAP SSH](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding),
[Secret Manager](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/secret_manager_secret),
[backup bucket](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/storage_bucket),
[Artifact Registry](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/artifact_registry_repository),
[Terraform provider mocks](https://developer.hashicorp.com/terraform/language/tests/mocking).
