# Teams API

LaLiga Fantasy team money and lineup routes proxied by `backend/api`.
Controllers validate an internal JWT, resolve a short-lived LaLiga bearer via
auth, then call Fantasy competition paths under:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/teams/...
```

## Guides

- [Adding teams endpoints](adding-teams-endpoints.md) — extend the CRS stack
  and regenerate OpenAPI
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — JWT and bearer rules

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/teams/{team_id}/money` | `{CMP}/teams/{id}/money` | `TeamMoney` |
| `GET` | `/teams/{team_id}/lineup` | `{CMP}/teams/{id}/lineup` | `TeamLineup` |
| `GET` | `/teams/{team_id}/lineup/week/{week}` | `.../lineup/week/{week}` | `TeamLineup` |
| `PUT` | `/teams/{team_id}/lineup` | `{CMP}/teams/{id}/lineup` | `TeamLineup` |

All require `Authorization: Bearer <internal JWT>`. Models live in
`fantasy_api.schemas.teams` (extra Fantasy fields are preserved via
`extra="allow"`).

## Identifiers

| Id | Source |
|----|--------|
| `teamId` | `league.team.id` from `GET /leagues`, standing row, or teams list |
| `playerTeamId` | Roster slot id on plantilla / lineup payloads (not master `playerId`) |
| `week` | Matchweek number (`>= 1`) |

## Notes

- **Money:** `GET /teams/{team_id}/money` returns cash (`teamMoney`) and
  investment (`teamInvestment`) for the caller's own team. Rival teams often
  return empty or sparse objects.
- **Lineup write:** Slot values in the PUT body are `playerTeamId` identifiers.
  Observed base body fields: `goalkeeper`, `defender`, `midfield`, `striker`,
  `tactical_formation`. Premium leagues may also send `coach`, `captain`, and
  `bench`. These shapes are documented from unofficial 26/27 clients, not an
  official Fantasy schema.
- There is no teams connectivity probe; obtain `team_id` from leagues first.

## Local try-out

```bash
# Auth + API running; LaLiga paired; JWT minted; TEAM_ID from GET /leagues
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  "http://localhost:8001/teams/${TEAM_ID}/money"

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  "http://localhost:8001/teams/${TEAM_ID}/lineup"

curl -sS -X PUT \
  -H "Authorization: Bearer ${INTERNAL_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"goalkeeper":"pt-1","defender":["pt-2"],"midfield":["pt-3"],"striker":["pt-4"],"tactical_formation":[4,3,3]}' \
  "http://localhost:8001/teams/${TEAM_ID}/lineup"
```

## Architecture

```text
api/teams.py
  → services/teams.py            # with_laliga_bearer + repo calls
    → repositories/teams.py      # path builder ({CMP}/teams/...)
      → clients/laliga_fantasy.py
```

Shared helpers with leagues: `repositories/paths.py`,
`services/laliga.py`, `schemas/payload.py`, `api/payload.py`.

See [Architecture](../../architecture.md) for the end-to-end auth → API →
Fantasy flow.
