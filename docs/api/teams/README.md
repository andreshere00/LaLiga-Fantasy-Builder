# Teams API

Authenticated LaLiga team money and lineup routes under `{CMP}/teams/...`.
To add a route, follow [Adding endpoints](../adding-endpoints.md).

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/teams/{team_id}/money` | `{CMP}/teams/{id}/money` | `TeamMoney` |
| `GET` | `/teams/{team_id}/lineup` | `{CMP}/teams/{id}/lineup` | `TeamLineup` |
| `GET` | `/teams/{team_id}/lineup/week/{week}` | `.../lineup/week/{week}` | `TeamLineup` |
| `PUT` | `/teams/{team_id}/lineup` | `{CMP}/teams/{id}/lineup` | `TeamLineup` |

All require `Authorization: Bearer <internal JWT>`. Models:
`fantasy_api.schemas.teams` (`extra="allow"` on reads).

## Identifiers

| Id | Source |
|----|--------|
| `teamId` | `league.team.id` from `GET /leagues`, standing, or teams list |
| `playerTeamId` | Roster slot id (not master `playerId`) |
| `week` | Matchweek (`>= 1`) |

## Notes

- **Money:** `teamMoney` / `teamInvestment` for the caller's team. Rivals are
  often empty or sparse.
- **Lineup PUT:** slots are `playerTeamId`. Base slots (`goalkeeper`,
  `defender`, `midfield`, `striker`, `tactical_formation`) are required
  (Fantasy full replace). Unknown JSON keys → 422. Optional unofficial
  premium fields: `coach`, `captain`, `bench`.
- **Ownership:** this API does not check that `team_id` belongs to the JWT
  user; Fantasy does. Take `team_id` from `GET /leagues`.

```bash
cd backend/api
uv run fantasy-teams --jwt "$INTERNAL_JWT"
uv run fantasy-teams --team-id "$TEAM_ID" --week 5 --json
```
