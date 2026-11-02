# Radar supply audit and activation gate

Reviewed 2026-11-01. The pipeline is implemented; no production supply is approved
by this document. Synthetic fixtures validate software contracts only.

Update 2026-11-02: a separate isolated local pilot captured all six roles with
the existing adapter and published six real player snapshots. See
[live results and exact source columns](radar-live-pilot-results.md).
The table below records the pre-pilot production gate; bulk discovery, the wider
acceptance pilot and a verified comparison population remain unresolved.

The [official DataMB guide](https://datamb.football/guide/) was checked today:
profiles cover the current season; data updates weekly; the current threshold
for 2026/27 is 300 league minutes and increases during the season. The guide
describes six role templates. These product descriptions do not constitute an
automation feed agreement or a complete Fantasy identity manifest.

| Profile | Existing local source research | Production gate |
| --- | --- | --- |
| Centre-back | Seven source columns not captured/reviewed | Blocked |
| Fullback | Seven source columns not captured/reviewed | Blocked |
| Goalkeeper | Earlier profile investigation and parser fixture | Access, identity manifest and refreshed capture pending |
| Striker | Earlier profile investigation and parser fixture | Access, identity manifest and refreshed capture pending |
| Winger | Seven source columns not captured/reviewed | Blocked |
| Midfielder | Earlier profile investigation and parser fixture | Access, identity manifest and refreshed capture pending |

The browser retrieval tool could not read robots.txt today. The previous local
research recorded CSV/XLSX exclusions. No excluded index was downloaded, and no
provider URL has been guessed. The downloader continues checking robots at run
time. Broader discovery must use a permitted manifest or an authorized import.

`fantasy-radar-sync audit --audits audits.json --captures captures/` checks each
approved `SupplyAudit` against `captures/<audit_id>.json` using a semantic SHA-256,
source role, season and seven ordered labels. Captures are private-adapter JSON
(`DataMBPlayer`) or an authorized imported `RadarSnapshot`. Audit entries require
explicit reviewed access, discovery and definitions, with evidence and reviewer.
An empty manifest reports all six profiles blocked; it does not approve supply.

Assignments live in the latest matched identity decision's `roles`. Each has a
profile, audit ID, evidence, reviewer/date and stable `default` flag. Exactly one
role is default when roles exist. A separate observed source key may be supplied
for a second source role; its canonical URL must have identity evidence. Fantasy
position conflicts require an explicit reviewed override explanation. Cohorts
remain null until their population and revision have independently been verified.

The source gate must be completed with real permitted captures and references
before enabling the production timer. Until then, the remaining phases support
validated offline imports and deterministic tests without inventing live data.

Bulk publications reject a native DataMB cohort because the current adapter
cannot return an authoritative population revision. They still show individual
percentiles with population unverified. Verified frozen imports may enable
comparison. Reviewed reference validity is checked before live tasks run and
against capture timestamps during publication; expired references need review.
