# Fantasy Builder API — endpoint schemas

Machine-readable source of truth: [`backend/api/openapi.json`](../../backend/api/openapi.json)
(OpenAPI 3.1). Regenerate this file after route or schema changes:

```bash
cd backend/api
uv run generate-openapi
uv run generate-endpoint-schemas
```

From the repo root:

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
```

This document covers **`backend/api`** (port 8001). Auth service routes on port 8000
are not included here.

## Authentication (common input)

| Location | Name | Type | Required | Description |
|----------|------|------|----------|-------------|
| Header | `Authorization` | string | Yes* | `Bearer <internal JWT>` from auth `POST /auth/token` |

\* Not required for `/health`, `/health/live`, and `/health/ready`.

## Error responses (common output)

| HTTP | Schema | Body |
|------|--------|------|
| 401 | `ErrorResponse` | `error`, `detail` — unauthorized or `needs_reauth` |
| 422 | `HTTPValidationError` | FastAPI validation (`detail` array) |
| 502 | `ErrorResponse` | Auth or Fantasy upstream failure |
| 503 | `ErrorResponse` | Fantasy upstream unavailable |

Protected routes also declare these error shapes in OpenAPI; successful responses
below omit repeated error tables.

### ErrorResponse

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `error` | string | yes |  | Machine-readable category |
| `detail` | string | yes |  | Human-readable message (no tokens) |

## Tag: `health`

Liveness and readiness probes.

### `GET` `/health`

Liveness probe

**Security:** none

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `HealthResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `status` | string | yes |  |  |

