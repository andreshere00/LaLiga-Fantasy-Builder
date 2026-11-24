# Automatic market rules

A user arms a rule once; a private worker then sells or buys for them when a market-value
threshold is met. **Arming a rule in its confirmation dialog is the explicit confirmation**
for the one write that rule names. Rules fire once and then disarm.

This page documents the stored rules, the HTTP contract and how a pass evaluates and
executes them. The worker process that schedules passes is documented with the deployment.

## Rules

| Field | Meaning |
| --- | --- |
| `side` | `sell` your squad entry, or `buy` a player |
| `target` | `market` (sell, or bid on a listing) or `clause` (pay a rival's release clause) |
| `playerId` / `playerTeamId` | Master player id / squad-entry id. `playerTeamId` is required to sell and to pay a clause |
| `triggerKind` | `relative` (`triggerPercent`), `absolute` (`triggerAmount`, whole euros) or `none` (sell only: list the player and never accept an offer; needs `priceMode: market_value` and no trigger fields) |
| `listNow` | Sell only. List on the next pass without waiting for the threshold, then sell to an offer that reaches it. Implied by `triggerKind: none` |
| `priceMode` | `threshold` or `market_value`: the amount used to list, accept offers or bid. Not allowed for a clause, which always costs its clause price |
| `bidAmount` | Optional bid override for a market buy; never above `maxSpend` |
| `maxSpend` | Required for buys; the most the rule may ever spend |
| `expiresAt` | Optional deadline with a timezone; must be in the future |

A relative trigger is a percentage of the market value **when the rule was armed**
(`baselineValue`). Sells wait for a rise (0.1–500%), buys for a drop (0.1–99%), with at most
two decimals. The derived `thresholdAmount` is the value the rule waits for: relative sells
round up and relative buys round down, so a rule never fires short of the confirmed
percentage. Absolute triggers use the amount as given (1–999,999,999).

## API

All routes require an application Bearer JWT and use app-owned PostgreSQL. The owner is the
verified JWT `sub`; a caller `user_id` is never accepted. Write bodies use `extra="forbid"`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/auto-market/leagues/{league_id}/rules` | Rules newest first with derived threshold, latest attempt and worker status |
| POST | `/auto-market/leagues/{league_id}/rules` | Arm a rule (201). Verifies league membership and the player, snapshots the baseline and creates the write delegation |
| PUT | `/auto-market/leagues/{league_id}/rules/{rule_id}` | Replace an `armed` rule and re-baseline it. Listed, running or finished rules return 404 |
| DELETE | `/auto-market/leagues/{league_id}/rules/{rule_id}` | Cancel an `armed` or `listed` rule; revokes the delegation when it was the last live rule |
| GET | `/auto-market/leagues/{league_id}/executions?limit=50` | Newest attempted market writes |
| DELETE | `/auto-market/account` | Erase rules and history, revoke every write delegation |

Errors: 401 missing JWT or `needs_reauth`; 404 unknown league, player outside your squad
(sell), player already yours (buy), mismatched squad entry, or no live rule; 409 `rule_exists`
(one live rule per player and side); 422 invalid or incoherent body, or a past `expiresAt`;
502 unexpected upstream shape. Upstream bodies and LaLiga tokens are never returned.

Rule states: `armed`, `listed`, `executing`, `executed`, `failed`, `cancelled`, `expired`.

## Storage and delegation

Migration `0002_auto_market.sql` adds `auto_market_leagues`, `auto_market_rules` and
`auto_market_executions` to the application database. `AUTO_MARKET_DATABASE_URL` selects it
and defaults to `SCOUTING_DATABASE_URL`. A partial unique index allows one live rule per
owner, league, player and side.

Background writes use an **explicit opaque write grant**, never a persisted browser JWT:

1. `POST .../rules` creates it through Auth `PUT /internal/auto-market/leagues/{league_id}/grant`
   with the caller's JWT and `INTERNAL_SERVICE_TOKEN`. It expires after 30 days and is renewed
   each time a rule is armed.
2. The worker redeems it with `POST /internal/auto-market/leagues/{league_id}/bearer` and the
   separate `AUTO_MARKET_SERVICE_TOKEN`. A scouting read grant cannot redeem a write bearer.
3. Cancelling the last live rule, deleting the account, unlinking or re-pairing LaLiga revokes
   it. See [Auth](../../../backend/auth/README.md#auto-market-write-delegation).

Arm-time ownership checks are best effort when upstream omits the manager; the worker
rechecks ownership and availability immediately before every write.

## Evaluation and execution

`AutoMarketExecutor.evaluate(owner, league)` runs one bounded pass for a due league. It
redeems the write grant, resolves membership, then walks the live rules, reading the market,
the player card, the own roster, offers and the shield at most once each per pass. A 401
triggers one forced bearer refresh; a second 401 pauses the league as `needs_reauth`. A
failed read of one rule never blocks the others and marks the league `degraded`.

A write that hits 429 hands its claim back and backs the league off. Any other write failure,
or an unexpected error after the claim, fails the rule once and is never retried. A rejected
worker service token is a `502` deployment fault and degrades the league; it never reads as
`needs_reauth`. Re-saving an armed rule (`PUT`) renews the grant and resumes a league paused
as `needs_reauth` or `not_member`. Cancelling a rule never depends on revoking the grant.

The market value is read from the player's league card. Values change roughly daily, so a
league is read every five minutes, every minute while a sell is `listed`, and earlier when a
clause unlocks sooner than that.

| Rule | Fires when | Does |
| --- | --- | --- |
| Sell, `armed` | Value ≥ threshold (or at once with `listNow`) and the squad entry is still yours | Lists at `max(value, threshold)` (`threshold`) or at the value (`market_value`) |
| Sell, list only | The squad entry is still yours | Lists at the value and closes the rule as `executed`; an existing listing closes it as `executed` with reason `already_listed` |
| Sell, `listed` | A `pending` offer ≥ the stored accept floor exists | Accepts the highest such offer at its own amount |
| Buy, market | Value ≤ threshold, a non-direct-offer listing is open and you have no bid on it | Bids the value (`market_value`), or `max(value, bidAmount or threshold)` (`threshold`) |
| Buy, clause | Value ≤ threshold, clause unlocked, shield confirmed inactive, clauses enabled | Pays the current clause price |

The accept floor is stored when the player is listed: the confirmed threshold in `threshold`
mode, the value at that moment in `market_value` mode. A listing whose player left the squad
closes the rule as `executed`; one that is no longer on the market after ten minutes is listed
again at the current value, and the rule stays `listed`. A `listNow` rule for a player that is already on the market adopts that listing
and keeps selling to offers at the floor. Offers whose `status` is not exactly `pending` are never accepted.

A buy is skipped, and the rule stays `armed`, when the amount exceeds `maxSpend`, the bidding
limit (cash plus 20% of squad value), cash for a clause, or the 24-player squad cap (players
plus active bids for a bid). Each skip reason is recorded once in the attempt history. A rule
fails permanently, with a reason, when the player left your squad (sell) or already joined it
or changed owner (buy).

### At-most-once writes

Every write is preceded by a version-guarded claim (`armed`/`listed` to `executing`, committed
before the request). Concurrent passes lose the claim and never write. Writes are never
retried. A definite `401` releases the claim; any other failure, or a crash after the claim,
leaves the rule `failed` (`interrupted` after ten minutes) so you can check the market by
hand. `AutoMarketWriter` exposes exactly four writes: list, accept an offer, bid, pay a
clause. It cannot activate shields or increase clauses.

## Worker and deployment

`fantasy-auto-market-worker` runs from the API image as the `auto-market-worker` Compose
service, separately from HTTP requests. Every 30 seconds it reads due leagues (at most 100)
and evaluates at most two concurrently; errors are logged without provider detail. It needs
`SCOUTING_DATABASE_URL` (or `AUTO_MARKET_DATABASE_URL`), `AUTH_INTERNAL_BASE_URL` and
`AUTO_MARKET_SERVICE_TOKEN`, and refuses to start without the token. Only Auth and the worker
hold that token; the HTTP API does not. The token must differ from `INTERNAL_SERVICE_TOKEN`
and `SCOUTING_SERVICE_TOKEN`; Auth refuses to start in production otherwise.

When the last live rule of a league ends by itself (executed, failed, expired), the worker
stops reading that league and forgets the grant id. The Auth grant itself can only be revoked
with your JWT, so it lapses after 30 days unless you cancel the rule, delete the account,
unlink LaLiga or arm another rule. See the
[upgrade steps](../../../infra/gcp/README.md#upgrading-an-existing-installation-for-automatic-market-rules).
