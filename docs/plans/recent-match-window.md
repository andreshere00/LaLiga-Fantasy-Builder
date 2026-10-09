# Plan: recent match window and fixture backfill

Status: **proposed**

Date: **2026-10-05**

Owner: players screen match history — default last five finished matches, optional
deeper history via the fixtures segment, and `FixtureRef` enrichment so the table
can render opponent, home/away, scores, and result.

Related: [player-detail-endpoint.md](player-detail-endpoint.md) (aggregate load;
do not redesign), [player-stats-endpoint.md](player-stats-endpoint.md) section 5.3
(intended merge rules).

---

## 1. Problem

| Layer | Limit | Role |
|-------|-------|------|
| Scraper/parser `matches.recent` | 0–5 rows | Widget order (newest first) |
| `RecentMatchesQuery.limit` | 1–5 (`le=5`) | API cap on recent segment |
| `UpcomingMatchesQuery.limit` | 1–5 (`le=5`) | Upcoming segment |
| `FixturesQuery.last` | 1–60 (default 10) | Season fixture rows, newest first |

The players screen needs:

1. **Default:** the same five rows the FutbolFantasy recent widget exposes.
2. **See more (previous only):** older finished matches without changing scraper
   pagination or raising `RecentMatchesQuery.limit`.
3. **Renderable rows:** widget rows often omit `opponent`, `is_home`, and team
   labels; scores may be present while the UI still needs a fixture string.

**Current API gap** (`PlayerStatsService`):

- `recent_matches` maps `wire.matches.recent` only. It does not join
  `wire.fixtures`, does not apply the LaLiga Fantasy `lastStats` merge used in
  `fixtures`, and leaves `FixtureRef.opponent` / `home_team` / `away_team` empty
  when the widget omits them.
- `fixtures` builds richer `FixtureRef` (teams, scores, `is_home`) from
  `wire.fixtures` and merges Fantasy catalog stats for LaLiga, but does not set
  `opponent` and is not used by the recent segment today.

`wire_map._normalise_match` preserves widget fields as scraped; it does not
backfill from fixtures (that linking exists in the scraping parser for stats,
not in the API response).

---

## 2. Locked decisions

| # | Decision |
|---|----------|
| D1 | **Default previous window:** `GET /players/{player_id}/stats/matches/recent?limit=5&include_stats=true`. |
| D2 | **See more previous:** `GET /players/{player_id}/stats/fixtures?last={n}` with `n` in **10, 20, 40, 60** only (UI steps). Do **not** increase `RecentMatchesQuery.limit` above 5. Do **not** add scraper or parser pagination. |
| D3 | **Upcoming:** `GET .../stats/matches/upcoming?limit=5` only. No see-more control. Do not scrape a longer calendar. |
| D4 | **Fixture backfill:** When a recent (or display) row lacks `opponent` and/or `is_home`, copy missing `FixtureRef` fields from the **merged season fixtures** row with the same **`date` and `competition`**, or **`matchweek` and score** when the fixture row has no date (live `tablestats`). Calendar widgets may already publish opponent and side; backfill is a fallback. If no row matches, leave fields `null`; the UI shows `-`. |
| D5 | **Stats authority:** LaLiga per-fixture stats use the existing Fantasy + FutbolFantasy **merge** (as `fixtures`). Non-LaLiga rows use scraped stats on the fixture row (widget or `wire.fixtures`). |
| D6 | **Detail aggregate:** Keep [player-detail-endpoint.md](player-detail-endpoint.md) as proposed: initial load uses `last=5` for fixtures and `limit=5` for recent/upcoming. See-more uses a **separate** fixtures call with a larger `last`, not a higher recent limit. |
| D7 | **Tests:** `{method}_{state}_{behavior}` with standard pytest sections. |

---

## 3. Goal and non-goals

### 3.1 Goal

- Players screen shows **five** recent matches with stats and displayable fixture/result.
- **Load more previous** replaces the table body with up to 60 rows from the fixtures
  segment, using fixed step sizes.
- **Upcoming** block stays at five rows from the upcoming segment.
- One scrape per player/season still backs recent, fixtures, and upcoming (existing
  `ScrapedPlayerProvider` single-flight cache).

### 3.2 In scope

| Item | Notes |
|------|--------|
| API service helpers | Shared fixture-row builder, backfill, stats merge for recent |
| `recent_matches` | Backfill + LaLiga Fantasy merge when `include_stats=true` |
| `fixtures` | Reuse shared builder; optional `opponent` derivation for display |
| Frontend consumers | Data fetching and table mapping (section 6) |
| Tests | Service-level cases + route smoke updates |
| Docs | `docs/api/players/README.md` consumer note |

### 3.3 Non-goals

