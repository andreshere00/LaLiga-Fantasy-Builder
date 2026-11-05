# Favorites and scouting

Favorites belong to the verified application JWT `sub`, globally across leagues.
Alerts are configured independently for each player/league. Saving in the UI enables
market and clause alerts only in the selected league; importing old device favorites
leaves alerts off. The UI explicitly reports a saved favorite whose alert activation fails.
Notes, priorities, target prices, push and email are outside this feature.

## API

All routes require an application Bearer JWT. They use app-owned PostgreSQL;
none executes a Fantasy mutation. Request/response properties use camelCase.
Master `playerId` identifies favorites; `playerTeamId` is only observed clause context.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/scouting/favorites?league_id=…` | Global favorites newest first; optional league observations, preferences and monitoring health |
| PUT | `/scouting/favorites/{player_id}` | Idempotently save a favorite; no alert side effect |
| DELETE | `/scouting/favorites/{player_id}` | Remove favorite and every league watch; retain alert history |
| POST | `/scouting/favorites/import` | Union `playerIds` (max 1,000 per import); never overwrite settings |
| PUT | `/scouting/leagues/{league_id}/watches/{player_id}` | Replace `marketAlert`, `clauseAlert`, `leadHours` (1, 6, 24; default 24); enabling requires current membership |
| POST | `/scouting/leagues/{league_id}/refresh` | Revalidate membership and resume enabled watches; respect polling budget |
| GET | `/scouting/notifications?league_id=…&cursor=…&limit=50` | Newest first, optional league filter, total unread across leagues, next cursor |
| PUT | `/scouting/notifications/{notification_id}/read` | Idempotently mark an owned alert read; foreign/absent ID → 404 |
| DELETE | `/scouting/account` | Delete owned favorites, watches, observations and alerts, revoke grants |

Membership is established from the authenticated league list and its caller `team.id`;
that response can legitimately omit `team.manager`. Monitoring resolves the caller's
manager from the own-team roster when needed, or uses the complete owned-player
identities to exclude own listings. Incomplete roster identity fails closed.

Favorites persist independently of a LaLiga connection. Failed or incomplete Fantasy
reads preserve prior observations. `inactive`, `active`, `degraded`, `needs_reauth` and
`not_member` distinguish monitoring states; each observation includes its check time.
Opening the inbox does not mark alerts read. Opening an alert or its explicit read
button marks only that alert. The browser refreshes every 60 seconds while visible
and on focus, and shows a toast once for a newly received event.

## Background monitoring and credential delegation

`fantasy-scouting-worker` runs from the API image, separately from HTTP requests.
It checks due work every minute, normally reading each user/league every five minutes,
and schedules earlier checks at the chosen advance-warning and unlock thresholds.
The worker processes at most two leagues concurrently. A PostgreSQL owner advisory
lock serializes competing processes and UI mutations; observations and uniquely keyed
notifications commit in the same transaction. A first observation establishes the
baseline without announcing existing listings or already available clauses. An upcoming
known unlock already inside the warning window can generate one advance warning.

Market alerts include official LaLiga and rival-manager listings, excluding direct offers
and the user's own sales. Listing identities distinguish relistings. Clause warnings
require enabled league rules, a positive price, a rival owner, a known future unlock and
a confirmed inactive shield. Availability additionally requires the lock to have elapsed
and a fresh confirmed inactive shield. Ownership, squad-entry and unlock changes define
a new protection cycle. Unknown shield expiry remains unknown; passing time cannot
prove a shield ended. Transitions entirely between polls can be missed.

The API reuses the documented leagues, market, league-player and shield GET repositories
and their upstream confidence/validation rules. Missing market arrays or listing identity
fail closed. Per-player failures preserve that player's last observation. Transient errors
retry with bounded backoff; a Fantasy 401 permits one forced refresh through Auth
per pass, with no unbounded retry; revoked credentials and lost membership pause monitoring.
The user can reconnect LaLiga and refresh to revalidate and resume saved preferences.

Background access uses an **explicit opaque grant**, never a persisted browser JWT:

1. API verifies membership with the caller's application JWT and ordinary bearer exchange.
2. `PUT /internal/scouting/leagues/{league_id}/grant` requires verified JWT + ordinary
   `INTERNAL_SERVICE_TOKEN`. Auth binds a random grant to its resolved subject, league
   and current connection. No caller-supplied owner is accepted.
3. API stores only the opaque grant ID. `POST /internal/scouting/leagues/{league_id}/bearer`
   requires that grant plus the separate `SCOUTING_SERVICE_TOKEN`. Auth resolves ownership
   from storage, obtains a short-lived bearer and rechecks revocation before returning it.
4. Deleting the last watch revokes the league grant through JWT + ordinary service token.
   Unlinking, re-pairing (even the same manager), connection identity changes and account
   deletion revoke delegations. Ordinary `/internal/laliga/bearer` still requires JWT +
   service token. The worker only uses read repositories, with bearers held transiently.

All internal routes remain private-network-only. Auth owns grant mappings and encrypted
credentials; the API owns application records. No refresh tokens or grants reach browser
responses. The delegation credential is distinct from the normal API service credential.

## Storage and operation

Provision `fantasy_app` owned by the non-superuser `fantasy_api`, separately from
`fantasy_auth` and `fantasy_identity`. Set `SCOUTING_DATABASE_URL` in the API and worker,
and matching `SCOUTING_SERVICE_TOKEN` in Auth/API/worker. Auth must use its persistent
store for monitoring that survives restarts. `SCOUTING_API_URL` in Identity points at
the API origin for account deletion. Compose wires these services and the separate worker.

Ordered application migrations live inside the API package and apply under a database
lock at startup. Auth migration `0006_scouting_grants.sql` creates persistent grants.
There is no production in-memory fallback. API readiness checks configured app storage.
The worker logs aggregate due work, lag, last successful check and paused league count,
and is restarted by Compose after process failures. It has no HTTP port.

Fresh Compose PostgreSQL clusters provision the new role/database automatically.
**Existing volumes need an explicit provision before starting the new API:** run these
statements as the cluster administrator, passing `app_password` via a private psql
variable rather than putting a production password in shell history:

```sql
CREATE ROLE fantasy_api LOGIN PASSWORD :'app_password';
CREATE DATABASE fantasy_app OWNER fantasy_api;
REVOKE ALL ON DATABASE fantasy_app FROM PUBLIC;
GRANT CONNECT ON DATABASE fantasy_app TO fantasy_api;
```

Populate `APP_DB_PASSWORD` and `SCOUTING_SERVICE_TOKEN` in the private runtime secret
before releasing the new Compose configuration. Keep app/worker credentials synchronized.
Deploy provision/migrations, Auth/API/worker and then the frontend. Confirm readiness,
last-success logs and a synthetic event before considering monitoring operational.
The backup job dumps all three databases before uploading any, then writes its completion
manifest. Restore `fantasy_app.dump` with the role/database above, alongside the Auth and
Identity dumps; pause the worker during restore to avoid processing a partial recovery.

Host development: `poe dev` / `poe dev-clean` upgrades older local `.env` files
with a shared random scouting token and provisions the default Compose app database
without replacing existing passwords or data. Start PostgreSQL first. Custom database
URLs are preserved and must be provisioned separately. For a standalone worker,
configure the service `.env` files and run
`uv run fantasy-scouting-worker` from `backend/api` (also started by `scripts/dev-local.sh`).
A missing worker means favorites still save but monitoring cannot progress; the UI shows
last checked/pending state rather than claiming immediate delivery.

## Read-only CLI and validation

```bash
uv run --directory backend/api fantasy-scouting --league-id LEAGUE
uv run --directory backend/auth fantasy-browser-session scouting-analysis --league-id LEAGUE --json
```

The second command signs in through the existing browser helper; application-only scouting
reads do not require pairing and do not mark alerts read. Neither CLI can bid or pay clauses.

PostgreSQL integration tests create isolated temporary schemas. Set
`SCOUTING_TEST_DATABASE_URL` for API and `AUTH_TEST_DATABASE_URL` for Auth to a disposable
PostgreSQL database. CI uses its PostgreSQL service. Tests cover ownership, import,
watch preferences, baseline/lead times, failure preservation, concurrent event deduplication,
grant revocation and reconnection. `frontend/e2e/scouting.spec.ts` exercises both toolbar
entries, keyboard focus, mobile/themes, detail return, partial activation and inbox reads.
