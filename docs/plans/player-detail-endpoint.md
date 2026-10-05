# Plan: player detail aggregate (`GET /players/{player_id}/stats/detail`)

Status: **proposed**

Owner of this plan: one JWT read on `backend/api` that returns the five player
stats segments in a single response. It does not add scraping, weather, market
math, or frontend screens. Those stay in
[player-stats-endpoint.md](player-stats-endpoint.md).

This plan **supersedes decision D3** in that document for the detail consumer.
D3 kept `GET /players/{player_id}/stats` as a catalogue and left composition to
the client, because the segments fail independently. The players screen needs
one round trip. The segment routes stay. The aggregate keeps the same
independence inside the body: one failed segment does not fail the others.

## 1. Goal and non-goals

### 1.1 Goal

`GET /players/{player_id}/stats/detail` returns fixtures, market, recent
matches, upcoming matches, and profile for one catalog `playerId`. The browser
makes one authenticated call. The service reuses `PlayerStatsService` methods.
FutbolFantasy is fetched once per player and season through the existing
single-flight cache.

### 1.2 In scope

| Item | Notes |
|------|--------|
| Route, query model, response model | Section 2 |
| Service fan-out with per-segment errors | Section 3 |
| CLI `--segment detail` | One HTTP call, read-only |
| Tests, OpenAPI, `docs/api/players/README.md` | Sections 5 and 6 |

### 1.3 Non-goals

- Replacing the six existing stats routes. The index stays a catalogue.
- Averages per match, hierarchy-label changes, recent-fixture backfill, or
  passing `player_id` into the scraper. Those are separate follow-ups.
- Ownership, free-agent status, bids, clauses, or listings. No `league_id`.
  No LaLiga bearer.
- Photo, season points, and market snapshot. Those remain on `GET /players`.
  `PlayerRef` on this route is the same ref the segments already return.
- A database. Process-local TTL caches only, as today.
- Raw scrape HTML, tokens, or upstream error bodies.

## 2. Route

| Method | Path | Auth | Response | Cache-Control |
|--------|------|------|----------|---------------|
| `GET` | `/players/{player_id}/stats/detail` | JWT | `PlayerDetailResponse` | `private, max-age=60` |

`Vary: Authorization`. `response_model_exclude_none=False`, same as the other
stats routes (`null` means that segment did not load).

Path id is the existing `PlayerIdPath` (`^[0-9]{1,10}$`), the catalog master
id, not `playerTeamId`.

Register the handler on `api/player_stats.py`. One rate-limit check per
request, using the current limiter (`player_stats_rate_limit_per_minute`).
Do not check the limiter once per nested segment. A detail call counts as one
request, the same as one segment call today.

### 2.1 Query

One strict query model, `PlayerDetailQuery` (`extra="forbid"`), with the same
bounds as the segment queries:

| Field | Default | Bounds | Forwarded to |
|-------|---------|--------|--------------|
| `last` | `5` | 1–60 | fixtures |
| `competition` | omitted | `Competition` values, repeatable | fixtures |
| `preset` | `season` | `season`, `30d`, `14d`, `10d`, `5d` | market |
| `from` | omitted | ISO date | market |
| `to` | omitted | ISO date | market |
| `limit` | `5` | 1–5 | recent and upcoming |
| `include_stats` | `true` | bool | recent |
| `include_weather` | `true` | bool | upcoming |
| `include` | all five names | `fixtures`, `market`, `recent`, `upcoming`, `profile` | which segments run |

`preset` is exclusive with `from`/`to`. `from` is required when `to` is set.
`from` must be on or before `to`. The span must be at most 400 days. Reuse
`MarketQuery._valiDate_window` rather than copying the rules. Invalid queries
are `422` before any upstream call.

`include` defaults to every segment. A caller can omit a heavy segment
(`fixtures` with a large `last`, or `upcoming` when weather is unnecessary).
Unknown names are `422`.

### 2.2 Response

```python
class SegmentError(StatsModel):
    segment: Literal["fixtures", "market", "recent", "upcoming", "profile"]
    code: str
    detail: str


class PlayerDetailResponse(StatsModel):
    player_id: str
    player: PlayerRef
    season: str
    generated_at: datetime
    fixtures: PlayerFixtureStatsResponse | None
    market: PlayerMarketResponse | None
    recent: RecentMatchesResponse | None
    upcoming: UpcomingMatchesResponse | None
    profile: PlayerProfileResponse | None
    segment_errors: list[SegmentError]
```

Nested payloads are the existing response models, unchanged. `segment_errors`
lists only the segments that failed or were skipped because their source is
disabled. A successful segment is absent from that list and its payload is
set. A failed segment has payload `null`.