- Changing `RecentMatchesQuery` / `UpcomingMatchesQuery` bounds.
- Scraper/parser changes, extra HTML pages, or widget length &gt; 5.
- Fantasy calendar join for opponent (D4 uses merged `wire.fixtures` only).
- New routes or response models (reuse `RecentMatch`, `FixtureStatsRow`, envelopes).
- Redesigning `GET .../stats/detail` query shape or segment fan-out.

---

## 4. API behaviour

### 4.1 Routes (unchanged)

| Consumer | Route | Query |
|----------|-------|--------|
| Default recent table (5) | `GET .../stats/matches/recent` | `limit=5`, `include_stats=true` |
| See more previous | `GET .../stats/fixtures` | `last=10\|20\|40\|60`, optional `competition` |
| Upcoming (5) | `GET .../stats/matches/upcoming` | `limit=5`, `include_weather=true` |
| Initial page bundle | `GET .../stats/detail` | `last=5`, `limit=5`, defaults from detail plan |

### 4.2 Fixture index (in-memory, per request)

After one `doc = await self._scraped.futbolfantasy(player, season)`:

1. Build a list of **fixture index entries** from `wire.fixtures` (same
   classification as today: `competition_from_row`, `parse_match_date`).
2. Key: `(date, competition)` where `date` is the parsed `FixtureRef.date`.
3. Duplicate keys: keep the first entry after stable sort by date descending
   (document in code; add test if golden data ever duplicates).

This index is used for backfill only. It is **not** filtered by `FixturesQuery.last`
until the fixtures segment applies `last` on output rows.

### 4.3 Shared row builder

Extract private helpers on `PlayerStatsService` (or a small `player_stats_fixtures`
module if the service file grows):

| Helper | Responsibility |
|--------|----------------|
| `_fixture_ref_from_wire_fixture(fixture, competition) -> FixtureRef` | Teams, scores, `is_home`, `matchweek`, `result`; derive `opponent` as the other team code when `is_home` is known |
| `_fixture_stats_layers(fixture, competition, fantasy_weeks) -> layers` | LaLiga: Fantasy week map + parser layer; else: parser layer only |
| `_lookup_fixture_index(index, date, competition) -> wire fixture \| None` | D4 match |
| `_merge_fixture_ref(base, supplement: FixtureRef) -> FixtureRef` | Copy **only** fields that are `null` on `base` from `supplement` (opponent, `is_home`, `home_team`, `away_team`, scores, `matchweek`, `competition_label`) |

Refactor `fixtures()` to call `_fixture_ref_from_wire_fixture` and
`_fixture_stats_layers` so recent and fixtures stay aligned.

### 4.4 `recent_matches` algorithm

For each widget row in `wire.matches.recent` (order preserved, then `[: query.limit]`):

1. Classify competition (`competition_from_row(row.competition_raw)` or row competition).
2. Build initial `FixtureRef` from the widget (current fields: date, matchweek,
   scores, `is_home`, `opponent`, `result`).
3. **Backfill (D4):** If `opponent is None` or `is_home is None`, look up
   `(date, competition)` in the fixture index. On hit, `_merge_fixture_ref`.
4. **Stats (D5):** If `include_stats`:
   - Resolve merged fixture row (index hit or widget-only).
   - LaLiga: `merge_fixture_stats` with Fantasy catalog layer when
     `fantasy_weeks[matchweek]` exists, plus FutbolFantasy layer from widget
     `row.stats` or index fixture stats (same order as `fixtures()`).
   - Non-LaLiga: FutbolFantasy layer from widget or index fixture; no Fantasy layer.
   - If no stats layers: `stats = null` (no new warning code unless merge already
     emits one).
5. Minutes and `fantasy_points_total` unchanged from widget unless a later
   follow-up explicitly aligns totals with Fantasy (out of scope here).

Do not fetch calendar or bearer-backed A1 in this plan.

### 4.5 `fixtures` segment

No query or schema change. Behaviour change only where it improves parity with
recent:

- Use shared `_fixture_ref_from_wire_fixture` (adds derived `opponent`).
- Stats merge unchanged (already D5-compliant).

`FixturesQuery.last` default remains **10** in the schema; the players screen
overrides with 5 on detail load and 10/20/40/60 on see-more.

### 4.6 Upcoming

No code change required for this plan. Confirm `limit=5` default and no pagination
in UI.

### 4.7 Warnings

- Do not add a new warning for backfill miss (UI handles `-`).
- Keep existing merge warnings from `merge_fixture_stats`.
- Optional: segment-level `scraping_partial` remains the parser’s concern; API
  does not re-emit parser warnings on recent unless already present on the row.

---

## 5. Frontend (players screen)

