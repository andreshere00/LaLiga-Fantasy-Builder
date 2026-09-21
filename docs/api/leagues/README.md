# Leagues API

Authenticated LaLiga league reads proxied by `backend/api` under
`{CMP}/leagues/...`. To add a route, follow
[Adding endpoints](../adding-endpoints.md).

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/laliga/leagues-probe` | `{CMP}/leagues` (redacted) | `LeaguesProbeResponse` |
| `GET` | `/leagues` | `{CMP}/leagues` | `list[FantasyLeague]` |
| `GET` | `/leagues/{league_id}/standing` | `{CMP}/leagues/{id}/standing` | `list[StandingRow]` |
| `GET` | `/leagues/{league_id}/standing/{week}` | `.../standing/{week}` | `list[StandingRow]` |
| `GET` | `/leagues/{league_id}/activity/{page}` | `.../activity/{page}` | `list[ActivityItem]` |
| `GET` | `/leagues/{league_id}/teams` | `.../teams` | `list[LeagueTeam]` |
| `GET` | `/leagues/{league_id}/teams/{team_id}` | `.../teams/{teamId}` | `TeamDetail` |

All require `Authorization: Bearer <internal JWT>`. Models:
`fantasy_api.schemas.leagues` (`extra="allow"`).

`FantasyLeague.token` (private join code) is proxied on `GET /leagues`; the
probe redacts bearers but not that field.

## Identifiers

| Id | Source |
|----|--------|
| `leagueId` | `GET /leagues` (`id`) |
| `teamId` | `league.team.id`, standing row, or teams list |
| `week` | Matchweek (`>= 1`); CLI may infer “última jornada” |
| `page` | Activity page; usually starts at `0` |

```bash
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/leagues
cd backend/api && uv run fantasy-leagues --jwt "$INTERNAL_JWT"
```