`detail` on `SegmentError` is the fixed `UpstreamError` message already
returned by that segment (`"scraping unavailable"`, `"stats source not found"`,
`"unexpected market history"`). Cap it at 200 characters and strip control
characters, using the same rule as `SegmentWarning.detail`. Never copy an
upstream body, URL, or exception string.

## 3. Service

Add `PlayerStatsService.detail(player_id, query) -> PlayerDetailResponse`.

1. `await self._resolver.resolve(player_id)` once. Unknown id raises
   `NotFoundError("player not found")` and the handler returns **404**. No
   scrape, no market fetch, no weather.
2. Build the five segment queries from `PlayerDetailQuery`. Skip names not in
   `include`.
3. `asyncio.gather` the included calls. Each call is an existing method:
   `fixtures`, `market`, `recent_matches`, `upcoming_matches`, `profile`.
4. Wrap each call. `UpstreamError` becomes a `SegmentError` and a `null`
   payload. Anything else propagates (`UnauthorizedError`,
   `NeedsReauthError`, validation bugs).
5. When the stats index would mark a segment `available=false` (scraper base
   URL unset, or OpenWeather key unset for upcoming), do not call that
   method. Record `code="disabled"` and `detail="segment disabled"`.

The first scraped method fills `ScrapedPlayerProvider` for `(player, season)`.
The others await the same single-flight cache, so one detail request triggers
at most one `GET /internal/players/futbolfantasy`. Market history and weather
keep their own caches and run in parallel with that scrape.

Do not add a second timeout around the gather. Client timeouts already bound
scraping (20 s), OpenWeather (5 s), and Fantasy (30 s).

### 3.1 HTTP status

| HTTP | When |
|------|------|
| 200 | Catalog player exists. Zero or more segments failed; see `segment_errors`. |
| 401 | Missing or invalid JWT, or `needs_reauth`. |
| 404 | `player_id` is not in the catalog. |
| 422 | Bad path or query. |
| 429 | Rate limit. `Retry-After` set. |
| 502 / 503 | Not used for a single segment failure. Those codes stay on the segment routes. |

A FutbolFantasy 404 (`stats_source_not_found`) fails the scraped segments and
still returns **200** when the catalog player exists. Market can succeed in
that body. The segment routes keep returning 404 for that case when called
directly.

Auth-class errors always fail the whole request. They are not segment errors.

## 4. CLI

Extend `fantasy-player-stats` with `--segment detail`. It performs **one**
`GET /players/{id}/stats/detail` and prints that JSON. Exit `0` on HTTP 200
even when `segment_errors` is non-empty. Exit non-zero on 401, 404, 422, 429,
and transport failure.

Leave `--segment all` as it is: sequential calls to the segment routes, so
the CLI can still compare the aggregate with the individual routes and does
not become a parallel scraper client.

Forward `--preset`, `--from`, `--to`, `--competition`, `--last`, `--limit`,
`--no-weather`, and `--no-stats` the same way the segment CLI already does.
No new login flow. The command stays read-only.

## 5. Tests

File: `backend/api/tests/test_player_stats.py` (extend) or
`test_player_detail.py` if the current module is already large. Sections:
`# ---- Mocks, fixtures & helpers ---- #`, `# ---- Happy path ---- #`,
`# ---- Error paths ---- #`, `# ---- Edge cases ---- #`. Names:
`{method}_{state}_{behavior}`.

| Case | Expected |
|------|----------|
| All segments succeed | 200, five payloads, `segment_errors` empty, scraping client called once |
| Scraper 503, market ok | 200, scraped payloads `null`, market set, one error per scraped segment, `code=scraping_unavailable` |
| Scraper player 404 | 200, scraped segments errored with `stats_source_not_found`, market still set |
| Unknown catalog id | 404 `not_found`, scraping client not called |
| Missing JWT | 401 |
| `preset` together with `from` | 422, no upstream call |
| `include=market` | only `market` is called |
| Scraper URL unset | scraped segments `disabled`, market still called |
| Rate limit exceeded | 429 and `Retry-After` |
| Error `detail` | fixed string only; bearer, service token, and upstream body absent |

Use `httpx.MockTransport`, as the other stats tests do.

## 6. Docs and OpenAPI

After the route exists:

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
```

Commit `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`.

Update [docs/api/players/README.md](../api/players/README.md): path, JWT, query
defaults, and the 200-with-`segment_errors` rule. Add one row to the stats
route table. Note that D3 is superseded for this consumer and that the
segment routes remain.

## 7. What this does not fix

The players screen will still join `GET /players` for photo, name, points, and
availability, and league rosters plus the market snapshot for ownership and
bid or sale actions. This route is the stats body only.

Averages per match are not a segment yet. When that route exists, add an
`averages` payload and an `include` value here. Do not block this endpoint on
that work.
