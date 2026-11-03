# LaLiga 2026/27 radar selection and weekly discovery

Updated 2026-11-03. This supersedes the Barcelona/Real Madrid-only scope.

## Selection contract

Only publish a current player radar when all of these are established:

- The player's verified master identity is in a current LaLiga club's active
  Fantasy roster, excluding records explicitly marked `out_of_league` and coaches.
- The source observation explicitly says **2026-27**, **La Liga**, and a reviewed
  club name matching that Fantasy club for the period.
- That observation records **at least 300 league minutes**, inclusive: 299 fails,
  300 passes. Do not sum cups, European matches, other leagues or older seasons.
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

The UI keeps the radar inside Overview below Fantasy outlook. Absence messages
refer to the selected season/competition and minimum minutes, without falsely
claiming that the product cutoff establishes a percentile population.

## Recurrence

The existing local automation was updated to **Radares LaLiga 2026/27 · 300 minutos**,
still **Wednesday 07:10 Europe/Madrid**. It replaces the old two-club scope; no
duplicate automation or production timer was created.

```bash
bash scripts/radar-weekly-local.sh --check
bash scripts/radar-weekly-local.sh
```

The script reads the 20 club IDs from the policy, passes its eligibility file and
the league candidate manifest, and uses the existing `weekly` gate. The check is
offline. Outside Wednesday or after an attempt in the same Madrid ISO week, the
job makes no catalog or provider calls. A failed/interrupted attempt consumes that
week's slot too; do not remove the marker to cause same-week retries.

Initial acquisition on November 2–3 was the explicitly requested manual expansion,
separate from the scheduled entry point. Subsequent automatic work stays weekly.
Services, reviewed inputs and durable storage must be available locally for the
app recurrence. No VM deployment, extra credentials or public write route is added.

## Validation

Focused tests cover the 299/300/301 boundary, wrong season/league/club, inactive
IDs, original observation preservation, policy tampering, release reload, and
filtering inactive players before a weekly fetch. Existing tests cover source
failures, exact metrics, identity review, immutable releases and rollback.
The current API wire contract is unchanged; eligibility is an operational
publication policy, not a caller-supplied player or identity filter.

## Current result

The published run summary and per-club counts are recorded below after the
acquisition/review/publication sequence completes. Unresolved profiles remain
explicitly pending; no complete population coverage is implied by search results.

Release: `37bbf210e0e3749eda86dfae088b7f1390a832b5bd327bc3c92d0188b76161ce`. The filtered release serves **241 players / 253 role snapshots**, across all 20 clubs. All served observations pass the season, league, active membership and inclusive 300-minute checks.

Of 571 active roster IDs, **26 have verified observations below 300 minutes** and **304 still have unknown minutes / unresolved source identity**. The other 270 historical/out-of-scope catalog entries are accounted for but not served. Unknown minutes do not prove ineligibility.

| Club | Active roster IDs | Players with published qualifying radars |
| --- | --- | --- |
| Athletic Club | 28 | 15 |
| Atlético Madrid | 28 | 14 |
| Barcelona | 28 | 13 |
| Celta de Vigo | 27 | 13 |
| Deportivo Alavés | 27 | 10 |
| Deportivo La Coruña | 28 | 11 |
| Elche | 29 | 8 |
| Espanyol | 29 | 11 |
| Getafe | 30 | 9 |
| Levante | 27 | 10 |
| Málaga | 30 | 11 |
| Osasuna | 27 | 14 |
| Racing Santander | 27 | 5 |
| Rayo Vallecano | 33 | 13 |
| Real Betis | 26 | 10 |
| Real Madrid | 32 | 15 |
| Real Sociedad | 27 | 16 |
| Sevilla | 30 | 14 |
| Valencia | 32 | 12 |
| Villarreal | 26 | 17 |

Discovery recorded 329 distinct observed player profile URLs from the two search passes. Successful observations were acquired through the private DataMB adapter; review used master-ID full-name evidence and club/role context. No native comparison population was invented. The final ingestion reported 122 successful observations and 160 fresh checkpoints reused.

Verification: all 241 real published players read successfully without source calls. Trent (`2531`, 285 minutes) and Álvaro Carreras (`2533`, 269 minutes) now return `unavailable` with `insufficient_minutes`. The original below-threshold observations remain in checkpoints/history.
