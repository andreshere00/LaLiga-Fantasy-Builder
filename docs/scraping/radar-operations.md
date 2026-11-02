# Player radar ingestion and publication

Updated 2026-11-02.

For the current Barcelona/Real Madrid expansion and its active Wednesday local
recurrence, see the [scoped runbook](radar-barcelona-madrid.md). That path uses
`weekly` with a durable attempt marker and explicit team IDs. The VM timers below
remain a separate production deployment and have not been enabled by that local
recurrence.

The API serves a bounded immutable release. The browser does not start ingestion.
All commands below are operational writes to radar storage; Fantasy account and
market CLIs remain read-only. No provider or production timer is activated by
installing this code. See [supply gates](radar-supply-audit.md) and the
[implementation plan](player-radar-coverage-plan.md).

## Storage and reviewed inputs

Use separate directories:

- `/data/radar/staging`: catalog, review queue, plan, per-task checkpoints and
  `validated.json`; writable only by the job.
- `/data/radar/published`: immutable releases and `current.json`; API read-only.
- `/data/radar-review`: operator-approved `registry.json`, `audits.json`,
  `captures/<audit_id>.json`, and optional authorized `imports.json`; job read-only.

In Compose, host `RADAR_DATA_DIR` mounts at `/data/radar`. `RADAR_REVIEW_DIR`
mounts read-only in the job. On the VM, create both directories before the pilot;
the API image runs as UID/GID 999. Give that UID write access to the data directory
and read access to reviewed inputs (group 999, files mode 0640). Keep these directories outside the repository
and backups of secrets. Example host setup (adapt ownership for your environment):

```bash
sudo install -d -o 999 -g 999 -m 0750 /var/lib/fantasybuilder/radar
sudo install -d -o root -g 999 -m 0750 /var/lib/fantasybuilder/radar-review
```

Empty `{"records":[]}` and `{"audits":[]}` manifests support a coverage-only
publication: every catalog footballer is explicitly pending review. They do not
create statistics or authorize source access. For real observations, follow the
Pydantic `IdentityRegistry`, `SupplyAudits` and `RadarSnapshot` contracts. Supply
review requires identity evidence, one default role, exact seven-column mapping
and a hash-bound permitted capture. Never use example IDs as real identities.

## Explicit command sequence

For a first isolated local radar, use the
[activation plan](radar-first-live-plan.md). The
[2026-11-02 local pilot results](radar-live-pilot-results.md) record six real
captures and a local publication; they do not replace the wider acceptance gate
or approve production scheduling.

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

Terraform installs the optional script and timer unit files, without enabling
them. Do not enable production refresh before passing the supply and pilot gates.
Copy/adapt `infra/gcp/examples/radar.env.example` to
`/etc/fantasybuilder/radar.env` and protect it with mode 0600. The default
`RADAR_JOB_ENABLED=false` makes manual/scheduled execution exit without work.
If changing `RADAR_DATA_DIR` or `RADAR_REVIEW_DIR`, configure the same host paths
in the Compose environment/runtime.env used when starting the API; changing only
the job environment does not move an already-mounted API directory.

After the pilot, configure `RADAR_JOB_ENABLED=true` and enable the two timers:

```bash
sudo systemctl enable --now fantasybuilder-radar-inventory.timer
sudo systemctl enable --now fantasybuilder-radar-refresh.timer
```

Daily inventory also publishes coverage against existing checkpoints, so newly
added players enter review without waiting for the weekly source refresh. The
weekly timer attempts approved observations. Schedules are in Europe/Madrid,
configurable with systemd overrides. Explicit season configuration prevents an
unreviewed automatic rollover. The host operation lock excludes simultaneous
jobs/deployments; kernel locks inside storage protect manual publishers too.
The job uses the API image in a disposable `radar-jobs` profile, with no permanent
service and no publicly reachable write endpoint.

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