Full nested fields: [`HealthResponse`](#healthresponse).


### `GET` `/health/live`

Liveness probe

**Security:** none

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `HealthResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `status` | string | yes |  |  |

Full nested fields: [`HealthResponse`](#healthresponse).


### `GET` `/health/ready`

Readiness probe

**Security:** none

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `HealthResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `status` | string | yes |  |  |

Full nested fields: [`HealthResponse`](#healthresponse).


## Tag: `me`

Application identity and credential probes.

### `GET` `/laliga/credential-probe`

Probe LaLiga bearer availability

**Security:** HTTP Bearer (internal JWT)

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `LaligaCredentialProbeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `user_id` | string | yes |  |  |
| `has_bearer` | boolean | yes |  |  |
| `expires_at` | integer | yes |  |  |

Full nested fields: [`LaligaCredentialProbeResponse`](#laligacredentialproberesponse).


### `GET` `/me`

Get authenticated application user

**Security:** HTTP Bearer (internal JWT)

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `MeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `user_id` | string | yes |  |  |
| `email` | string | no |  |  |
| `name` | string | no |  |  |

Full nested fields: [`MeResponse`](#meresponse).


## Tag: `leagues`

LaLiga Fantasy league reads (standing, activity, teams). Thin authenticated proxies of competition league resources.

### `GET` `/laliga/leagues-probe`

Probe Fantasy leagues connectivity

**Security:** HTTP Bearer (internal JWT)

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `LeaguesProbeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `ok` | boolean | yes |  |  |
| `league_count` | integer | yes | min=0 |  |
| `league_ids` | array[any] | no |  |  |

Full nested fields: [`LeaguesProbeResponse`](#leaguesproberesponse).


### `GET` `/leagues`

List competition leagues

**Security:** HTTP Bearer (internal JWT)

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** array of `FantasyLeague`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `access` | string | no |  |  |
| `type` | LeagueType | no |  | Fantasy league type metadata. |
| `managersNumber` | integer | no |  |  |
| `name` | string | no |  |  |
| `config` | LeagueConfig | no |  | League configuration. |
| `isDuplicated` | boolean | no |  |  |
| `isSecondRound` | boolean | no |  |  |
| `description` | string | no |  |  |
| `premium` | boolean | no |  |  |
| `team` | LeagueTeamSummary | no |  | Caller's team summary embedded in a league object. |


### `GET` `/leagues/{league_id}/activity/{page}`

Get paginated league activity

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `page` | integer | yes | min=0 | Activity page index (typically starts at 0). |

#### Outputs

**HTTP 200:** array of `ActivityItem`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `activityTypeId` | integer | no |  |  |
| `amount` | integer | no |  |  |
| `createdAt` | string | no |  |  |
| `playerMasterId` | integer | no |  |  |
| `user1Id` | integer | no |  |  |
| `user2Id` | integer | no |  |  |
| `weekNumber` | integer | no |  |  |
| `msg` | string | no |  |  |
| `message` | string | no |  |  |
| `description` | string | no |  |  |


### `GET` `/leagues/{league_id}/standing`

Get overall league standing

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |

#### Outputs

**HTTP 200:** array of `StandingRow`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `points` | integer | no |  |  |
| `livePoints` | integer | no |  |  |
| `team` | StandingTeam | no |  | Team row nested under standing. |
| `teamId` | string \| integer | no |  |  |
| `name` | string | no |  |  |


### `GET` `/leagues/{league_id}/standing/{week}`

Get league standing for a matchweek

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `week` | integer | yes | min=1 | Matchweek number. |

#### Outputs

**HTTP 200:** array of `StandingRow`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `points` | integer | no |  |  |
| `livePoints` | integer | no |  |  |
| `team` | StandingTeam | no |  | Team row nested under standing. |
| `teamId` | string \| integer | no |  |  |
| `name` | string | no |  |  |


### `GET` `/leagues/{league_id}/teams`

List league teams and managers

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |

#### Outputs

**HTTP 200:** array of `LeagueTeam`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `managerId` | integer | no |  |  |
| `banned` | boolean | no |  |  |
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `fixturePoints` | integer | no |  |  |
| `startingWeek` | string | no |  |  |
| `teamMoney` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `teamValue` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |
| `players` | array[SquadPlayer] | no |  |  |
| `loanedPlayers` | array[any] | no |  |  |


### `GET` `/leagues/{league_id}/teams/{team_id}`

Get team roster and clauses

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `team_id` | string | yes |  | Fantasy team identifier. |

#### Outputs

**HTTP 200:** `TeamDetail`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `managerId` | integer | no |  |  |
| `banned` | boolean | no |  |  |
| `position` | integer | no |  |  |
| `startingWeek` | string | no |  |  |
| `teamMoney` | integer | no |  |  |
| `playersNumber` | integer | no |  |  |
| `teamValue` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |
| `players` | array[SquadPlayer] | no |  |  |
| `loanedPlayers` | array[any] | no |  |  |

Full nested fields: [`TeamDetail`](#teamdetail).


## Tag: `teams`

LaLiga Fantasy team money and lineup reads/writes. Thin authenticated proxies of competition team resources.

### `GET` `/teams/{team_id}/lineup`

Get current team lineup

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `team_id` | string | yes |  | Fantasy team identifier. |

#### Outputs

**HTTP 200:** `TeamLineup`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `formation` | LineupFormation | no |  | Formation block nested under a Fantasy lineup response. |
| `teamId` | string \| integer | no |  |  |
| `weekNumber` | integer | no |  |  |

Full nested fields: [`TeamLineup`](#teamlineup).


### `PUT` `/teams/{team_id}/lineup`

Replace the current team lineup

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `team_id` | string | yes |  | Fantasy team identifier. |
| body | `goalkeeper` | string \| integer | yes |  |  |
| body | `defender` | array[string \| integer] | yes |  |  |
| body | `midfield` | array[string \| integer] | yes |  |  |
| body | `striker` | array[string \| integer] | yes |  |  |
| body | `tactical_formation` | array[integer] | yes |  |  |
| body | `coach` | string \| integer | no |  |  |
| body | `captain` | string \| integer | no |  |  |
| body | `bench` | object | no |  |  |

#### Outputs

**HTTP 200:** `TeamLineup`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `formation` | LineupFormation | no |  | Formation block nested under a Fantasy lineup response. |
| `teamId` | string \| integer | no |  |  |
| `weekNumber` | integer | no |  |  |

Full nested fields: [`TeamLineup`](#teamlineup).


### `GET` `/teams/{team_id}/lineup/week/{week}`

Get team lineup for a matchweek

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `team_id` | string | yes |  | Fantasy team identifier. |
| path | `week` | integer | yes | min=1 | Matchweek number. |

#### Outputs

**HTTP 200:** `TeamLineup`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `formation` | LineupFormation | no |  | Formation block nested under a Fantasy lineup response. |
| `teamId` | string \| integer | no |  |  |
| `weekNumber` | integer | no |  |  |

Full nested fields: [`TeamLineup`](#teamlineup).


### `GET` `/teams/{team_id}/money`

Get team cash and investment

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `team_id` | string | yes |  | Fantasy team identifier. |

#### Outputs

**HTTP 200:** `TeamMoney`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `teamMoney` | integer | no |  |  |
| `teamInvestment` | integer | no |  |  |

Full nested fields: [`TeamMoney`](#teammoney).


## Tag: `calendar`

Matchday calendar and stats (public Fantasy reads). Requires an internal JWT; upstream calls omit the LaLiga bearer.

### `GET` `/calendar/current`

Get current matchday

**Security:** HTTP Bearer (internal JWT)

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** `CurrentWeek`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `isLive` | boolean | no |  |  |
| `nextWeek` | integer | no |  |  |
| `previousWeek` | integer | no |  |  |
| `weekNumber` | integer | no |  |  |
| `openingWeekDate` | string | no |  |  |
| `closingWeekDate` | string | no |  |  |

Full nested fields: [`CurrentWeek`](#currentweek).


### `GET` `/calendar/weeks/{week}`

Get fixtures for a matchday

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `week` | integer | yes | min=1 | Matchweek number. |

#### Outputs

**HTTP 200:** array of `Fixture`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `matchDate` | string | no |  |  |
| `date` | string | no |  |  |
| `time` | string | no |  |  |
| `localId` | integer | no |  |  |
| `visitorId` | integer | no |  |  |
| `matchState` | integer | no |  |  |
| `localScore` | integer | no |  |  |
| `visitorScore` | integer | no |  |  |
| `featured` | boolean | no |  |  |


### `GET` `/calendar/weeks/{week}/stats`

Get matchday statistics and results

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `week` | integer | yes | min=1 | Matchweek number. |

#### Outputs

**HTTP 200:** array of `MatchStats`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | integer | no |  |  |
| `date` | string | no |  |  |
| `local` | MatchSide | no |  | Home or away side in matchweek stats. |
| `visitor` | MatchSide | no |  | Home or away side in matchweek stats. |
| `matchState` | integer | no |  |  |
| `localScore` | integer | no |  |  |
| `visitorScore` | integer | no |  |  |


## Tag: `buyout`

LaLiga Fantasy buyout clauses and player shielding. Thin authenticated proxies of competition league buyout resources.

### `POST` `/buyout/leagues/{league_id}/player-teams/{player_team_id}/increase`

Set or increase a buyout clause

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `player_team_id` | string | yes |  | Squad-entry id (``playerTeamId``), not master ``playerId``. |
| body | `buyoutClause` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `BuyoutMutationResult`



### `POST` `/buyout/leagues/{league_id}/player-teams/{player_team_id}/pay`

Pay a buyout clause

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `player_team_id` | string | yes |  | Squad-entry id (``playerTeamId``), not master ``playerId``. |
| body | `buyoutClauseToPay` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `BuyoutMutationResult`



### `GET` `/buyout/leagues/{league_id}/player-teams/{player_team_id}/shield`

Check shield status for a squad entry

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `player_team_id` | string | yes |  | Squad-entry id (``playerTeamId``), not master ``playerId``. |

#### Outputs

**HTTP 200:** `ShieldStatus`



### `PUT` `/buyout/leagues/{league_id}/shield`

Activate shielding for a squad entry

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| body | `playerId` | string \| integer | yes |  |  |
| body | `rewardedAdType` | string | yes |  |  |
| body | `rewardedAd` | integer | yes |  |  |

#### Outputs

**HTTP 200:** `BuyoutMutationResult`



## Tag: `market`

LaLiga Fantasy league market, bids, listings, and offers. Thin authenticated proxies of competition league market resources.

### `GET` `/market/leagues/{league_id}`

Get current league market

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |

#### Outputs

**HTTP 200:** `MarketSnapshot`



### `POST` `/market/leagues/{league_id}/direct-offers`

Send a direct offer to another manager

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| body | `playerId` | string \| integer | yes |  |  |
| body | `money` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `GET` `/market/leagues/{league_id}/history`

Get league market history

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |

#### Outputs

**HTTP 200:** array of `MarketHistoryEntry`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |


### `POST` `/market/leagues/{league_id}/immediate-sales`

Sell a player immediately at half market value

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| body | `playerId` | string \| integer | yes |  |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `POST` `/market/leagues/{league_id}/listings`

List a player for sale

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| body | `playerId` | string \| integer | yes |  |  |
| body | `salePrice` | integer | yes | >0, max=999999999 |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `GET` `/market/leagues/{league_id}/player-teams/{player_team_id}/offers`

Get offers on an owned squad entry

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `player_team_id` | string | yes |  | Squad-entry id (``playerTeamId``), not master ``playerId``. |

#### Outputs

**HTTP 200:** `PlayerTeamOffers`



### `DELETE` `/market/leagues/{league_id}/{market_id}`

Withdraw a market listing

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `POST` `/market/leagues/{league_id}/{market_id}/bids`

Create a bid on a market listing

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| body | `money` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `PUT` `/market/leagues/{league_id}/{market_id}/bids/{bid_id}`

Modify a bid

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| path | `bid_id` | string | yes |  | Bid identifier. |
| body | `money` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `DELETE` `/market/leagues/{league_id}/{market_id}/bids/{bid_id}`

Cancel a bid

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| path | `bid_id` | string | yes |  | Bid identifier. |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `DELETE` `/market/leagues/{league_id}/{market_id}/offers/{offer_id}`

Cancel an offer

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| path | `offer_id` | string | yes |  | Offer identifier. |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `POST` `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/accept`

Accept an offer on a listing

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| path | `offer_id` | string | yes |  | Offer identifier. |
| body | `offerMoney` | integer | yes | >0 |  |

#### Outputs

**HTTP 200:** `MarketMutationResult`



### `POST` `/market/leagues/{league_id}/{market_id}/offers/{offer_id}/reject`

Reject an offer on a listing

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `league_id` | string | yes |  | Fantasy league identifier. |
| path | `market_id` | string | yes |  | Market listing identifier. |
| path | `offer_id` | string | yes |  | Offer identifier. |

#### Outputs

**HTTP 200:** `MarketMutationResult`



## Tag: `player-stats`

Segmented player statistics (fixtures, market window, matches, profile). Requires an internal JWT; scraped segments call the private scraper.

### `GET` `/players/{player_id}/stats`

List the stats segments available for a player

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |

#### Outputs

**HTTP 200:** `PlayerStatsIndex`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player` | PlayerRef | yes |  |  |
| `season` | string | yes |  |  |
| `segments` | array[SegmentDescriptor] | no |  |  |
| `generated_at` | string | yes |  |  |

Full nested fields: [`PlayerStatsIndex`](#playerstatsindex).


### `GET` `/players/{player_id}/stats/fixtures`

Per-fixture statistics for a player

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |
| query | `competition` | array[Competition] | no |  |  |
| query | `last` | integer | no | min=1, max=60 |  |

#### Outputs

**HTTP 200:** `PlayerFixtureStatsResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `fixtures` | array[FixtureStatsRow] | no |  |  |

Full nested fields: [`PlayerFixtureStatsResponse`](#playerfixturestatsresponse).


### `GET` `/players/{player_id}/stats/market`

Market-value window and preset summaries

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |
| query | `preset` | MarketPreset | no |  |  |
| query | `from` | string | no |  |  |
| query | `to` | string | no |  |  |

#### Outputs

**HTTP 200:** `PlayerMarketResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `window` | MarketWindow | yes |  |  |
| `presets` | array[MarketPresetSummary] | no |  |  |
| `current_value` | integer | no |  |  |
| `currency` | string | no |  |  |

Full nested fields: [`PlayerMarketResponse`](#playermarketresponse).


### `GET` `/players/{player_id}/stats/matches/recent`

Recent matches for a player

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |
| query | `limit` | integer | no | min=1, max=5 |  |
| query | `include_stats` | boolean | no |  |  |

#### Outputs

**HTTP 200:** `RecentMatchesResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `matches` | array[RecentMatch] | no |  |  |

Full nested fields: [`RecentMatchesResponse`](#recentmatchesresponse).


### `GET` `/players/{player_id}/stats/matches/upcoming`

Upcoming matches for a player

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |
| query | `limit` | integer | no | min=1, max=5 |  |
| query | `include_weather` | boolean | no |  |  |

#### Outputs

**HTTP 200:** `UpcomingMatchesResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `matches` | array[UpcomingMatch] | no |  |  |

Full nested fields: [`UpcomingMatchesResponse`](#upcomingmatchesresponse).


### `GET` `/players/{player_id}/stats/profile`

Global player profile from FutbolFantasy

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer id (`CatalogPlayer.id`). |

#### Outputs

**HTTP 200:** `PlayerProfileResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `injury` | Injury | yes |  |  |
| `start_probability` | StartProbability | yes |  |  |
| `injury_risk` | InjuryRiskInfo | yes |  |  |
| `injury_history` | array[InjuryHistoryEntry] | no |  |  |
| `max_profitable_bid` | MaxProfitableBid | yes |  |  |
| `hierarchy` | Hierarchy | yes |  |  |
| `news` | array[NewsItem] | no |  |  |

Full nested fields: [`PlayerProfileResponse`](#playerprofileresponse).


## Tag: `players`

LaLiga Fantasy player catalog, market value, and league cards. Catalog and market value are public; league cards are authenticated.

### `GET` `/players`

List competition players

**Security:** none

#### Inputs

No path, query, or body parameters.

#### Outputs

**HTTP 200:** array of `CatalogPlayer`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `nickname` | string | no |  |  |
| `name` | string | no |  |  |
| `slug` | string | no |  |  |
| `positionId` | integer | no |  |  |
| `teamId` | integer \| string | no |  |  |
| `team` | object | no |  |  |
| `playerStatus` | string | no |  |  |
| `points` | integer | no |  |  |
| `averagePoints` | number \| integer | no |  |  |
| `weekPoints` | any | no |  |  |
| `marketValue` | integer | no |  |  |
| `lastSeasonPoints` | integer | no |  |  |
| `images` | object | no |  |  |
| `lastStats` | array[any] | no |  |  |


### `GET` `/players/{player_id}/league/{league_id}`

Get player card contextualized to a league

**Security:** HTTP Bearer (internal JWT)

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer identifier. |
| path | `league_id` | string | yes |  | Fantasy league identifier. |

#### Outputs

**HTTP 200:** `LeaguePlayer`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerTeamId` | string | no |  |  |
| `buyoutClause` | integer | no |  |  |
| `buyoutClauseLockedEndTime` | string | no |  |  |
| `isShielded` | boolean | no |  |  |
| `managerId` | integer \| string | no |  |  |
| `manager` | object | no |  |  |
| `playerMarket` | object | no |  |  |
| `playerMaster` | object | no |  |  |

Full nested fields: [`LeaguePlayer`](#leagueplayer).


### `GET` `/players/{player_id}/market-value`

Get player market-value history

**Security:** none

#### Inputs

| Source | Name | Type | Required | Constraints | Description |
|--------|------|------|----------|-------------|-------------|
| path | `player_id` | string | yes |  | Master footballer identifier. |

#### Outputs

**HTTP 200:** array of `PlayerMarketValue`

Each item:

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `date` | string | no |  |  |
| `marketValue` | integer | no |  |  |


## Component schemas

Nested models referenced by the operations above. All Fantasy proxy models use `extra: allow` in Pydantic — additional upstream fields may appear at runtime without being listed here.

### `AcceptOfferWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `offerMoney` | integer | yes | >0 |  |

### `ActivityItem`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `activityTypeId` | integer | no |  |  |
| `amount` | integer | no |  |  |
| `createdAt` | string | no |  |  |
| `playerMasterId` | integer | no |  |  |
| `user1Id` | integer | no |  |  |
| `user2Id` | integer | no |  |  |
| `weekNumber` | integer | no |  |  |
| `msg` | string | no |  |  |
| `message` | string | no |  |  |
| `description` | string | no |  |  |

### `BidWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `money` | integer | yes | >0 |  |

### `BuyoutMutationResult`

Type: `object`

### `CatalogPlayer`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `nickname` | string | no |  |  |
| `name` | string | no |  |  |
| `slug` | string | no |  |  |
| `positionId` | integer | no |  |  |
| `teamId` | integer \| string | no |  |  |
| `team` | object | no |  |  |
| `playerStatus` | string | no |  |  |
| `points` | integer | no |  |  |
| `averagePoints` | number \| integer | no |  |  |
| `weekPoints` | any | no |  |  |
| `marketValue` | integer | no |  |  |
| `lastSeasonPoints` | integer | no |  |  |
| `images` | object | no |  |  |
| `lastStats` | array[any] | no |  |  |

### `ClubTeam`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `name` | string | no |  |  |
| `slug` | string | no |  |  |
| `assets` | string | no |  |  |
| `badgeColor` | string | no |  |  |
| `badgeWhite` | string | no |  |  |

### `Competition`

Type: `string`

### `CurrentWeek`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `isLive` | boolean | no |  |  |
| `nextWeek` | integer | no |  |  |
| `previousWeek` | integer | no |  |  |
| `weekNumber` | integer | no |  |  |
| `openingWeekDate` | string | no |  |  |
| `closingWeekDate` | string | no |  |  |

### `DirectOfferWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerId` | string \| integer | yes |  |  |
| `money` | integer | yes | >0 |  |

### `ErrorResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `error` | string | yes |  |  |
| `detail` | string | yes |  |  |

### `FantasyLeague`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `access` | string | no |  |  |
| `type` | LeagueType | no |  | Fantasy league type metadata. |
| `managersNumber` | integer | no |  |  |
| `name` | string | no |  |  |
| `config` | LeagueConfig | no |  | League configuration. |
| `isDuplicated` | boolean | no |  |  |
| `isSecondRound` | boolean | no |  |  |
| `description` | string | no |  |  |
| `premium` | boolean | no |  |  |
| `team` | LeagueTeamSummary | no |  | Caller's team summary embedded in a league object. |

### `Fixture`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `matchDate` | string | no |  |  |
| `date` | string | no |  |  |
| `time` | string | no |  |  |
| `localId` | integer | no |  |  |
| `visitorId` | integer | no |  |  |
| `matchState` | integer | no |  |  |
| `localScore` | integer | no |  |  |
| `visitorScore` | integer | no |  |  |
| `featured` | boolean | no |  |  |

### `FixtureRef`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `date` | string | no |  |  |
| `competition` | Competition | yes |  |  |
| `competition_label` | string | no |  |  |
| `matchweek` | integer | no |  |  |
| `home_team` | string | no |  |  |
| `away_team` | string | no |  |  |
| `is_home` | boolean | no |  |  |
| `opponent` | string | no |  |  |
| `home_score` | integer | no |  |  |
| `away_score` | integer | no |  |  |
| `result` | MatchResult | no |  |  |

### `FixtureStats`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `minutes_played` | StatValue | no |  |  |
| `goals` | StatValue | no |  |  |
| `assists` | StatValue | no |  |  |
| `big_chances_created` | StatValue | no |  |  |
| `balls_into_box` | StatValue | no |  |  |
| `penalties_committed` | StatValue | no |  |  |
| `penalties_saved` | StatValue | no |  |  |
| `saves` | StatValue | no |  |  |
| `clearances` | StatValue | no |  |  |
| `penalties_missed` | StatValue | no |  |  |
| `own_goals` | StatValue | no |  |  |
| `goals_conceded` | StatValue | no |  |  |
| `yellow_cards` | StatValue | no |  |  |
| `red_card` | StatValue | no |  |  |
| `shots` | StatValue | no |  |  |
| `successful_dribbles` | StatValue | no |  |  |
| `recoveries` | StatValue | no |  |  |
| `balls_lost` | StatValue | no |  |  |
| `dazn_points` | StatValue | no |  |  |

### `FixtureStatsRow`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `fixture` | FixtureRef | yes |  |  |
| `minutes_played` | integer | no |  |  |
| `fantasy_points_total` | integer | no |  |  |
| `stats` | FixtureStats | yes |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |

### `HealthResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `status` | string | yes |  |  |

### `Hierarchy`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `label` | string | no |  |  |
| `rank` | integer | no |  |  |

### `IdealPremiumConfig`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `reward` | integer | no |  |  |

### `ImmediateSaleWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerId` | string \| integer | yes |  |  |

### `IncreaseBuyoutWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `buyoutClause` | integer | yes | >0 |  |

### `Injury`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `active` | boolean | no |  |  |
| `diagnosis` | string | no |  |  |
| `since` | string | no |  |  |
| `expected_return` | string | no |  |  |
| `availability_text` | string | no |  |  |
| `fantasy_status` | string | no |  |  |

### `InjuryHistoryEntry`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `start` | string | no |  |  |
| `end` | string | no |  |  |
| `ongoing` | boolean | no |  |  |
| `diagnosis` | string | no |  |  |
| `duration_days` | integer | no |  |  |

### `InjuryRisk`

Type: `string`

### `InjuryRiskInfo`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `level` | InjuryRisk | yes |  |  |
| `raw` | string | no |  |  |

### `LaligaCredentialProbeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `user_id` | string | yes |  |  |
| `has_bearer` | boolean | yes |  |  |
| `expires_at` | integer | yes |  |  |

### `LeagueConfig`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `features` | LeagueFeatures | no |  | League feature flags. |
| `premiumFeatures` | PremiumFeatures | no |  | Premium feature toggles. |
| `premiumConfigurations` | PremiumConfigurations | no |  | Premium configuration block. |

### `LeagueFeatures`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `buyoutClause` | boolean | no |  |  |

### `LeaguePlayer`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerTeamId` | string | no |  |  |
| `buyoutClause` | integer | no |  |  |
| `buyoutClauseLockedEndTime` | string | no |  |  |
| `isShielded` | boolean | no |  |  |
| `managerId` | integer \| string | no |  |  |
| `manager` | object | no |  |  |
| `playerMarket` | object | no |  |  |
| `playerMaster` | object | no |  |  |

### `LeagueTeam`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `managerId` | integer | no |  |  |
| `banned` | boolean | no |  |  |
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `fixturePoints` | integer | no |  |  |
| `startingWeek` | string | no |  |  |
| `teamMoney` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `teamValue` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |
| `players` | array[SquadPlayer] | no |  |  |
| `loanedPlayers` | array[any] | no |  |  |

### `LeagueTeamSummary`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | integer \| string | no |  |  |
| `money` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `playersNumber` | integer | no |  |  |
| `teamValue` | integer | no |  |  |
| `canPunctuate` | boolean | no |  |  |
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `isAdmin` | boolean | no |  |  |

### `LeagueType`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `canBeDuplicated` | boolean | no |  |  |
| `sponsorId` | integer | no |  |  |
| `prizeInformation` | PrizeInformation | no |  | League prize copy. |

### `LeaguesProbeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `ok` | boolean | yes |  |  |
| `league_count` | integer | yes | min=0 |  |
| `league_ids` | array[any] | no |  |  |

### `LineupFormation`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `goalkeeper` | array[any] | no |  |  |
| `defender` | array[any] | no |  |  |
| `midfield` | array[any] | no |  |  |
| `striker` | array[any] | no |  |  |
| `coach` | array[any] | no |  |  |
| `captain` | string \| integer | no |  |  |
| `bench` | object | no |  |  |
| `tacticalFormation` | array[integer] | no |  |  |

### `LineupWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `goalkeeper` | string \| integer | yes |  |  |
| `defender` | array[string \| integer] | yes |  |  |
| `midfield` | array[string \| integer] | yes |  |  |
| `striker` | array[string \| integer] | yes |  |  |
| `tactical_formation` | array[integer] | yes |  |  |
| `coach` | string \| integer | no |  |  |
| `captain` | string \| integer | no |  |  |
| `bench` | object | no |  |  |

### `ListingWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerId` | string \| integer | yes |  |  |
| `salePrice` | integer | yes | >0, max=999999999 |  |

### `LoanPremiumConfig`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `duration` | integer | no |  |  |
| `maxLoans` | integer | no |  |  |
| `enableConclude` | boolean | no |  |  |
| `minPercentage` | number | no |  |  |

### `Manager`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `managerName` | string | no |  |  |
| `avatar` | string | no |  |  |

### `MarketExtreme`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `date` | string | yes |  |  |
| `value` | integer | yes |  |  |

### `MarketHistoryEntry`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |

### `MarketMutationResult`

Type: `object`

### `MarketPreset`

Type: `string`

### `MarketPresetSummary`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `preset` | MarketPreset | yes |  |  |
| `from` | string | yes |  |  |
| `to` | string | yes |  |  |
| `start_value` | integer | no |  |  |
| `end_value` | integer | no |  |  |
| `delta_abs` | integer | no |  |  |
| `delta_rel` | number | no |  |  |

### `MarketSeriesPoint`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `date` | string | yes |  |  |
| `value` | integer | yes |  |  |
| `delta_abs` | integer | no |  |  |
| `delta_rel` | number | no |  |  |
| `filled` | boolean | no |  |  |

### `MarketSnapshot`

Type: `object`

### `MarketWindow`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `preset` | MarketPreset | no |  |  |
| `from` | string | yes |  |  |
| `to` | string | yes |  |  |
| `days` | integer | yes |  |  |
| `start_value` | integer | no |  |  |
| `end_value` | integer | no |  |  |
| `delta_abs` | integer | no |  |  |
| `delta_rel` | number | no |  |  |
| `min` | MarketExtreme | no |  |  |
| `max` | MarketExtreme | no |  |  |
| `series` | array[MarketSeriesPoint] | no |  |  |

### `MatchPlayer`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | integer | no |  |  |
| `images` | object | no |  |  |
| `name` | string | no |  |  |
| `nickname` | string | no |  |  |
| `positionId` | integer | no |  |  |
| `teamId` | integer | no |  |  |
| `weekPoints` | integer | no |  |  |

### `MatchResult`

Type: `string`

### `MatchSide`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | integer | no |  |  |
| `badgeColor` | string | no |  |  |
| `mainName` | string | no |  |  |
| `players` | array[MatchPlayer] | no |  |  |

### `MatchStats`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | integer | no |  |  |
| `date` | string | no |  |  |
| `local` | MatchSide | no |  | Home or away side in matchweek stats. |
| `visitor` | MatchSide | no |  | Home or away side in matchweek stats. |
| `matchState` | integer | no |  |  |
| `localScore` | integer | no |  |  |
| `visitorScore` | integer | no |  |  |

### `MatchWeather`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `snapshot` | WeatherSnapshot | no |  |  |
| `reason` | WeatherReason | no |  |  |
| `venue` | Venue | no |  |  |

### `MaxProfitableBid`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `amount` | integer | no |  |  |
| `profitable` | boolean | no |  |  |
| `raw` | string | no |  |  |

### `MeResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `user_id` | string | yes |  |  |
| `email` | string | no |  |  |
| `name` | string | no |  |  |

### `MinutesPlayed`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `minutes` | integer | no |  |  |
| `started` | boolean | no |  |  |
| `note` | string | no |  |  |

### `NewsItem`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `title` | string | yes |  |  |
| `url` | string | no |  |  |
| `published_at` | string | no |  |  |
| `source` | string | no |  |  |

### `PayBuyoutWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `buyoutClauseToPay` | integer | yes | >0 |  |

### `PlayerFixtureStatsResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `fixtures` | array[FixtureStatsRow] | no |  |  |

### `PlayerMarket`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `salePrice` | integer | no |  |  |
| `expirationDate` | string | no |  |  |
| `numberOfOffers` | integer | no |  |  |
| `directOffer` | boolean | no |  |  |

### `PlayerMarketResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `window` | MarketWindow | yes |  |  |
| `presets` | array[MarketPresetSummary] | no |  |  |
| `current_value` | integer | no |  |  |
| `currency` | string | no |  |  |

### `PlayerMarketValue`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `date` | string | no |  |  |
| `marketValue` | integer | no |  |  |

### `PlayerMaster`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | no |  |  |
| `name` | string | no |  |  |
| `nickname` | string | no |  |  |
| `slug` | string | no |  |  |
| `points` | integer | no |  |  |
| `weekPoints` | integer | no |  |  |
| `marketValue` | integer | no |  |  |
| `positionId` | integer | no |  |  |
| `playerStatus` | string | no |  |  |
| `teamId` | integer | no |  |  |
| `lastSeasonPoints` | integer | no |  |  |
| `averagePoints` | number \| integer | no |  |  |
| `images` | object | no |  |  |
| `lastStats` | array[PlayerStatWeek] | no |  |  |
| `team` | ClubTeam | no |  | Real-world club metadata on a player. |

### `PlayerProfileResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `injury` | Injury | yes |  |  |
| `start_probability` | StartProbability | yes |  |  |
| `injury_risk` | InjuryRiskInfo | yes |  |  |
| `injury_history` | array[InjuryHistoryEntry] | no |  |  |
| `max_profitable_bid` | MaxProfitableBid | yes |  |  |
| `hierarchy` | Hierarchy | yes |  |  |
| `news` | array[NewsItem] | no |  |  |

### `PlayerRef`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | yes |  |  |
| `name` | string | no |  |  |
| `nickname` | string | no |  |  |
| `slug` | string | no |  |  |
| `team_id` | integer | no |  |  |
| `team_name` | string | no |  |  |
| `position_id` | integer | no |  |  |

### `PlayerStatWeek`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `weekNumber` | integer | no |  |  |
| `totalPoints` | integer | no |  |  |
| `isInIdealFormation` | boolean | no |  |  |
| `stats` | object | no |  |  |

### `PlayerStatsIndex`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player` | PlayerRef | yes |  |  |
| `season` | string | yes |  |  |
| `segments` | array[SegmentDescriptor] | no |  |  |
| `generated_at` | string | yes |  |  |

### `PlayerTeamOffers`

Type: `object`

### `PremiumConfigurations`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `loan` | LoanPremiumConfig | no |  | Loan premium configuration. |
| `ideal` | IdealPremiumConfig | no |  | Ideal lineup premium configuration. |

### `PremiumFeatures`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `formations` | boolean | no |  |  |
| `captain` | boolean | no |  |  |
| `bench` | boolean | no |  |  |
| `loan` | boolean | no |  |  |
| `ideal` | boolean | no |  |  |
| `coach` | boolean | no |  |  |

### `PrizeInformation`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `title` | string | no |  |  |
| `description` | string | no |  |  |

### `RecentMatch`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `fixture` | FixtureRef | yes |  |  |
| `minutes` | MinutesPlayed | yes |  |  |
| `fantasy_points_total` | integer | no |  |  |
| `stats` | FixtureStats | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |

### `RecentMatchesResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `matches` | array[RecentMatch] | no |  |  |

### `SegmentDescriptor`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `name` | string | yes |  |  |
| `href` | string | yes |  |  |
| `auth` | string | yes |  |  |
| `sources` | array[string] | yes |  |  |
| `requires_scraper` | boolean | yes |  |  |
| `available` | boolean | yes |  |  |
| `query` | array[string] | yes |  |  |

### `SegmentWarning`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `code` | string | yes |  |  |
| `source` | string | no |  |  |
| `detail` | string | no |  |  |

### `ShieldStatus`

Type: `object`

### `ShieldWrite`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerId` | string \| integer | yes |  |  |
| `rewardedAdType` | string | yes |  |  |
| `rewardedAd` | integer | yes |  |  |

### `SourceStatus`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `name` | string | yes |  |  |
| `status` | string | no |  |  |
| `cached` | boolean | no |  |  |
| `fetched_at` | string | no |  |  |

### `SquadPlayer`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `playerTeamId` | string | no |  |  |
| `buyoutClause` | integer | no |  |  |
| `buyoutClauseLockedEndTime` | string | no |  |  |
| `isShielded` | boolean | no |  |  |
| `managerId` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |
| `playerMarket` | PlayerMarket | no |  | Market listing for a player on a team. |
| `playerMaster` | PlayerMaster | no |  | Master player card. |

### `StandingRow`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `position` | integer | no |  |  |
| `previousPosition` | integer | no |  |  |
| `points` | integer | no |  |  |
| `livePoints` | integer | no |  |  |
| `team` | StandingTeam | no |  | Team row nested under standing. |
| `teamId` | string \| integer | no |  |  |
| `name` | string | no |  |  |

### `StandingTeam`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `managerId` | integer | no |  |  |
| `banned` | boolean | no |  |  |
| `managerWarned` | boolean | no |  |  |
| `isAdmin` | boolean | no |  |  |
| `teamValue` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `teamMoney` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |

### `StartProbability`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `matchweek` | integer | no |  |  |
| `percent` | integer | no |  |  |
| `raw` | string | no |  |  |

### `StatSource`

Type: `string`

### `StatValue`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `count` | integer | no |  |  |
| `fantasy_points` | integer | no |  |  |
| `dazn_points` | integer | no |  |  |
| `source` | StatSource | no |  |  |

### `TeamDetail`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string \| integer | no |  |  |
| `managerId` | integer | no |  |  |
| `banned` | boolean | no |  |  |
| `position` | integer | no |  |  |
| `startingWeek` | string | no |  |  |
| `teamMoney` | integer | no |  |  |
| `playersNumber` | integer | no |  |  |
| `teamValue` | integer | no |  |  |
| `teamPoints` | integer | no |  |  |
| `manager` | Manager | no |  | Manager identity. |
| `players` | array[SquadPlayer] | no |  |  |
| `loanedPlayers` | array[any] | no |  |  |

### `TeamLineup`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `formation` | LineupFormation | no |  | Formation block nested under a Fantasy lineup response. |
| `teamId` | string \| integer | no |  |  |
| `weekNumber` | integer | no |  |  |

### `TeamMoney`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `teamMoney` | integer | no |  |  |
| `teamInvestment` | integer | no |  |  |

### `Travel`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `distance_km` | number | no |  |  |
| `mode` | string | no |  |  |
| `from_venue` | Venue | no |  |  |
| `to_venue` | Venue | no |  |  |
| `player_team_travels` | boolean | no |  |  |
| `reason` | string | no |  |  |

### `UpcomingMatch`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `fixture` | FixtureRef | yes |  |  |
| `kickoff` | string | no |  |  |
| `weather` | MatchWeather | yes |  |  |
| `travel` | Travel | yes |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |

### `UpcomingMatchesResponse`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `player_id` | string | yes |  |  |
| `player` | PlayerRef | no |  |  |
| `season` | string | yes |  |  |
| `generated_at` | string | yes |  |  |
| `sources` | array[SourceStatus] | no |  |  |
| `warnings` | array[SegmentWarning] | no |  |  |
| `matches` | array[UpcomingMatch] | no |  |  |

### `Venue`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `club_key` | string | yes |  |  |
| `stadium` | string | no |  |  |
| `city` | string | no |  |  |
| `lat` | number | yes |  |  |
| `lon` | number | yes |  |  |
| `country` | string | no |  |  |

### `WeatherReason`

Type: `string`

### `WeatherSnapshot`

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `temperature_c` | number | yes |  |  |
| `feels_like_c` | number | no |  |  |
| `humidity_pct` | integer | no |  |  |
| `wind_speed_ms` | number | no |  |  |
| `precipitation_probability` | number | no |  |  |
| `rain_mm` | number | no |  |  |
| `condition` | string | yes |  |  |
| `condition_code` | integer | no |  |  |
| `icon` | string | no |  |  |
| `forecast_for` | string | yes |  |  |
| `granularity` | string | no |  |  |
| `source` | string | no |  |  |
