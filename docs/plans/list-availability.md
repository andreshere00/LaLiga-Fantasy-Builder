# Plan: catalog availability on the list, FutbolFantasy reasons on detail

Status: **proposed** (§3 matches the API today; §4–§6 backend/frontend work
**not** shipped).

Decision date: **2026-10-05**. Codebase check: **2026-10-06**.

Related: [player-stats-endpoint.md](player-stats-endpoint.md) (profile segment),
[player-detail-endpoint.md](player-detail-endpoint.md) (aggregate consumer),
[players-url-filters.md](players-url-filters.md) (list URL contract).

Read first: [`AGENTS.md`](../../AGENTS.md), [Players API](../api/players/README.md),
[Adding endpoints](../api/adding-endpoints.md).

---

## 1. Problem

LaLiga Fantasy catalog (`GET /players`, field `playerStatus`) exposes a coarse
string (`ok`, `injured`, …). The market table and the future Players list map
that string to three UI states in
`frontend/src/features/market/model/availability.ts`: `available`,
`questionable`, and `unavailable`. Generic tooltips do not explain *why* a player
is out (injury type, suspension, matchday-specific doubt).

FutbolFantasy publishes a full sentence and a parsed enum on each player profile
page (one HTML document per player, subject to `robots.txt` and scraper rate
limits). The parser already extracts `profile.availability` (`status`, `matchday`,
`label`) and `profile.form` (`value`, `visualOnly`). The API profile segment
partially maps that data today and drops the rest.

---

## 2. Locked product decisions

Do not reopen these in implementation:

| Decision | Rule |
|----------|------|
| List table | Every row uses **catalog only** (`playerStatus` → three-state icon). **No** FutbolFantasy scrape for the list, leaderboard top 10, or a filtered page of 15. |
| Detail screen | Human-readable availability context lives on **`/players/:playerId`**, sourced from the **profile** payload inside `GET /players/{player_id}/stats/detail` (or the standalone profile segment). |
| Bulk reasons | Pre-fetching FutbolFantasy reasons for the full catalog or for the visible list page is **out of scope**. Record as follow-up debt (§9), not as an alternate design. |
| API enrichment | Extend **`GET /players/{id}/stats/profile`** (and therefore detail’s `profile` field) with structured **`availability.status`** and parsed **`form`**, wired from data the parser already returns. |

Path id is always catalog master **`playerId`**, never `playerTeamId`.

---

## 3. Current behaviour

### 3.1 Catalog and list UI

| Layer | Behaviour |
|-------|-----------|
| Upstream | `GET /players` → `CatalogPlayer.playerStatus` (`backend/api/src/fantasy_api/schemas/players.py`) |
| Resolver | Copied to `ResolvedPlayer.fantasy_status` (`player_resolver.py`) |
| Market / future list | `availabilityOf(master.playerStatus)` in `frontend/src/features/market/model/row.ts` |
| Display | `AvailabilityCell` + fixed `AVAILABILITY_TOOLTIPS` (no per-player text) |

Catalog examples: `backend/api/tests/fixtures/market_captured_snapshot.json`
(`ok`, `injured`, …).

### 3.2 Profile segment (API today)

| Parser / wire (golden fixture) | API `PlayerProfileResponse` today |
|--------------------------------|-----------------------------------|
| `profile.availability.status`, `matchday`, `label` | Only `label` → `injury.availability_text` (`PlayerStatsService.profile` ~702–704) |
| `profile.availability.status` | **Dropped** |
| `profile.form.value`, `visualOnly` | **Dropped** (`wire_map._normalise_profile` does not pass `form`; `ScrapedProfile` has no `form` field) |
| `profile.injury.diagnosis`, dates | `injury.diagnosis`, `since`, `expected_return`, `active` |
| Catalog | `injury.fantasy_status` ← `player.fantasy_status` (~689–690) |

Golden wire: `backend/api/tests/fixtures/scraping/futbolfantasy_raphinha.json`
(`availability.status`: `available`, `form.visualOnly`: `true`).

Parser enum (source of truth for `status`):
`backend/scraping/src/fantasy_scraping/parser/models/futbolfantasy.py`
→ `available`, `doubtful`, `injured`, `suspended`, `unknown`.

### 3.3 Frontend routes

`App.tsx` has `/market` but **no** `/players` or `/players/:playerId` yet.
Those routes are defined in [players-url-filters.md](players-url-filters.md).
This plan assumes the detail route loads profile data when the screen is built.

---

## 4. Backend: fields to add and lines to change

No scraping or parser changes required for `status` / `form`; the parser JSON
already includes them. Work is API schema, wire normalisation, and `profile()`.

### 4.1 `backend/api/src/fantasy_api/schemas/player_stats.py`

