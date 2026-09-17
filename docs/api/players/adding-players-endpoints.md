# Adding players endpoints

Use this guide when extending the Fantasy Builder API's players feature.
General auth and LaLiga bearer rules live in
[Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md).
OpenAPI/Swagger sync is described in [OpenAPI](../openapi.md).

Players follow a controller–service–repository layout in `backend/api`:

```text
api/players.py              # FastAPI controller (mixed public + authenticated)
services/players.py         # public direct calls + with_laliga_bearer for league card
repositories/players.py     # Fantasy path construction ({CMP}/players, {CMP}/player/...)
clients/laliga_fantasy.py   # shared GET client (optional bearer)
schemas/players.py          # Pydantic / OpenAPI models
```

Upstream base paths:

```text
{ORIGIN}/api/v1/competition/{competition_id}/players
{ORIGIN}/api/v1/competition/{competition_id}/player/{playerId}/market-value
{ORIGIN}/api/v1/competition/{competition_id}/player/{playerId}/league/{leagueId}
```

`ORIGIN` and `competition_id` come from `LALIGA_FANTASY_ORIGIN` and
`LALIGA_COMPETITION_ID`. Note the singular `player` prefix on the latter two
paths while our API stays plural (`/players/...`).

Shared glue (also used by leagues/teams):

- `fantasy_api.repositories.paths` — `segment`, `competition_path`
- `fantasy_api.services.laliga` — `with_laliga_bearer`
- `fantasy_api.schemas.payload` — `as_object`, `as_object_list`
- `fantasy_api.api.payload` — `parse_payload`, `as_model_list`

## Checklist

1. **Pick the upstream path** (`{CMP}/players`, `{CMP}/player/...`).
2. **Add a repository method** in
   `fantasy_api.repositories.players.PlayersRepository` that builds the path with
   `competition_path` and calls `LaligaFantasyClient.get_json` (omit the bearer
   for public reads).
3. **Add a service method** in `fantasy_api.services.players.PlayersService`:
   - public reads call the repository directly (no credentials hop);
   - league-contextual reads accept `internal_jwt` and call
     `with_laliga_bearer(...)`, never logging or returning the bearer.
4. **Add or extend a Pydantic model** in `fantasy_api.schemas.players` (prefer
   `FlexibleModel` / `extra="allow"` for upstream fields; keep catalog
   `weekPoints` untyped because upstream uses week objects).
5. **Add a controller route** in `fantasy_api.api.players`:
   - public routes do not call `get_current_user`;
   - league routes call `get_current_user(authorization)` directly;
   - set `response_model=...`, parameter descriptions, and error responses
     (public: 502/503 only; league card: `responses=ERROR_RESPONSES`).
6. **Container wiring** — `AppContainer.players_service` is already built in
   `build_container`. Do not re-register the client for each new method.
7. **Router registration** — keep new players routes on the existing
   `players.router` included from `create_app()`.
8. **OpenAPI security** — `_apply_bearer_security` skips Bearer on public
   players GETs; keep it on league-contextual routes and add the `players` tag.
9. **Tests** — add cases in `backend/api/tests/test_players.py` using
   `httpx.MockTransport` for Fantasy (and auth bearer only for league card).
   Cover public no-`Authorization`, wrapped `players` payloads, path encoding,
   JWT gating on the league card, `needs_reauth`, Fantasy non-2xx mapping, and
   502 on unexpected shapes. Extend `test_openapi.py` for new paths/security.
10. **CLI** — extend `fantasy-players` (`cli/players.py`) for new reads; public
    reads call `api_get` without JWT, league reads require `resolve_jwt`.
11. **OpenAPI** — regenerate the committed schema:

```bash
uv run poe generate-openapi
# or: cd backend/api && uv run generate-openapi
```

## Security invariants

- Obtain a bearer per logical request for league-contextual reads only; do not
  persist it in API storage.
- Never return the bearer to the browser.
- Map auth `needs_reauth` to `NeedsReauthError`.
- Sanitize Fantasy failures via `UpstreamError` (no upstream body leak).
- Path ids on players routes are master `playerId` values, not `playerTeamId`.

## Before you merge

Cross-feature review learnings live in
[Proxy endpoint pitfalls](../proxy-endpoint-pitfalls.md). Run its **Pre-merge
checklist** for every new LaLiga proxy, not only players.
