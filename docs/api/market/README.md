# Market API

Authenticated LaLiga league market, bids, listings, and offers under
`{CMP}/league/{leagueId}/...`. All public routes use the `/market` prefix.
To add a route, follow [Adding endpoints](../adding-endpoints.md).

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/market/leagues/{league_id}` | `{CMP}/league/{id}/market` | `MarketSnapshot` |
| `GET` | `/market/leagues/{league_id}/history` | `.../market/history` | `list[MarketHistoryEntry]` |
| `GET` | `/market/leagues/{league_id}/player-teams/{player_team_id}/offers` | `.../playerTeam/{id}/offer` | `PlayerTeamOffers` |
| `POST` | `/market/leagues/{league_id}/{market_id}/bids` | `.../market/{id}/bid` | `MarketMutationResult` |
| `PUT` | `/market/leagues/{league_id}/{market_id}/bids/{bid_id}` | `.../bid/{bidId}` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}/bids/{bid_id}` | `.../bid/{bidId}/cancel` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/listings` | `.../market/sell` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/direct-offers` | `.../market/direct-offer` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}` | `.../market/{id}/delete` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/accept` | `.../offer/{id}/accept` | `MarketMutationResult` |
| `POST` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/reject` | `.../offer/{id}/reject` | `MarketMutationResult` |
| `DELETE` | `/market/leagues/{league_id}/{market_id}/offers/{offer_id}` | `.../offer/{id}/cancel` | `MarketMutationResult` |

All require `Authorization: Bearer <internal JWT>`. Read models use
`extra="allow"`. Write bodies use `extra="forbid"`.

Upstream confidence: current market and squad-entry offers are **High**;
history and all mutations are **Medium** (community catalog).

## Identifiers

| Id | Source |
|----|--------|
| `leagueId` | `GET /leagues` (`id`) |
| `playerTeamId` | Team roster or market payloads (squad-entry id) |
| `marketId`, `bidId`, `offerId` | Market / offer responses |

Listing and direct-offer bodies name the field `playerId`, but Fantasy
expects the **squad-entry id** (`playerTeamId`), not the master footballer id.

## Notes

- **Ownership:** this API does not verify that ids belong to the JWT user;
  Fantasy enforces access. Obtain ids from `GET /leagues`, team squads, or
  market reads.
- **CLI:** `fantasy-market` and `fantasy-browser-session market-analysis` are
  **read-only** (no bids, sales, or offers in automated flows).

```bash
cd backend/api
uv run fantasy-market --league-id 123 --json
uv run fantasy-market --league-id 123 --player-team-id pt-9 --json
```

```bash
cd backend/auth
uv run fantasy-browser-session market-analysis --json
```
