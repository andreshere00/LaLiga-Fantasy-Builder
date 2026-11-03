# Player radar ingestion and publication

Updated 2026-11-03. The active local recurrence covers all 20 clubs in
LaLiga 2026/27 without a minimum-minute cutoff. See the
[league-wide selection and discovery runbook](radar-laliga-2026-27.md) for coverage
and the Wednesday weekly gate. Production deployment is separate from local
publication; current Terraform enables the weekly VM timer by default unless
`radar_discovery_enabled` is explicitly set to false.

The API serves a bounded immutable release. The browser does not start ingestion.
All commands below are operational writes to radar storage; Fantasy account and
market CLIs remain read-only. No provider or production timer is activated by
installing this code. Acquisition requires the reviewed inputs described below.

## Storage and reviewed inputs

Use separate directories:

- `/data/radar/staging`: catalog, review queue, plan, per-task checkpoints and
  `validated.json`; writable only by the job.
- `/data/radar/published`: immutable releases and `current.json`; API read-only.
- `/data/radar-review`: operator-approved `registry.json`, `audits.json`,
  `captures/<audit_id>.json`, and optional authorized `imports.json`; job read-only.

In Compose, host `RADAR_DATA_DIR` mounts at `/data/radar`. `RADAR_REVIEW_DIR`
mounts read-only in the job. On the VM, create both directories before acquisition;
the API image runs as UID/GID 999. Give that UID write access to the data directory
and read access to reviewed inputs (group 999, files mode 0640). Keep these directories outside the repository
and backups of secrets. Example host setup (adapt ownership for your environment):

```bash
sudo install -d -o 999 -g 999 -m 0750 /var/lib/fantasybuilder/radar
sudo install -d -o root -g 999 -m 0750 /var/lib/fantasybuilder/radar-review
```

Empty `{"records":[]}` and `{"audits":[]}` manifests support a coverage-only
publication: every catalog footballer is explicitly pending review. They do not
create statistics or authorize source access.

`audit` binds each approved source role and seven ordered column labels to a
semantic SHA-256 of its capture. Review access, discovery and metric definitions
with dated evidence before approval. Each matched identity has exactly one stable
default role; never select it by the largest percentile. Position conflicts need
an explicit reviewed override. Native DataMB cohorts remain null because the
adapter cannot establish a population revision; verified frozen imports may
enable comparison. Expired review references require a new review.

For real observations, follow the Pydantic `IdentityRegistry`, `SupplyAudits` and `RadarSnapshot` contracts. Supply
review requires identity evidence, one default role, exact seven-column mapping
and a hash-bound permitted capture. Never use example IDs as real identities.

## Explicit command sequence

