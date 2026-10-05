# Plan: Players list URL filters

Status: **proposed**

Decision date: **2026-10-05**

Product decision: filter state for the future Players list lives in the URL so a
view can be shared and restored. This plan defines the query contract and how
`/players` reads and writes it. It does not implement the screen, catalog join,
or filter predicates.

List behaviour (fixed elsewhere; URL must support it):

- Catalog source: `GET /players` for every row.
- **Leaderboard mode:** no text search and no active filters → top 10 by catalog
  `points` (FSYP), not paginated.
- **Filtered mode:** any search or filter → client-side filter, **15 rows per
  page**, 1-based `page`.
- Filter dimensions (market-aligned, no seal-end): name/query, owner, team,
  market value range, FSYP range, form range, availability, position. Position
  id `3` displays **MDF** (reuse `frontend/src/features/market/positions.ts`).
- Owner = fantasy manager name or **Free Agent** (from league roster + market
  join, same sources as the screen plan).
- Detail path uses catalog master id: `/players/{playerId}` — never
  `playerTeamId` in list URLs.

Precedents: lineup reads `?team=` via `useSearchParams` (`LineupPage.tsx`).
Market keeps filters in React `useState` (`MarketPage.tsx`); this task does
**not** migrate market (see §8).

---

## 1. Routes

| Path | Screen | Query params |
|------|--------|--------------|
| `/players` | Catalog list + filters | This contract |
| `/players/:playerId` | Player detail | Out of scope here; path id is master `playerId` only |

Register both in `App.tsx`. Extend `docs/frontend.md` routes table when the
screen ships.

---

## 2. Query parameter contract

All params are optional. **Omit when default** so bare `/players` means
leaderboard mode.

| Param | Type | Default | Omit when | Semantics |
|-------|------|---------|-----------|-----------|
| `q` | string | `""` | empty after trim | Toolbar search: player **name** only (accent-insensitive match via `normalizeSearchText`, same as market text filters). |
| `name` | string | `""` | empty after trim | Column filter: player name only (market `player` field). |
| `owner` | string | `""` | empty after trim | Column filter: fantasy manager display name, or `Free Agent` (URL-encoded). Substring match, accent-insensitive. |
| `team` | string | `""` | empty after trim | Column filter: real club / catalog team name (substring, accent-insensitive). Not the lineup `/?team={fantasyTeamId}` param. |
| `mvMin` | integer | none | absent | Market value lower bound (inclusive), Fantasy integer units. |
| `mvMax` | integer | none | absent | Market value upper bound (inclusive). |
| `fsypMin` | integer | none | absent | FSYP / catalog `points` lower bound (inclusive). |
| `fsypMax` | integer | none | absent | FSYP upper bound (inclusive). |
| `formMin` | number | none | absent | Form lower bound (inclusive); finite decimal allowed (e.g. `6.5`). |
| `formMax` | number | none | absent | Form upper bound (inclusive). |
| `avail` | string | none | absent | Comma-separated availability tokens: `available`, `questionable`, `unavailable` (same enum as `market/model/availability.ts`). Order not significant; dedupe on parse. |
| `pos` | string | none | absent | Comma-separated position ids `1`–`5` (GKP, DEF, MDF, ATK, COA). Order not significant; dedupe on parse. |
| `page` | integer | see §3 | absent in leaderboard mode; omit when `1` in filtered mode | 1-based page index when filtered mode is active. |

**Active filter:** any param that would be omitted under the rules above is
non-default. `q`, `name`, `owner`, or `team` with non-empty normalized text;
any set `mvMin`/`mvMax`/`fsypMin`/`fsypMax`/`formMin`/`formMax`; non-empty
`avail` or `pos`; or `page` > 1.

**Range rules:** if only one bound is present, treat as open-ended on the other
side (same as market). If `min > max` after parse, drop **both** bounds for
that range (do not crash).

---

## 3. Leaderboard vs filtered mode and `page`

```text
leaderboardActive =
  no active filter (§2) AND normalizeSearchText(q) is empty
  AND normalizeSearchText(name) is empty
```

| Mode | Condition | List body | `page` in URL |
|------|-----------|-----------|---------------|
| Leaderboard | `leaderboardActive` | Top 10 by `points` desc | **Must be absent.** If present in incoming URL, parse ignores it (drop param, do not use for slicing). |
| Filtered | not `leaderboardActive` | Full client-side filter, then slice 15 per page | Present when `page > 1`. **Omit when `page === 1`.** If absent, treat as **1**. |

**Writes:**

- Any change to `q`, `name`, `owner`, `team`, range, `avail`, or `pos` → reset
  to page **1** (remove `page` from URL).
- Increment/decrement pagination → set `page` only in filtered mode; omit when 1.
- Clearing the last active filter/search → remove `page` and return to
  leaderboard mode URL (path only `/players` or other omitted defaults).

**Invalid `page`:** non-integer, `< 1`, or NaN → drop param; behave as page `1`
in filtered mode. If filtered result is empty, still filtered mode (empty state),
not leaderboard.

---

## 4. Parse and serialize (pure functions)

**Location:** `frontend/src/features/players/playersSearchParams.ts`

**Types** (same file or `playersFilters.ts` if split):

- `PlayersFilters` — mirrors market shape where possible: `query` ← `q`, `player`
  ← `name`, `owner`, `team`, `marketValue`, `points` (FSYP), `form`,
  `availability`, `positions`; reuse `NumericRange` and `Availability` from
  market modules (import, do not duplicate enums).
- `PlayersListUrlState` — `{ filters: PlayersFilters; page: number | null }`
  where `page` is `null` in leaderboard mode and a positive integer in filtered
  mode.

