# Local live radar pilot — 2026-11-02

The existing DataMB adapter successfully downloaded six observed public HTML
profiles with runtime robots checks, host guards and rate limits enabled. No
imports or excluded CSV/XLSX downloads were used. These results approve only the
isolated local pilot; they do not approve bulk discovery or production scheduling.

## Publication

- Fantasy catalog: 841 footballers, 27 coaches excluded; no unknown positions.
- Catalog snapshot: `57c5ed19172674830c012f3bfbc78ef5a333ddb94a640c28e2c624cbda040650`.
- First Pedri release: `7002020c0c49e829a1df0e3d8f8a8f430318320c7eef5f1939f85ed58cb7e3ba`.
- Active six-role release: `546619e3a0dfefcb44fe3088fb08099eb9269330e475438cc0beac66750fa7fb`.
- Complete radars: 6/841 (0.71%); remaining 835 have `identity_pending`.
- Eligibility remains unknown without a verified population; comparison is disabled.
- Provider data-update date is unknown; retrieval dates are preserved separately.

| Master ID | Observed profile key | Role | Minutes | Ordered percentiles |
| --- | --- | --- | --- | --- |
| 3100 | `Pedri_Midfielder_stats` | Midfielder | 769 | 44, 56, 64, 88, 59, 85, 97 |
| 1775 | `Pau_Cubarsi_Centre-back_stats` | Centre-back | 668 | 99, 93, 90, 27, 34, 96, 92 |
| 2355 | `J_Kounde_Full-back_stats` | Full-back | 399 | 0, 11, 55, 14, 85, 7, 49 |
| 3104 | `Lamine_Yamal_Winger_stats` | Winger | 915 | 89, 96, 97, 98, 97, 98, 68 |
| 2322 | `J_Oblak_Goalkeeper_stats` | Goalkeeper | 993 | 83, 0, 9, 25, 13, 43, 88 |
| 3103 | `K_Mbappe_Striker_stats` | Striker | 975 | 87, 95, 66, 0, 98, 87, 99 |

Season: 2026-27 for every row. Values above are displayed percentiles, not raw
success rates. Captures retain the parser's floating-point precision. Native
fractions are converted to 0–100 exactly once by the existing parser.

Source labels were reviewed in the order returned by each real capture:

| Profile | Ordered source labels |
| --- | --- |
| `midfielder_v1` | Duels won %; Possessions won; Progressive carries; Forward passes completed; Forward pass completion %; Key passes; Progressive passes completed |
| `defense_progression_v1` | Passes completed; Forward pass completion %; Progressive passes completed; Possessions won; Defensive duels won %; Aerial duels won %; Progressive carries |
| `defense_fullback_v1` | Accurate crosses; Expected assists; Progressive passes completed; Possessions won; Defensive duels won %; Aerial duels won %; Progressive carries |
| `attacker_winger_v1` | Progressive carries; Successful dribbles; Non-penalty goals; Non-penalty xG + xA; Assists; Key passes; Accurate crosses |
| `goalkeeper_v1` | Save percentage %; Aerial duels won; Interceptions (PAdj); Passes completed; Long pass accuracy %; Short pass accuracy %; PSxG - GA |
| `attacker_finishing_v1` | Non-penalty goals; Non-penalty xG; Goal conversion; Aerial duels won %; Touches in box; Expected assists; Offensive duels won |

Definitions and positional samples were checked against the
[DataMB guide](https://datamb.football/guide/). Identity review included Fantasy
master ID, team ID and position, the observed provider profile and additional
club evidence: [Pedri](https://www.fcbarcelona.com/en/football/first-team/players/70486/pedro-gonzalez-lopez),
[Cubarsí](https://www.fcbarcelona.com/en/football/first-team/players/129400/pau-cubarsi),
[Koundé](https://www.fcbarcelona.com/en/football/first-team/news/4576643/kounde-overtakes-abidal-to-become-the-frenchman-with-the-most-appearances-for-fc-barcelona),
[Lamine Yamal](https://www.fcbarcelona.com/en/football/first-team/news/4054567/pau-cubars-and-lamine-yamal-now-official-firstteamers),
[Oblak](https://www.atleticodemadrid.com/jugadores/jan-oblak-2025-2026), and
[Mbappé](https://www.realmadrid.com/en-US/football/squad/kylian-mbappe).
Observed keys come from previously supplied URLs or public search results;
they were not generated from player names. This small observed list does not
establish a complete discovery mechanism.

## Runtime and verification

Operational files live in ignored `data/radar/` and `data/radar-review/`, outside
Git. Local API `.env` now points `RADAR_DATASET_ROOT` to the absolute published
path; `RADAR_STORE_PATH` stays empty. DataMB was enabled only for acquisition and
was disabled again afterward. No production resources or timers were changed.
To acquire another reviewed capture, explicitly enable the private adapter again.

`capture` writes validated adapter JSON plus a semantic hash for review. It does
not approve an identity or publish statistics. Existing capture paths are rejected.
The real `fetch` run reported five successes and one fresh checkpoint skipped.
Validation and publication succeeded. Rollback to the one-player release and
restoration of the six-player release both passed.

The logged-in real browser showed Pedri at `/players/3100`, with all seven values,
769 minutes, season 2026/27, unverified-population warning and disabled comparison.
The graph and table were visually inspected. Overview navigation and placement
beneath Fantasy outlook remain unchanged; no separate Performance link exists.
API workers reloaded during implementation and continued reading the publication.
After acquisition, six fresh repository/service instances read the real release
with a scraper stub that rejects every network call: all six returned seven axes
and no comparison key, with zero scraper calls.

Validation passed: 117 focused API tests (including five capture-command tests),
26 DataMB adapter tests, and 28 Playwright radar/player-detail tests. Black,
Ruff and whitespace checks passed. Browser tests cover mobile/desktop, both
themes, keyboard navigation, missing metrics and preservation of section layout;
those tests use deterministic fixtures, separately from the real Pedri inspection.

## Remaining acceptance gates

- This is one player per role, not the full two-per-role acceptance pilot.
- No real comparable pair is accredited: native DataMB captures lack a population
  revision. Do not enable comparison by inventing a cohort.
- Bulk profile discovery and review of the remaining 835 identities are unresolved.
- The live catalog only supplies team IDs in this response, so the current
  inventory reports `Unknown club` for all entries. Per-role and overall coverage
  are measured; per-club coverage needs an explicit public club-ID enrichment.
- Additional live mobile/light-theme checks and broader failure exercises remain
  part of acceptance before scheduling. Focused automated suites cover source
  failures, preservation, quarantine, expiry, idempotency and publication errors.
- No production scheduling or full-catalog activation has been performed.
