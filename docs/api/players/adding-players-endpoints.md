# Adding players endpoints

Use this guide when extending the Fantasy Builder API's players feature.
General auth and LaLiga bearer rules live in
[Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md).
OpenAPI/Swagger sync is described in [OpenAPI](../openapi.md).

Players follow a controller–service–repository layout in `backend/api`:

```text
api/players.py              # FastAPI controller
services/players.py         # public repo calls + bearer fetch for league cards
repositories/players.py     # Fantasy path construction
clients/laliga_fantasy.py   # shared GET client (bearer optional)
schemas/players.py          # Pydantic / OpenAPI response models
cli/players.py              # `fantasy-players` helper CLI
```

Upstream base path:

```text
ORIGIN = https://fantasy-api.llt-services.com
API    = {ORIGIN}/api
CMP    = {API}/v1/competition/{competition_id}
```

`ORIGIN` and `competition_id` come from `LALIGA_FANTASY_ORIGIN` and
`LALIGA_COMPETITION_ID`.

## Implementation plan

| Method | Upstream | Auth | Result |
|--------|----------|------|--------|
| `GET` | `{CMP}/players` | No | Full catalog: status, market value, points |
| `GET` | `{CMP}/player/{playerId}/market-value` | No | Market-value history |
| `GET` | `{CMP}/player/{playerId}/league/{leagueId}` | Yes | Player card in a league |

Builder API paths drop the `{CMP}` prefix and keep the rest, matching leagues:

| Method | Builder path | Upstream |
|--------|--------------|----------|
| `GET` | `/players` | `{CMP}/players` |
| `GET` | `/player/{player_id}/market-value` | `{CMP}/player/{playerId}/market-value` |
| `GET` | `/player/{player_id}/league/{league_id}` | `{CMP}/player/{playerId}/league/{leagueId}` |

### Auth split

- **Public Fantasy reads** (`/players`, `/player/{id}/market-value`): do not
  validate an internal JWT and call `LaligaFantasyClient.get_json` **without**
  `Authorization`. Still send `Accept: application/json` and `x-lang: es`.
- **Private Fantasy read** (`/player/{id}/league/{leagueId}`):
  `get_current_user` → `PlayersService` → `get_laliga_bearer` → repository
  with bearer. Never return the bearer.

`playerId` is the master catalog id. It is **not** interchangeable with
`playerTeamId` (plantilla slot). `leagueId` comes from `GET /leagues`.

### CLI

`uv run fantasy-players` (`fantasy_api.cli.players`):

1. Always `GET /players` (no JWT).
2. With `--player-id`, also `GET /player/{id}/market-value`.
3. With `--player-id` and `--league-id`, exchange session cookies or use
   `--jwt` and `GET /player/{id}/league/{leagueId}`.

## Checklist

1. **Pick the upstream path** under `{CMP}/players` or `{CMP}/player/...`.
2. **Add a repository method** in
   `fantasy_api.repositories.players.PlayersRepository` that builds the path
   (percent-encode ids) and calls `LaligaFantasyClient.get_json`. Pass a
   bearer only for private resources.
3. **Add a service method** in `fantasy_api.services.players.PlayersService`.
   Public methods take no JWT. The league card method:
   - accepts `internal_jwt` (and path params);
   - calls `credentials.get_laliga_bearer(internal_jwt)`;
   - forwards only `bearer_token` to the repository;
   - never logs or returns the bearer.
4. **Add or extend a Pydantic response model** in
   `fantasy_api.schemas.players` (prefer `FlexibleModel` / `extra="allow"`).
5. **Add a controller route** in `fantasy_api.api.players`:
   - public routes: no `Authorization` header dependency;
   - private routes: `get_current_user(authorization)` then pass
     `internal_jwt` into the service;
   - set `response_model=...`, `responses=ERROR_RESPONSES`, and parameter
     descriptions so Swagger stays accurate.
6. **OpenAPI public paths** — add exact paths to `_PUBLIC_EXACT_PATHS` in
   `fantasy_api.openapi` so Swagger does not require HTTP Bearer.
7. **Container wiring** — `AppContainer.players_service` is already built in
   `build_container`. Do not re-register the client for each new method.
8. **Router registration** — keep new player routes on the existing
   `players.router` included from `create_app()`.
9. **Tests** — add cases in `backend/api/tests/test_players.py` using
   `httpx.MockTransport` for Fantasy (and auth when the route is private).
   Cover:
   - happy path URL and headers (no `Authorization` on public reads);
   - public routes never call `/internal/laliga/bearer`;
   - missing/invalid JWT on the league card;
   - `needs_reauth`;
   - Fantasy non-2xx mapped to `UpstreamError` categories;
   - bearer absent from the HTTP response body.
10. **CLI tests** — `backend/api/tests/test_cli_players.py` for catalog,
    market-value, JSON league card, and credential errors.
11. **OpenAPI** — regenerate the committed schema (also enforced by pre-commit):

```bash
uv run poe generate-openapi
# or: cd backend/api && uv run generate-openapi
```

Swagger UI at `/docs` always reflects the same generator
(`fantasy_api.openapi.build_openapi_schema`).

## MockTransport test sketch

```python
def fantasy_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/v1/competition/1/players"
    assert "Authorization" not in request.headers
    assert request.headers["x-lang"] == "es"
    return httpx.Response(200, json=[{"id": "68", "playerStatus": "ok"}])
```

Wire auth and Fantasy transports through `build_players_container` in
`test_players.py`. For public routes, use an auth handler that fails if
called.

## Observed payload notes

Unofficial 26/27 catalog (`GET {CMP}/players`) is a JSON array. Typical
fields: `id`, `nickname`, `positionId`, `playerStatus`, `marketValue`
(string), `points`, `averagePoints`, `lastSeasonPoints`, `weekPoints`
(`[{weekNumber, points}]`), `image`, `teamId`. Status values include
`ok`, `injured`, `doubtful`, `suspended`, `out_of_league`.

Market-value history is a JSON array of `{lfpId, marketValue, date, bids}`.

The league card is private; treat the body as an object and keep unknown
fields via `extra="allow"`. Do not confuse `playerId` with `playerTeamId`.

## Security invariants

- Public player reads must not fetch or send a LaLiga bearer.
- Obtain a bearer per logical **private** request; do not persist it in API
  storage.
- Never return the bearer to the browser.
- Map auth `needs_reauth` to `NeedsReauthError`.
- Sanitize Fantasy failures via `UpstreamError` (no upstream body leak).
- Fantasy `401` currently maps to `fantasy_unauthorized`. A single
  retry-after-unauthorized via auth is a follow-up; do not add unbounded
  retries in the API.
