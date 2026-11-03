# LaLiga 2026/27 radar selection and weekly discovery

Updated 2026-11-03. Scope: all 20 participating clubs in LaLiga 2026/27.

## Selection contract

Only publish a current player radar when all of these are established:

- The player's verified master identity is in a current LaLiga club's active
  Fantasy roster, excluding records explicitly marked `out_of_league` and coaches.
- The source observation explicitly says **2026-27**, **La Liga**, and a reviewed
  club name matching that Fantasy club for the period.
- That observation records verified league minutes, **without a minimum-minute cutoff**.
  Do not sum cups, European matches, other leagues or older seasons. The prior
  300-minute selection was removed on request; unknown minutes remain unknown.
- Source role, all seven labels and values match an approved source audit.

The 20 club IDs were verified against the public first-matchweek calendar, with
match dates in August 2026, and the public teams-master directory. The current
catalog includes historical club records as well: their presence in teams-master
alone is not evidence of participation in this season. The initial active-roster
inventory contains 571 players; the full 841-footballer catalog remains accounted
for in coverage, so excluded and unknown cases do not silently disappear.

`backend/api/data/radar-laliga-2026-27-eligibility.json` stores the explicit policy.
The weekly command updates its active IDs from each new validated public catalog
in memory. Clubs and season are pinned: a rollover needs a new review.

This policy is a product selection rule. It does not establish a native DataMB
population revision, and it does not enable comparisons. Native percentile
populations remain unverified. Zero is a valid published percentile; an unknown
minute count is not replaced with zero or labelled as insufficient minutes.

## Discovery evidence

Discovery used the active Fantasy roster, reviewed full-name aliases, and public
search results containing observed DataMB URLs. The first pass covered all 571
active IDs; a second surname/club pass addressed initials and abbreviated names.
No profile URL was generated from a name. No excluded CSV/XLSX feed, alternate-host
mirror or robot bypass was used. Source failures stop an acquisition batch; a
reviewed isolated stale/404 URL is not proof that the player has no data.

The candidate manifest is
`backend/api/data/radar-discovery-laliga-2026-27.json`. Candidates never approve
identities automatically. Each approved decision is versioned in the local
review registry with master-ID full-name evidence, observed source name, club,
age context and role. Homonyms, conflicting club contexts and invalid captures
remain pending. Multi-role assignments retain a stable reviewed default, never
chosen by the largest percentile or radar area.

Raw captures and review inputs remain outside Git in ignored `data/radar-review/`.
Acquisition uses the existing private adapter with robots, redirects blocked,
concurrency one and its five-second request interval. Captures survive process
interruptions; resumed batches skip already saved observations.

## Publication and preservation

From `backend/api`, validate with the explicit policy, then publish normally:

```bash
review=(--work-dir ../../data/radar/staging --registry ../../data/radar-review/registry.json --audits ../../data/radar-review/audits.json --captures ../../data/radar-review/captures)
uv run fantasy-radar-sync validate "${review[@]}" --eligibility data/radar-laliga-2026-27-eligibility.json
uv run fantasy-radar-sync publish --validated ../../data/radar/staging/validated.json --root ../../data/radar/published
uv run fantasy-radar-sync report --root ../../data/radar/published
```

The filter rebuilds served snapshots, coverage, candidate index and report
consistently. Its policy is bound to version-2 provenance and dataset identity; version-1 releases remain readable. Publication
and reads reject snapshots violating that policy; editing the threshold without
rebuilding the identity fails validation. Earlier releases without a policy remain
readable for rollback. The original observations/checkpoints stay on disk even
when the current policy excludes them; their dates and values are not rewritten.

The report distinguishes the active roster, qualifying published players,
verified observations below the cutoff and unknown minutes. It includes every
current club with its own counts, without claiming that unknown players are
ineligible or that DataMB covers the full eligible population.

The UI keeps the radar inside Overview below Fantasy outlook and always requests
2026/27. Players without published data have no radar subsection. Coverage reasons
remain available in the API and operational report; missing data is never replaced
with zeros.

## Recurrence

Recurrence belongs to the Terraform-managed VM, replacing the removed LLM task.
Enable `radar_discovery_enabled` after completing the
[deployment prerequisites](radar-operations.md#scheduling-on-the-existing-vm).
The weekly timer runs **Wednesday 07:10 Europe/Madrid** with up to ten minutes
of jitter. It runs the guarded `weekly` CLI with all 20 policy club IDs,
the eligibility policy and observed candidate manifest mounted read-only.

For an offline local check, use `bash scripts/radar-weekly-local.sh --check`.
Outside Wednesday or after an attempt in the same Madrid ISO week, the CLI makes
no catalog or provider calls. A failed/interrupted attempt consumes that week's
slot too; do not remove the marker to cause same-week retries. Initial acquisition
on November 2–3 was the explicitly requested manual expansion; recurring work
stays weekly. No new public write route or provider credentials are introduced.

## Validation

Focused tests cover a configurable 299/300/301 boundary and publication without
a minimum (including zero), wrong season/league/club, inactive
IDs, original observation preservation, policy tampering, release reload, and
filtering inactive players before a weekly fetch. Existing tests cover source
failures, exact metrics, identity review, immutable releases and rollback.
The current API wire contract is unchanged; eligibility is an operational
publication policy, not a caller-supplied player or identity filter.

## Current result

The following counts describe the local publication verified on 2026-11-03,
not a live coverage guarantee. Use `report` for the current release. Unresolved
profiles remain pending; search results do not establish complete coverage.

Release: `de0bf5af50843426145f62cb8689eb19839079480578f481cc6320f11d637922` (dataset `7013a45c1c8daa1dd894b16e3d7b80c7f5f951e024226a88613c24d67ccda41d`). The release serves **267 players / 282 role snapshots**, across all 20 clubs. All served observations pass the season, league and active-membership checks; no minimum-minute cutoff applies.

Of 571 active roster IDs, **267 have verified published radars**, including the **26 previously excluded for fewer than 300 minutes**. The remaining **304 still have unknown minutes / unresolved source identity**. The other 270 historical/out-of-scope catalog entries are accounted for but not served. Unknown minutes do not prove ineligibility.

| Club | Active roster IDs | Players with published radars |
| --- | --- | --- |
| Athletic Club | 28 | 16 |
| Atlético Madrid | 28 | 14 |
| Barcelona | 28 | 13 |
| Celta de Vigo | 27 | 16 |
| Deportivo Alavés | 27 | 11 |
| Deportivo La Coruña | 28 | 11 |
| Elche | 29 | 12 |
| Espanyol | 29 | 12 |
| Getafe | 30 | 9 |
| Levante | 27 | 10 |
| Málaga | 30 | 12 |
| Osasuna | 27 | 18 |
| Racing Santander | 27 | 7 |
| Rayo Vallecano | 33 | 17 |
| Real Betis | 26 | 11 |
| Real Madrid | 32 | 17 |
| Real Sociedad | 27 | 17 |
| Sevilla | 30 | 14 |
| Valencia | 32 | 13 |
| Villarreal | 26 | 17 |

Discovery recorded 329 distinct observed player profile URLs from the two search passes. Successful observations were acquired through the private DataMB adapter; review used master-ID full-name evidence and club/role context. No native comparison population was invented. The final ingestion reported 122 successful observations and 160 fresh checkpoints reused.

Verification: all 267 real published players read successfully without source calls. All 26 previously excluded IDs are now served; their archived snapshot values and retrieval dates are preserved. Trent (`2531`, 285 minutes) and Álvaro Carreras (`2533`, 269 minutes) return available radars. The prior 300-minute release remains available for rollback.
