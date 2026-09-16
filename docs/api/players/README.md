# Players API

LaLiga Fantasy player reads proxied by `backend/api`. Catalog and
market-value are public Fantasy resources (no LaLiga bearer). The
league-scoped card validates an internal JWT, resolves a short-lived
bearer via auth, then calls:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/player/{id}/league/{leagueId}
```

## Guides

- [Adding players endpoints](adding-players-endpoints.md) — implementation
  plan, CRS checklist, and OpenAPI notes
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — JWT and bearer rules

## Routes

| Method | Path | Upstream | Auth | Response model |
|--------|------|----------|------|----------------|
| `GET` | `/players` | `{CMP}/players` | No | `list[CatalogPlayer]` |
| `GET` | `/player/{player_id}/market-value` | `{CMP}/player/{id}/market-value` | No | `list[MarketValuePoint]` |
| `GET` | `/player/{player_id}/league/{league_id}` | `{CMP}/player/{id}/league/{leagueId}` | Yes | `LeaguePlayerCard` |

Models live in `fantasy_api.schemas.players` (extra Fantasy fields are
preserved via `extra="allow"`).

## Identifiers

| Id | Source |
|----|--------|
| `playerId` | Master catalog id from `GET /players` |
| `playerTeamId` | Plantilla slot on a roster / league card (not interchangeable) |
| `leagueId` | `GET /leagues` (`id`) |
| `teamId` (catalog) | Real-world club id on the player, not a Fantasy manager team |

## Local try-out

```bash
# Public catalog (API running on :8001; no JWT)
curl -sS http://localhost:8001/players | head

curl -sS "http://localhost:8001/player/68/market-value"

# League card — Auth + API running; LaLiga paired; JWT minted
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  "http://localhost:8001/player/68/league/${LEAGUE_ID}"
```

CLI summary (catalog, market value, optional league card):

```bash
cd backend/api
uv run fantasy-players
uv run fantasy-players --player-id 68
uv run fantasy-players --player-id 68 --league-id "$LEAGUE_ID" --jwt "$INTERNAL_JWT"
# or session cookies: FANTASY_SESSION + FANTASY_CSRF
```

## Architecture

```text
api/players.py
  → services/players.py          # public calls, or get_laliga_bearer + repo
    → repositories/players.py    # path builder
      → clients/laliga_fantasy.py
```

See [Architecture](../../architecture.md) for the end-to-end auth → API →
Fantasy flow.
