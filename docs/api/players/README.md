# Players API

Catalog and market value are **public**; the league card is authenticated
(JWT + LaLiga bearer). To add a route, follow
[Adding endpoints](../adding-endpoints.md).

## Routes

| Method | Path | Upstream | Auth | Response model |
|--------|------|----------|------|----------------|
| `GET` | `/players` | `{CMP}/players` | None | `list[CatalogPlayer]` |
| `GET` | `/players/{player_id}/market-value` | `{CMP}/player/{id}/market-value` | None | `list[PlayerMarketValue]` |
| `GET` | `/players/{player_id}/league/{league_id}` | `{CMP}/player/{id}/league/{leagueId}` | Internal JWT | `LeaguePlayer` |

Models: `fantasy_api.schemas.players`. Catalog `weekPoints` stays untyped
(upstream uses week objects; league rosters use a scalar).

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
  `playerTeamId`, buyout, shield, or market blocks.

```bash
cd backend/api
uv run fantasy-players
uv run fantasy-players --player-id 7 --league-id 42 --jwt "$INTERNAL_JWT"
```