Add after `InjuryRisk` (~73–77) or beside `Injury` (~322):

| Symbol | Definition |
|--------|------------|
| `AvailabilityStatus` | `StrEnum`: `available`, `doubtful`, `injured`, `suspended`, `unknown` (match parser literals) |
| `PlayerAvailability` | `StatsModel` with `status: AvailabilityStatus`, `matchday: int \| None`, `label: str \| None` (published Spanish sentence, same text as today’s `injury.availability_text`) |
| `PlayerForm` | `StatsModel` with `value: float \| None`, `visual_only: bool = False` |

Extend `PlayerProfileResponse` (~373–380):

```text
availability: PlayerAvailability
form: PlayerForm
```

Keep existing `injury`, `start_probability`, … unchanged for backward compatibility.
Continue populating `injury.availability_text` from the same wire `label` so
existing clients do not break.

### 4.2 `backend/api/src/fantasy_api/schemas/scraped.py`

On `ScrapedProfile` (~53–62), add:

```text
form: dict[str, Any] | None = None
```

(`availability` is already declared ~54.)

### 4.3 `backend/api/src/fantasy_api/services/wire_map.py`

**`_normalise_profile`** (~163–181): add `form` to the returned dict. Normalise
parser camelCase:

```text
"form": {
  "value": <float | None from raw.form.value>,
  "visual_only": <bool from raw.form.visualOnly, default False>,
}
```

when `raw.get("form")` is a mapping; otherwise `None`.

Optional helper next to `map_injury_risk` (~66–70):

```text
def map_availability_status(value: Any) -> AvailabilityStatus
```

Map known strings to `AvailabilityStatus`; missing or unrecognised → `unknown`
(fail soft, same pattern as injury risk).

### 4.4 `backend/api/src/fantasy_api/services/player_stats.py`

In **`profile()`** (~678+):

1. After `availability = profile.availability` (~524), build `PlayerAvailability`:
   - `status` ← `map_availability_status(availability.get("status"))` when dict
   - `matchday` ← int or `None` from `availability.get("matchday")`
   - `label` ← same as today’s `injury.availability_text` source
2. When `profile.form` is a dict, build `PlayerForm` from normalised
   `value` / `visual_only` (wire model field names after `parse_wire_document`).
3. Pass `availability=` and `form=` into `PlayerProfileResponse(...)` (~586–600).

**Do not** add catalog fields to `GET /players`. **Do not** call the scraper from
list endpoints.

`PlayerStatsService.detail()` already delegates to `profile()`; no separate
mapping unless tests show a regression.

### 4.5 Contract notes

| Topic | Rule |
|-------|------|
| `availability.status` vs catalog | Independent. Detail may show `injury.fantasy_status` (catalog) alongside `availability.status` (FutbolFantasy). UI may surface a mismatch; do not force equality in the API. |
| `form.value` null + `visual_only` true | Valid (see golden Raphinha). Frontend shows em dash or “Form not published as a number”. |
| Warnings | Parser warnings such as `form_visual_only` already flow via `SegmentWarning` on the envelope; keep exposing them. |
| Auth | Unchanged: JWT on profile and detail. List catalog stays public. |

---

## 5. Frontend

### 5.1 Players list (`/players`)

When the list screen ships ([players-url-filters.md](players-url-filters.md)):

- Row `availability` ← `availabilityOf(catalogRow.playerStatus)` only.
- Column filter `avail` uses the same three tokens as market.
- **Do not** add `useQueries` per row against stats/profile/detail.
- Tooltips stay generic (`AVAILABILITY_TOOLTIPS`); no injury diagnosis in the
  list tooltip.

Reuse `AvailabilityCell` or a thin wrapper; no new API types for the list.

### 5.2 Player detail (`/players/:playerId`)

One authenticated request for the stats body, preferring the aggregate:

```text
GET /api/players/{playerId}/stats/detail?include=profile
```

(or full default `include` if the screen loads other segments anyway; one scrape
per visit via existing single-flight cache).

Add `paths.playerStatsDetail(playerId)` in `frontend/src/api/client.ts` (not
present as of **2026-10-06**). Until §4 ships, detail UI must use
`profile.injury.availability_text` (and diagnosis fields) only — not
`profile.availability` or `profile.form`.

**Availability block** (after §4; plain text, never HTML):

| Priority | Source field | Use |
|----------|--------------|-----|
| 1 | `profile.injury.diagnosis` | Primary “reason” when present |
| 2 | `profile.availability.label` | Full FutbolFantasy sentence (`injury.availability_text` duplicate until clients migrate) |
| 3 | `profile.availability.status` | Badge copy (map enum to short English labels) |
| Context | `profile.injury.since`, `expected_return`, `profile.injury.fantasy_status` | Secondary lines |
| Form | `profile.form.value` | Show formatted decimal when not null; if `visual_only`, hide numeric form or show placeholder |

