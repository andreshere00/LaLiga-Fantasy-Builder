# Players API

Catalog and market value are **public**; the league card is authenticated
(JWT + LaLiga bearer). To add a route, follow
[Adding endpoints](../adding-endpoints.md).

Segmented player stats (FutbolFantasy via the scraping service, LaLiga catalog
and market history, optional OpenWeather) live under `/players/{player_id}/stats/*`.
The UI should prefer **`/stats/detail`** over client-side `--segment all`.
See the [scraping service](../../scraping/README.md) for scraper behavior.

## Routes

| Method | Path | Upstream | Auth | Response model |
|--------|------|----------|------|----------------|
| `GET` | `/players` | `{CMP}/players` | None | `list[CatalogPlayer]` |
| `GET` | `/players/{player_id}/market-value` | `{CMP}/player/{id}/market-value` | None | `list[PlayerMarketValue]` |
| `GET` | `/players/{player_id}/league/{league_id}` | `{CMP}/player/{id}/league/{leagueId}` | Internal JWT | `LeaguePlayer` |
| `GET` | `/players/{player_id}/stats` | Catalog (+ config probe) | Internal JWT | `PlayerStatsIndex` |
| `GET` | `/players/{player_id}/stats/fixtures` | Catalog, scraping, calendar | Internal JWT | `PlayerFixtureStatsResponse` |
| `GET` | `/players/{player_id}/stats/market` | `{CMP}/player/{id}/market-value` | Internal JWT | `PlayerMarketResponse` |
| `GET` | `/players/{player_id}/stats/matches/recent` | Scraping, calendar | Internal JWT | `RecentMatchesResponse` |
| `GET` | `/players/{player_id}/stats/matches/upcoming` | Scraping, calendar, OpenWeather | Internal JWT | `UpcomingMatchesResponse` |
| `GET` | `/players/{player_id}/stats/profile` | Scraping, catalog | Internal JWT | `PlayerProfileResponse` |
| `GET` | `/players/{player_id}/stats/detail` | Aggregate of stats segments | Internal JWT | `PlayerDetailResponse` |

The detail route returns fixtures, market, recent and upcoming matches, and
profile in one round trip. Individual segment routes remain for direct access
and CLI `--segment all` (sequential). A **200** response can include
`segment_errors` when one or more segments failed or were disabled; auth and
catalog failures still use 401 and 404. Query defaults: `last=5`, `limit=5`,
`preset=season` (when `from`/`to` are omitted), all segments in `include`.
The `competition` query parameter can be repeated to filter fixture stats by
competition (for example, `competition=laliga`). It filters the `fixtures`
segment only; recent and upcoming match segments remain unfiltered.
A missing OpenWeather key still returns upcoming matches; weather on those
rows is disabled.

### Detail aggregate behaviour

- **`segment_errors`**: only segments that failed upstream or were skipped
  because scraping is disabled (`SCRAPING_BASE_URL` unset). **`market` is never
  disabled.** **`upcoming` is not disabled** for a missing OpenWeather key.
- Typical **`SegmentError.code`** values: `disabled`, `scraping_unavailable`,
  `stats_source_not_found`, `player_alias_unavailable` (the known master player
  ID has no verified profile route), `stats_not_applicable` (coach entries have no
  player profile on the scraping source), `scraping_error`, and other
  `UpstreamError.category` strings from the segment that failed. **`detail`**
  is a fixed, sanitised message (never raw upstream bodies).
- When the public player catalog omits a club name, stats resolution looks up
  its `teamId` in the cached teams-master directory and uses that name to
  disambiguate short or shared player nicknames.
- **`profile.averages`** lists per-match figures derived from the scraped
  season totals (`seasonStats`) divided by matches played, including saves and
  goals conceded for goalkeepers. A missing code is `value: null`. The player
  detail screen fills supported missing values from the catalog's recent
  `lastStats` matchweeks and labels those shorter Fantasy samples separately.
- **`profile.form`** carries a published numeric value when available, or an
  arrow rating (`bad`, `mid`, `good`, `very_good`) from FutbolFantasy's form
  widget. Arrow ratings have `visual_only: true` and no numeric value.
  **`profile.start_probability`** carries the published
  percentage and matchweek.
- The profile screen builds its per-match average table from `profile.averages`
  and fills missing supported metrics from the player's LaLiga Fantasy
  `lastStats` catalog data. The fallback averages count only played weeks and
  report their source and sample size in the UI; they do not change the API's
  scraped average values.
- **Fixture-point provenance:** each `StatValue` keeps published Fantasy and
  DAZN values separate. When a published Fantasy value is unavailable, the API
  may calculate it from the official scoring rules using the player's position,
  minutes and observed stat counts; this has
  `source: "computed_official"`. `null` means that the source did not publish
  a value; it is never silently converted to zero. Computed values are returned
  only when their explained action total, either alone or together with DAZN,
  agrees with the match total. Otherwise the API retains the unavailable value
  and adds a `computed_points_mismatch` warning.
- Availability is available as `injury.availability_text` and in the
  structured `profile.availability` field.

Models: `fantasy_api.schemas.players` (catalog/league card) and
`fantasy_api.schemas.player_stats` (stats segments). Catalog `weekPoints` stays
an explicit recursive JSON value (upstream uses week objects; league rosters use a scalar).
Pydantic validates player and stats payloads, including query bounds; frontend API
responses and query inputs use camelCase Zod contracts before entering UI state.

## Identifiers

| Id | Source |
|----|--------|
| `playerId` | Master footballer id from `GET /players` (`id`) |
| `playerTeamId` | Squad entry id on league cards / lineup (not master `playerId`) |
| `leagueId` | `GET /leagues` (`id`) |

## Notes

- Public reads send no `Authorization` upstream; a header on those routes is
  ignored.
- League-card path ids are master `playerId` even when the body embeds
  `playerTeamId`, buyout, shield, or market blocks. Paying or raising a
  clause and checking or activating a shield use
  [Buyout](../buyout/README.md), keyed by `playerTeamId`.

```bash
cd backend/api
uv run fantasy-players
uv run fantasy-players --player-id 7 --league-id 42 --jwt "$INTERNAL_JWT"
uv run fantasy-player-stats --player-id 4288 --segment index --jwt "$INTERNAL_JWT"
uv run fantasy-player-stats --player-id 4288 --segment detail --jwt "$INTERNAL_JWT"
```

Catalog `teamId` accepts an integer or a decimal-digit string; malformed values
produce a sanitized 502, with the resolver retaining its bounded stale-cache fallback.
League cards validate known manager, market and master-player nested fields.
Statistics validate `TeamsMasterRow` and `MarketHistoryPoint` provider DTOs before
club lookup and history normalization; malformed samples fail the market segment.
The frontend validates all stats query bounds and date-window combinations before
fetch, including repeated `include` segments on the detail endpoint.
