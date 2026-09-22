# Buyout API

Authenticated LaLiga buyout clauses and player shielding under
`{CMP}/league/{leagueId}/...`. All public routes use the `/buyout` prefix.
To add a route, follow [Adding endpoints](../adding-endpoints.md).

Upstream confidence for these routes is **Medium** (community catalog; not
live-verified here).

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/shield` | `.../player-team/{id}/check-shield` | `ShieldStatus` |
| `POST` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/pay` | `.../buyout/{id}/pay` | `BuyoutMutationResult` |
| `POST` | `/buyout/leagues/{league_id}/player-teams/{player_team_id}/increase` | `.../buyout/{id}/increase` | `BuyoutMutationResult` |
| `PUT` | `/buyout/leagues/{league_id}/shield` | `.../shield/player` | `BuyoutMutationResult` |

All require `Authorization: Bearer <internal JWT>`. Read models use
`extra="allow"`. Write bodies use `extra="forbid"`.

The legacy `PUT .../buyout/player` increase contract is **not** proxied
(low confidence; superseded by `POST .../increase`).

## Identifiers

| Id | Source |
|----|--------|
| `leagueId` | `GET /leagues` (`id`) |
| `playerTeamId` | Team roster (`playerTeamId` on squad slots), market payloads |

Shield activation names the field `playerId`, but Fantasy expects the
**squad-entry id** (`playerTeamId`), not the master footballer id. Observed
clients send `rewardedAdType` `"Blindaje"` and `rewardedAd` `1`; the API
forwards whatever the client supplies.

## Notes

- **Ownership:** this API does not verify that ids belong to the JWT user;
  Fantasy enforces access. Obtain ids from `GET /leagues`, team squads, or
  player league cards (`buyoutClause`, `isShielded` on reads).
- **CLI:** `fantasy-buyout` and `fantasy-browser-session buyout-analysis` are
  **read-only** (shield status only; no pay, increase, or activate in
  automated flows).

```bash
cd backend/api
uv run fantasy-buyout --league-id 123 --player-team-id pt-9 --json
```

```bash
cd backend/auth
uv run fantasy-browser-session buyout-analysis \
  --league-id 123 --player-team-id pt-9 --json
```
