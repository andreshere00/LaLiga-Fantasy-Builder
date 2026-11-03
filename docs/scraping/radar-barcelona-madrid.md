# Barcelona and Real Madrid radar discovery

Updated 2026-11-02. Scope is the full Fantasy catalog membership of team IDs **4**
(FC Barcelona) and **15** (Real Madrid), including reserves and entries marked
out of league. Master IDs are never inferred from the player's name.

Superseded 2026-11-03 by the [LaLiga 2026/27 selection](radar-laliga-2026-27.md):
the same weekly recurrence now covers all current clubs and requires 300 league
minutes. The results and two-club schedule below are historical rollout evidence.

## Initial execution

Public search was applied to both complete Fantasy lists using observed profile
URLs, with the existing reviewed alias inventory as identity evidence. This is a
bounded discovery pass, not an authoritative DataMB population index. No excluded
CSV/XLSX dataset or alternate-host mirror was fetched. A team-page inspection did
not establish a permitted complete index and was not used as a bulk feed.

| Team | Catalog footballers | Published complete radars | Pending |
| --- | --- | --- | --- |
| FC Barcelona (`4`) | 41 | 13 | 28 |
| Real Madrid (`15`) | 46 | 16 | 30 |
| Total scoped | 87 | 29 | 58 |

There are 46 observed candidates: 29 approved identities with complete radars,
6 requiring review of club/period context, and 11 without a validated capture.
The remaining 41 scoped IDs have no confirmed candidate. These last groups are
not proof that DataMB has no data, and are not labelled as low-minute players.

The current release is
`ad4a3c3d2968cffe1314c434a5cf31058235aed990fae1a6cef34b416791c631`.
It retains the earlier Oblak observation, for 30 complete radars overall. The
full 841-player catalog remains in the coverage denominator. The new fetch
reported 24 successes and six fresh checkpoints skipped, without imports.
All six source-role audits are reused and each new observation must match the
exact audited labels, role and season. Comparison remains disabled.

Rejected example: observed `T_Fernandez_Winger_stats` publishes a 22-year-old at
Levante; it does not establish the identity of Fantasy's Toni Fernández. It was
removed from the candidate manifest and was never assigned statistics.
Ferran Torres, Rashford, Gonzalo García, Mastantuono, Valdepeñas and Palacios have
source club contexts differing from this Fantasy catalog and remain pending
additional period/identity evidence. A transfer does not by itself prove a bad
identity, but the name alone cannot resolve that discrepancy.

Bellingham's observed key is `J_Bellingham_Midfielder_stats1`. The adapter now
accepts an optional one-to-three-digit suffix after `_stats`, consistently across
transport, internal route, schemas, registry, audits and capture CLI. Other hosts,
queries, traversal, non-numeric suffixes and bulk files remain rejected.

## Discovery and reviewed inputs

`backend/api/data/radar-discovery-barcelona-madrid.json` contains public observed
candidate URLs and identity evidence. It is not an approved identity registry.
The full alias inventory can propose search names by exact ID; a name match
never authorizes publication. Reviewed operational decisions, audits and captures
remain in ignored `data/radar-review/`.

From `backend/api`, account for every scoped player without downloading profiles
or approving any identity:

```bash
uv run fantasy-radar-sync discover --work-dir ../../data/radar/staging --registry ../../data/radar-review/registry.json --observations data/radar-discovery-barcelona-madrid.json --team-id 4 --team-id 15
```

The generated `staging/discovery.json` separates observed candidates from identity
status. Missing URLs mean discovery is unresolved, not source absence. The queue
is refreshed against the latest catalog every scheduled run, so new team members
remain visible even when they have no profile or approved mapping.

## Active weekly schedule

The Codex app recurrence **Radares Barça y Real Madrid** is active for Wednesdays
at **07:10 Europe/Madrid**. It runs in this chat's local environment, not on the
production VM. The automation first checks the weekly gate, searches pending
identities using observed public references, and uses the reviewed private
adapter/pipeline. It does not expand to other teams or make automatic commits.

```bash
bash scripts/radar-weekly-local.sh --check
bash scripts/radar-weekly-local.sh
```

The first command is offline. The second command returns without provider or
catalog access outside Wednesday or after any extraction attempt in the same
Madrid ISO week. Within the allowed slot it:

1. Takes a cross-process lock and persists the weekly attempt **before network**.
2. Updates the full public catalog with shrink protection and the scoped queue.
3. Fetches only approved tasks currently belonging to team 4 or 15.
4. Validates/publishes coverage with the complete registry, preserving earlier
   observations from other teams without downloading them.
5. Records the release and source counts; partial source failures are recorded
   and return a nonzero exit status. The previous valid observations survive.

A one-day freshness threshold for this scheduled command ensures that Monday's
initial captures can refresh on Wednesday. The persistent weekly claim prevents
another extraction that week. A failed attempt consumes the slot as well: no
automatic same-week retry, catch-up on another day or timestamp rewriting.
An interrupted attempt remains `started` and is treated as already attempted.
Do not remove `weekly-attempt.json` to bypass this rule. Manual initial operations
(`capture`, `fetch`) are separate operator tools, not scheduled entry points.

The local script uses the existing private service at `127.0.0.1:8002`, with the
existing service token loaded by API settings; `DATAMB_ENABLED=true` is required
in scraping. No secrets are written to the script. The services, virtualenvs,
review files and durable data directories must be available when the local
recurrence runs; an unavailable adapter is reported as a failure. The app's
recurrence is not a production systemd deployment or a guarantee of execution
while the local environment is unavailable. The existing VM timers were not enabled.

## Checks and limits

Focused tests cover all scoped IDs, unresolved candidates without auto-approval,
unsafe URLs, numbered profile keys, Madrid midnight boundaries, wrong-day skips,
failed-attempt deduplication and filtering scheduled tasks to the selected teams.
Existing source/registry/publication suites cover robots, schema failures and
last-valid preservation. The scraping OpenAPI contract was regenerated.

Eligibility, population revision and source-update dates remain unknown where
the source has not established them. Published zero values are retained. The
radar remains inside Overview below Fantasy outlook, with no separate
Performance navigation link. Discovery does not guarantee a complete radar for
every Fantasy player; the next expansion should build on this scoped report.