**Icon on detail:** optional coarse icon from `availabilityOf(profile.injury.fantasy_status)` (catalog) *or* a second mapping from `availability.status` (five-way → three-way). Product default: show **FutbolFantasy sentence + diagnosis** as the reason; use catalog three-state icon in the header only if design wants parity with the list.

Mapper module (suggested):
`frontend/src/features/players/model/profileAvailability.ts` — parse detail JSON,
export `availabilityReasonLines(profile)` and `formDisplay(profile.form)`.

Handle `profile: null` and `segment_errors` (detail aggregate): show catalog-only
fallback from a parallel public `GET /players` row lookup by id if the screen
already holds the catalog index; otherwise “Availability details unavailable”.

### 5.3 Market tab

No change. Market continues to use catalog `playerStatus` only.

---

## 6. Tests

Naming: `{method}_{state}_{behavior}`. Sections:
`# ---- Mocks, fixtures & helpers ---- #`, `# ---- Happy path ---- #`,
`# ---- Error paths ---- #`, `# ---- Edge cases ---- #`.

### 6.1 Backend — `backend/api/tests/test_wire_map.py`

| Test | Expected |
|------|----------|
| `test_parse_wire_document_normalises_profile_form` | Golden fixture → `wire.profile.form` with `visual_only=True`, `value is None` |
| `test_map_availability_status_known_label_maps_enum` | Each parser status string maps correctly |
| `test_map_availability_status_missing_returns_unknown` | `None` / garbage → `unknown` |

### 6.2 Backend — `backend/api/tests/test_player_stats_routes.py` (or dedicated service test)

| Test | Expected |
|------|----------|
| `test_stats_profile_maps_availability_status_from_wire` | 200; `availability.status` == `available`; `matchday` == 8; `label` matches golden |
| `test_stats_profile_maps_form_visual_only` | `form.visual_only` true; `form.value` null |
| `test_stats_profile_keeps_injury_availability_text` | `injury.availability_text` still set (backward compat) |
| `test_stats_detail_includes_profile_availability_fields` | Detail `profile.availability.status` present when profile segment succeeds |

Use existing `httpx.MockTransport` + `futbolfantasy_raphinha.json` fixture.

### 6.3 Frontend — Vitest

| Test | Expected |
|------|----------|
| `test_availabilityReasonLines_diagnosis_preferred` | Diagnosis shown when both diagnosis and label exist |
| `test_availabilityReasonLines_label_only` | Label used when diagnosis absent |
| `test_formDisplay_visual_only_returns_null` | No numeric display when `visual_only` |
| `test_availabilityOf_catalog_unchanged` | Existing market mapping tests stay green |

---

## 7. Docs and OpenAPI

After API schema changes:

```bash
cd backend/api && uv run poe generate-openapi
cd backend/api && uv run poe generate-endpoint-schemas
```

Commit `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`.

Update:

- [docs/api/players/README.md](../api/players/README.md) — document
  `PlayerProfileResponse.availability` and `.form`; note list vs detail data
  sources (§2).
- [player-stats-endpoint.md](player-stats-endpoint.md) §3.6 table — add the two
  models (implementation note only; plan remains **implemented** for the route
  shell).

When `/players` ships, extend `docs/frontend.md` routes table and cross-link
this plan.

---

## 8. Implementation order

1. API schema + `wire_map` + `profile()` (§4).
2. Backend tests + OpenAPI (§6–7).
3. Frontend detail route and profile mapper (§5.2), once the player screen
   exists; list column can ship earlier with catalog-only behaviour (§5.1).
4. Manual check: open detail for a known injured player; confirm one scrape call
   (`test_stats_profile_uses_single_scrape` pattern).

---

## 9. Follow-up technical debt (not in scope)

| Item | Why deferred |
|------|----------------|
| Per-row FutbolFantasy availability on `/players` | N full player documents; rate limit and `robots.txt` |
| Background cache warming for catalog ids | Ops cost; no product ask |
| Aligning catalog `playerStatus` with FF when they disagree | Needs product rules; detail can show both sources |
| Localised English translations of Spanish `label` / `diagnosis` | Display raw published text first |

Do not implement batch scrape, list `include=profile`, or a new aggregated
“availability index” endpoint unless product explicitly reverses §2.

---

## 10. Non-goals

- Changing upstream LaLiga catalog fields or adding `playerStatus` reason text
  there.
- Scraping changes, parser rule changes, or new scraping routes.
- Market or lineup availability behaviour.
- Replacing the three-state list filter with five parser states (filters stay
  `available` / `questionable` / `unavailable` from catalog).
- Database or cross-user shared cache of profile HTML.