All six roles have been captured and audited locally. Current publication
counts are recorded in the [coverage runbook](radar-laliga-2026-27.md#current-result).
Local publication does not approve production scheduling or native comparisons.

After reviewing access and explicitly enabling the private adapter, capture an
already observed profile for semantic review (run from `backend/api`):

```bash
uv run fantasy-radar-sync capture --profile-key Pedri_Midfielder_stats --season 2026-27 --output /data/radar-review/captures/pedri-review.json
```

The command validates the response, saves JSON atomically and reports its semantic
`capture_hash`. It refuses existing paths, uses the existing service token and
adapter, and never approves identity, supply or publication. Run it with operator
write access to the review directory, outside the job's read-only review mount.
Use a new output path for each review; do not overwrite historical evidence.

Run from `backend/api` with the reviewed manifests already on disk. Use the job
container in production so newly created mode-0600 files belong to the same UID
as the API. Host CLI execution requires a matching storage identity:

```bash
uv run fantasy-radar-sync inventory --season 2026-27 --work-dir /data/radar/staging --minimum-count 750
uv run fantasy-radar-sync candidates --work-dir /data/radar/staging --aliases /path/to/offline-player-names.json
uv run fantasy-radar-sync registry --registry /data/radar-review/registry.json
uv run fantasy-radar-sync audit --audits /data/radar-review/audits.json --captures /data/radar-review/captures
```

Set the first-run catalog lower bound from your catalog audit; 750 is an example,
not a claim about the live total. Later runs reject removals over 10%. Review a
legitimate drop before explicitly using `--allow-large-removal`. Unknown Fantasy
positions remain counted for review; coaches are reported outside the denominator.

The next operations share pinned catalog, identities, audits and capture files:

```bash
review=(--work-dir /data/radar/staging --registry /data/radar-review/registry.json --audits /data/radar-review/audits.json --captures /data/radar-review/captures)
uv run fantasy-radar-sync plan "${review[@]}"
uv run fantasy-radar-sync fetch "${review[@]}" --imports /data/radar-review/imports.json
uv run fantasy-radar-sync validate "${review[@]}" --stale-days 8 --maximum-days 30
uv run fantasy-radar-sync publish --validated /data/radar/staging/validated.json --root /data/radar/published
uv run fantasy-radar-sync report --root /data/radar/published
```

Omit `--imports` only for approved DataMB tasks, after enabling the existing
private adapter under its reviewed access conditions. With imports, no provider
network request is made. `plan` never downloads anything. The API needs no new
credentials. Scraping continues using its own service token, robots, rate limits,
redirect guards and breaker; it never holds LaLiga credentials.

One task checkpoint binds identity version, source key, season, role and audited
recipe. Source errors stop a network batch; successful records survive with their
original timestamps. Schema/identity failures are quarantined until review changes
the task. Correct a review with a new identity version; do not relabel a failed
capture as another player. No browser retry starts a source fetch.
`fetch` preserves checkpoints and prints its counts before exiting nonzero for
source errors, quarantined tasks, missing imports or stale cache fallbacks. The VM
refresh script then stops before validation/publication and reports failure to
systemd; the current published release remains active.
Stale adapter fallbacks are counted as `cached_stale` rather than successful
refreshes and retain the original source timestamp. The local `weekly` command
can publish these retained valid observations, but persists `status: partial` and
exits nonzero. Its weekly attempt guard remains in force after partial refreshes.

## Pilot and API cutover

Before a statistics pilot, obtain at least two approved real players per role,
one verified comparable pair, plus ambiguous identity, transfer, new ID, absent
season, missing metric, low-minute and failed-source cases. Software tests use
synthetic fixtures; they do not satisfy this real-data acceptance gate.

1. Run the sequence in an isolated durable directory. Inspect coverage by club,
   position, role and reason. Verify all master IDs are counted; do not filter out
   reserves or unsupported players to improve the percentage.
2. Confirm source identity and seven values manually for every pilot record.
   Unknown population revisions keep comparison disabled. Import a frozen feed
   with a verified population to test genuine comparison; same retrieval day is
   not proof of a shared population revision.
3. Restart API workers and confirm unchanged candidate lists. Block job network
   access and confirm radar GETs still use the local release.
4. Test a failed refresh and the rollback below. Confirm no timestamp is renewed
   by cache reads and expiration still works if the job stops.
5. Set API `RADAR_DATASET_ROOT=/data/radar/published`, leave `RADAR_STORE_PATH`
   empty, and use the read-only mount. Keep manual mode as a separately reviewed
   rollback option, never simultaneously configured with dataset mode.

Store size is limited to 5 MiB per file, with at most 10,000 snapshots. Oversized
releases fail before promotion; archive older releases separately. The first
publication serves one season. Prior releases remain recoverable but do not make
historical seasons searchable in the current API. A multi-season index/database
is a separate evolution when the product actually needs it.

## Scheduling on the existing VM

Terraform manages recurrence on the existing VM; no LLM automation is required.
The `radar_discovery_enabled` variable defaults to true. Set it to false on an
unprepared installation. Before deploying with it enabled:

1. Complete the supply/pilot gates and deploy images containing the weekly CLI.
2. Provision the durable directories described above for UID/GID 999. Transfer
   the reviewed registry, audits and captures, plus the existing `staging/catalog.json`,
   checkpoints and published releases. The weekly CLI requires a seeded catalog;
   it does not bootstrap an empty installation.
3. Set API `RADAR_DATASET_ROOT=/data/radar/published` and scraping
   `DATAMB_ENABLED=true` in the respective service configurations. Keep job/API
   host paths aligned with the Terraform-generated `radar.env` defaults.
4. Keep `radar_discovery_enabled = true` (remove any previous false override),
   review/apply Terraform, and run bootstrap
   on the existing VM using the deployment procedure (metadata changes alone do
   not execute it immediately). Inspect `systemctl list-timers` and the journal.

Terraform writes public job settings to `/etc/fantasybuilder/radar.env` (0600)
and policy/candidate manifests to `/opt/fantasybuilder/radar-config` (read-only in
the job). Edit Terraform inputs rather than the generated files. Secrets continue
to come from the existing service configuration; none enter Terraform state.
Setting the variable false and rerunning bootstrap disables the refresh timer.
Missing or empty catalog/registry/audit files or a missing captures directory fail
the host script before `weekly` can consume the weekly attempt. This presence
check does not replace semantic validation of the reviewed inputs.
The old daily inventory timer is disabled by bootstrap; manual inventory remains
available for initial setup.

The timer runs Wednesday 07:10 Europe/Madrid with up to ten minutes of jitter.
It invokes `weekly` directly, before any network operation: refresh the catalog,
account for observed candidates across all 20 clubs, fetch approved identities,
validate and publish with the current eligibility policy (no minute cutoff).
Discovery does not automatically approve identities or search blocked sources.
A durable Madrid ISO-week marker prevents further downloads even after failure;
do not remove it to retry the same week. Missed runs are not caught up on another
day. The host operation lock excludes simultaneous jobs/deployments.
The disposable API-image job has no public write endpoint. For an offline local
readiness check, `bash scripts/radar-weekly-local.sh --check` remains available;
it is not a scheduler.

### Verify activation on an existing VM

After preparing the data, updating the API/scraping secrets and applying Terraform,
rerun the guest startup script on the VM, then deploy the updated application
configuration using the existing helper:

```bash
sudo google_metadata_script_runner startup
sudo /usr/local/sbin/fantasybuilder-deploy
systemctl is-enabled fantasybuilder-radar-refresh.timer
systemctl list-timers --all fantasybuilder-radar-refresh.timer
sudo journalctl -u fantasybuilder-radar@refresh.service -n 100 --no-pager
```

The radar service loads `host.env` so Compose receives the required `APP_DOMAIN`.
Bootstrap installs the timer; the deploy helper loads the current service secrets
and images. Verify the next trigger is Wednesday in Europe/Madrid. Do not start
`fantasybuilder-radar@refresh.service` merely as a smoke check: on Wednesday it
can consume the weekly slot and perform acquisition.

## Monitoring and rollback

Inspect `journalctl -u 'fantasybuilder-radar@*'`, timer last-run state and the JSON
job/report output. Report fields include catalog date/ID, accounted footballers,
association %, complete radar %, known/unknown eligibility, eligible coverage %,
role/club breakdown and missing/error reasons. Job results count source failures
and provider blocking/rate limits when reported by the adapter. A source failure
is an operational error, never evidence of low minutes or source absence.

Compare successive reports for coverage regression. Alert through your existing
operations channel if jobs stop, source errors persist, the last success crosses
eight days, or an identity/schema check fails. No notification integrations are
created by these scripts. Investigate a sharp catalog drop before overriding it.
Active snapshots expire after thirty days even without a successful new job;
archived values remain on disk. Configure both thresholds together in API/jobs.

Record the previous `current.json` release ID before promotion. To restore it:

```bash
uv run fantasy-radar-sync rollback --root /data/radar/published --release-id PREVIOUS_SHA256
uv run fantasy-radar-sync report --root /data/radar/published
```

Rollback validates all files and hashes and uses the publisher lock; the next API
request pins that release. An in-flight request finishes on its original release.
If the source remains blocked, disable the refresh timer and keep valid local
reads. Do not bypass robots, increase concurrency to evade limits, or rewrite
freshness dates. Back up the data/review directories with the host's existing
storage process; retain at least the last known valid release.

Each new release also retains `provenance.json`: the exact reviewed identity
versions/roles, source audits and capture hashes, task hashes and parser contract
versions. Publication verifies those hashes against the statistical content ID;
changing a validated value or review cannot silently reuse its dataset identity.
This provenance is private operational metadata, not part of the player response.
Earlier releases without provenance remain readable for rollback; revalidate them
before creating a new publication. Contract changes require versioning the parser
contract/recipe and repeating the source audit.