**Exports:**

| Function | Responsibility |
|----------|----------------|
| `parsePlayersSearchParams(params: URLSearchParams): PlayersListUrlState` | Map URL → state; drop invalid segments; never throw. |
| `serializePlayersSearchParams(state: PlayersListUrlState): URLSearchParams` | Map state → URL; apply omit-when-default; never emit `page` in leaderboard mode. |
| `isPlayersLeaderboardView(filters: PlayersFilters): boolean` | Same predicate as §3 (shared by parse, serialize, and UI). |
| `withPlayersFilters(base: URLSearchParams, patch: Partial<PlayersFilters>): URLSearchParams` | Merge filter patch, reset page per §3 (helper for handlers). |
| `withPlayersPage(base: URLSearchParams, page: number): URLSearchParams` | Set page in filtered mode only. |

**Invalid input handling (fail soft):**

- Unknown `avail` token → drop that token; if none left, omit `avail`.
- `pos` token not in `1`…`5` → drop token; if none left, omit `pos`.
- Non-finite or non-numeric range values → omit that bound.
- Duplicate commas / empty segments in `avail` or `pos` → ignore empties.

Optional: `replace: true` on navigation updates to avoid history spam (same
pattern as other screens when implemented).

---

## 5. React wiring (`PlayersPage`)

**Location:** `frontend/src/features/players/PlayersPage.tsx` (future).

- `const [searchParams, setSearchParams] = useSearchParams()`.
- Derive `const urlState = useMemo(() => parsePlayersSearchParams(searchParams), [searchParams])`.
- **Do not** `useState` for filters or page synced from URL via `useEffect`.
  Toolbar and column controls call `setSearchParams(serializePlayersSearchParams(...))`
  or the `with*` helpers.
- Row data: `useMemo` pipeline — catalog rows → `applyPlayersFilters` (new,
  analogous to `applyMarketFilters`) → leaderboard take 10 or paginate by
  `urlState.page` and page size 15.
- Links to detail: `/players/${encodeURIComponent(playerId)}` with **no** list
  query string unless a later UX decision adds return navigation.

Filter UI can reuse market popover/chip components where dimensions match;
`playersColumnFilters.ts` mirrors `marketColumnFilters.ts` (no `sealEnd`).

---

## 6. Tests (Vitest)

**File:** `frontend/src/features/players/playersSearchParams.test.ts`

Sections: `# ---- Mocks, fixtures & helpers ---- #`, `# ---- Happy path ---- #`,
`# ---- Error paths ---- #`, `# ---- Edge cases ---- #`.

Naming: `{unit}_{state}_{behavior}`.

| Test name | Asserts |
|-----------|---------|
| `parsePlayersSearchParams_emptyParams_leaderboardMode` | Defaults; `page` null; leaderboard true. |
| `parsePlayersSearchParams_fullQuery_roundTrips` | Serialize after parse equals canonical omit-default URL. |
| `parsePlayersSearchParams_invalidPage_ignored` | `page=0`, `page=abc` → treated as absent / 1 in filtered mode. |
| `parsePlayersSearchParams_leaderboardWithPage_dropsPage` | Active filters false but `page=2` → page ignored. |
| `parsePlayersSearchParams_invalidAvailToken_dropsToken` | `avail=available,foo` → set `{available}` only. |
| `parsePlayersSearchParams_invalidPos_dropsToken` | `pos=3,99` → `{3}` only. |
| `parsePlayersSearchParams_invertedRange_dropsBothBounds` | `mvMin=100&mvMax=50` → open range inactive. |
| `serializePlayersSearchParams_leaderboard_omitsPage` | No active filters → no `page` key. |
| `serializePlayersSearchParams_filteredPageOne_omitsPage` | Filter active, page 1 → no `page` key. |
| `serializePlayersSearchParams_filteredPageTwo_includesPage` | `page=2` present. |
| `withPlayersFilters_patch_resetsPage` | URL had `page=3`; changing `q` removes `page`. |
| `isPlayersLeaderboardView_queryOnly_false` | Non-empty `q` → filtered mode. |

Add `playersFilters.test.ts` for `applyPlayersFilters` / `activeFilterCount`
when filter logic lands (mirror `marketFilters.test.ts` cases for owner/team).

---

## 7. In scope for the URL/filter task

- Query contract above, parse/serialize module, unit tests.
- `PlayersPage` URL read/write pattern and filter → pagination rules.
- App route registration and `docs/frontend.md` route row (with screen work).

---

## 8. `/market` URL filters — same task or not?

**Stay as-is for this task.** Market filters remain component state (`MarketPage`
`useState`). Players is the first screen with a shareable filter URL; migrating
market to `playersSearchParams`-style serialization is a **follow-up** (touch
`marketFilters.ts`, toolbar, column popovers, tests, and possible bookmark
compat). Do not block Players on market parity.

---

## 9. Out of scope

- Implementing the Players UI, table columns, or styling.
- Server-side search or catalog query params on `GET /players`.
- Persisting filters in `sessionStorage` / per-league keys (market deferred the
  same).
- URL-syncing market (`/market?…`).
- List query string on `/players/:playerId` or deep-linking detail filters.
- Backend API changes.
- Replacing lineup `/?team=` with a shared abstraction (different meaning on
  `/players` for club name filter).

---

## 10. Implementation checklist

1. Add `playersSearchParams.ts` + tests (contract stable before UI).
2. Add `playersFilters.ts` (+ tests) aligned with market predicates and owner/team
   fields.
3. Implement `PlayersPage` with derived URL state only.
4. Register `/players` and `/players/:playerId` in `App.tsx`.
5. Update `docs/frontend.md` routes table and cross-link this plan.
