# Players API

LaLiga Fantasy player catalog, market value, and league cards proxied by
`backend/api`. Catalog and market value are public; the league card validates
an internal JWT, resolves a short-lived LaLiga bearer via auth, then calls
Fantasy competition paths under:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/...
```

## Guides

- [Adding players endpoints](adding-players-endpoints.md) — extend the CRS stack
  and regenerate OpenAPI
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — JWT and bearer rules

## Routes

| Method | Path | Upstream | Auth | Response model |
|--------|------|----------|------|----------------|
| `GET` | `/players` | `{CMP}/players` | None | `list[CatalogPlayer]` |
| `GET` | `/players/{player_id}/market-value` | `{CMP}/player/{id}/market-value` | None | `list[PlayerMarketValue]` |
| `GET` | `/players/{player_id}/league/{league_id}` | `{CMP}/player/{id}/league/{leagueId}` | Internal JWT | `LeaguePlayer` |

Models live in `fantasy_api.schemas.players` (extra Fantasy fields preserved
via `extra="allow"`). Catalog `weekPoints` stays untyped because upstream uses
a list of week objects, unlike the scalar on league rosters.

## Identifiers

| Id | Source |
|----|--------|
| `playerId` | Master footballer id from `GET /players` (`id`) |
| `playerTeamId` | Squad entry id on league cards and lineup payloads (not master `playerId`) |
| `leagueId` | `GET /leagues` (`id`) |

## Notes

- **Public reads:** catalog and market value send no `Authorization` upstream
  and need no pairing. An `Authorization` header on those routes is ignored.
- **League card:** path ids are master `playerId` values even though the
  response may embed `playerTeamId`, buyout, shield, and market blocks.
- There is no players connectivity probe; the public catalog is the probe.

## Local try-out

```bash
curl -sS http://localhost:8001/players | head -c 500
curl -sS http://localhost:8001/players/7/market-value

# Auth + API running; LaLiga paired; JWT minted
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/players/7/league/42
```

CLI summary (catalog, market value, optional league card):

```bash
cd backend/api
uv run fantasy-players
uv run fantasy-players --player-id 7 --json
uv run fantasy-players --player-id 7 --league-id 42 --jwt "$INTERNAL_JWT"
```

## Architecture

```text
api/players.py
  → services/players.py          # public direct + with_laliga_bearer for league card
    → repositories/players.py    # path builder ({CMP}/players, {CMP}/player/...)
      → clients/laliga_fantasy.py
```

Shared helpers with leagues/teams: `repositories/paths.py`,
`services/laliga.py`, `schemas/payload.py`, `api/payload.py`.

See [Architecture](../../architecture.md) for the end-to-end auth → API →
Fantasy flow.