Assumes detail aggregate for first paint when implemented; segments remain valid
standalone.

### 5.1 State

| State | Source |
|-------|--------|
| `recentWindow` | `5` or `10` \| `20` \| `40` \| `60` when user expanded |
| `recentRows` | `recent.matches` when `recentWindow === 5`; else map `fixtures.fixtures` |

### 5.2 Load sequence

1. **Initial:** `GET .../stats/detail?last=5&limit=5&include_stats=true` (or
   parallel `recent` + `fixtures?last=5` + `upcoming` if detail not shipped yet).
2. **See more:** increment step in `{10,20,40,60}`; `GET .../stats/fixtures?last={step}`
   only (no second scrape if cache TTL allows; same JWT session).
3. **Upcoming:** always five rows from detail or `upcoming?limit=5`.

Hide or disable see-more when `fixtures.length < step` or step is 60.

### 5.3 Table mapping

| Column | Recent (5) | Fixtures (expanded) |
|--------|------------|---------------------|
| Date | `fixture.date` | same |
| Competition | `fixture.competition` / label | same |
| Fixture | `opponent` + home/away badge from `is_home`; else `-` | same |
| Result | scores + `result` (W/D/L) | same |
| Minutes | `minutes.minutes` / note | `minutes_played` on row |
| Points | `fantasy_points_total` | `fantasy_points_total` |
| Stats drill-down | `stats` when present | same |

Map `FixtureStatsRow` to the same row component as `RecentMatch` where shapes
differ only in minutes nesting.

### 5.4 UX copy

- Control label: “Show more previous matches” (or equivalent i18n key).
- Steps: 10 → 20 → 40 → 60 (not arbitrary numbers; matches API `le=60` cap).

---

## 6. Tests

Primary file: `backend/api/tests/test_player_stats_service.py` (new) or extend
`test_player_stats_routes.py` for thin route checks. Prefer **service unit tests**
with a minimal wire document for backfill and merge.

Sections: `# ---- Mocks, fixtures & helpers ---- #`, `# ---- Happy path ---- #`,
`# ---- Error paths ---- #`, `# ---- Edge cases ---- #`.

| Test name | Scenario | Expected |
|-----------|----------|----------|
| `recent_matches_widget_missing_opponent_backfills_from_fixtures` | Recent row with scores but no opponent; fixture index has same date+competition | `opponent`, `is_home`, team codes populated |
| `recent_matches_no_index_match_leaves_nulls` | No fixture row for date+competition | `opponent` / `is_home` stay null |
| `recent_matches_laliga_include_stats_merges_fantasy_layer` | LaLiga row + catalog `lastStats` for matchweek | Fantasy + FF merge; not FF-only |
| `recent_matches_non_laliga_uses_scraped_fixture_stats` | `competition=other` | No Fantasy layer |
| `recent_matches_honours_limit_five` | Wire has 5 recent rows | At most 5 returned |
| `fixtures_builds_opponent_from_team_codes` | Wire fixture with home/away codes | `opponent` set |
| `lookup_fixture_index_duplicate_date_competition_first_wins` | Two fixtures same key | Deterministic pick |

Route smoke (existing golden `futbolfantasy_raphinha.json`):

- Extend `test_stats_recent_*` to assert first LaLiga row has non-null opponent
  or team fields after backfill.

Run:

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```

No OpenAPI change unless docstrings describe backfill behaviour; if only service
logic changes, OpenAPI regeneration is optional. Update
`docs/api/players/README.md` with D1–D3 consumer table.

---

## 7. Implementation order

| Step | Work |
|------|------|
| M1 | Shared helpers + refactor `fixtures()` |
| M2 | `recent_matches` backfill + LaLiga merge alignment |
| M3 | Service tests + golden adjustments |
| M4 | Frontend table + see-more steps |
| M5 | README consumer note |

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Date+competition collision (two matches same day) | Rare; accept first index hit; UI may wrong-row; future: add score tie-break only if product requires |
| Widget date vs fixture date off by one | D4 uses exact date equality; no ±1 day unless product revises |
| Expanded view shows fixtures not in widget | Expected; fixtures list can include matches not in recent five |
| Detail `last=5` vs fixtures default `10` | Detail query explicitly sets `last=5`; document in README |

---

## 9. Acceptance criteria

- Default players load shows five recent rows with opponent/home/away or `-` when
  backfill impossible.
- See-more fetches fixtures with `last` in {10,20,40,60} and renders the same columns.
- Upcoming remains five rows; no extra upstream scrape length.
- `RecentMatchesQuery.limit` and scraper recent array stay capped at five.
- LaLiga stats on recent rows match fixtures merge for the same matchweek when
  Fantasy catalog data exists.
