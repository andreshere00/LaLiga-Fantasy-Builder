# Players API

Catalog and market value are **public**; the league card is authenticated
(JWT + LaLiga bearer). To add a route, follow
[Adding endpoints](../adding-endpoints.md).

Segmented player stats (FutbolFantasy via the scraping service, LaLiga catalog
and market history, optional OpenWeather) live under `/players/{player_id}/stats/*`.
See [player-stats-endpoint plan](../../plans/player-stats-endpoint.md),
[player detail aggregate plan](../../plans/player-detail-endpoint.md) (UI should
prefer **`/stats/detail`** over client-side `--segment all`), and
[scraping service](../../scraping/README.md).

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
A missing OpenWeather key still returns upcoming matches; weather on those
rows is disabled.

### Detail aggregate behaviour

- **`segment_errors`**: only segments that failed upstream or were skipped
  because scraping is disabled (`SCRAPING_BASE_URL` unset). **`market` is never
  disabled.** **`upcoming` is not disabled** for a missing OpenWeather key.
- Typical **`SegmentError.code`** values: `disabled`, `scraping_unavailable`,
  `stats_source_not_found`, `scraping_error`, and other `UpstreamError.category`
  strings from the segment that failed. **`detail`** is a fixed, sanitised
  message (never raw upstream bodies).
- Planned structured **`profile.availability`** / **`profile.form`** for the
  players detail screen are described in
  [list-availability.md](../../plans/list-availability.md) and are **not** on
  the wire yet; use `injury.availability_text` today.

Models: `fantasy_api.schemas.players` (catalog/league card) and
`fantasy_api.schemas.player_stats` (stats segments). Catalog `weekPoints` stays
untyped (upstream uses week objects; league rosters use a scalar).

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
