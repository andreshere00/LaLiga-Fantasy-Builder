# Leagues API

LaLiga Fantasy league reads proxied by `backend/api`. Controllers validate an
internal JWT, resolve a short-lived LaLiga bearer via auth, then call Fantasy
competition paths under:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/leagues/...
```

## Guides

- [Adding leagues endpoints](adding-leagues-endpoints.md) — extend the CRS
  stack and regenerate OpenAPI
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — JWT and bearer rules

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

All require `Authorization: Bearer <internal JWT>`. Models live in
`fantasy_api.schemas.leagues` (extra Fantasy fields are preserved via
`extra="allow"`).

## Identifiers

| Id | Source |
|----|--------|
| `leagueId` | `GET /leagues` (`id`) |
| `teamId` | `league.team.id`, standing row, or teams list |
| `week` | Matchweek number; CLI may infer “última jornada” |
| `page` | Activity page; usually starts at `0` |

## Local try-out

```bash
# Auth + API running; LaLiga paired; JWT minted
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/laliga/leagues-probe

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/leagues
```

CLI summary (ranking / position, week standing, activity, teams):

```bash
cd backend/api
uv run fantasy-leagues --jwt "$INTERNAL_JWT"
# or session cookies: FANTASY_SESSION + FANTASY_CSRF
```

## Architecture

```text
api/leagues.py
  → services/leagues.py          # with_laliga_bearer + repo calls
    → repositories/leagues.py  # path builder
      → clients/laliga_fantasy.py
```

Shared helpers with teams: `repositories/paths.py`, `services/laliga.py`,
`schemas/payload.py`, `api/payload.py`.

See [Architecture](../../architecture.md) for the end-to-end auth → API →
Fantasy flow.
