# Adding teams endpoints

Use this guide when extending the Fantasy Builder API's teams feature.
General auth and LaLiga bearer rules live in
[Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md).
OpenAPI/Swagger sync is described in [OpenAPI](../openapi.md).

Teams follow a controller–service–repository layout in `backend/api`:

```text
api/teams.py              # FastAPI controller
services/teams.py         # with_laliga_bearer + repository orchestration
repositories/teams.py     # Fantasy path construction ({CMP}/teams/...)
clients/laliga_fantasy.py # shared authenticated GET/PUT client
schemas/teams.py          # Pydantic / OpenAPI models
```

Upstream base path:

```text
{ORIGIN}/api/v1/competition/{competition_id}/teams/...
```

`ORIGIN` and `competition_id` come from `LALIGA_FANTASY_ORIGIN` and
`LALIGA_COMPETITION_ID`.

Shared glue (also used by leagues):

- `fantasy_api.repositories.paths` — `segment`, `competition_path`
- `fantasy_api.services.laliga` — `with_laliga_bearer`
- `fantasy_api.schemas.payload` — `as_object`, `as_object_list`
- `fantasy_api.api.payload` — `parse_payload`, `as_model_list`

## Checklist

1. **Pick the upstream path** under `{CMP}/teams/...` (for example
   `GET {CMP}/teams/{teamId}/money`).
2. **Add a repository method** in
   `fantasy_api.repositories.teams.TeamsRepository` that builds the path with
   `competition_path` and calls `LaligaFantasyClient.get_json` or `put_json`.
3. **Add a service method** in `fantasy_api.services.teams.TeamsService` that:
   - accepts `internal_jwt` (and path/body params);
   - calls `with_laliga_bearer(...)`;
   - never logs or returns the bearer.
4. **Add or extend a Pydantic model** in `fantasy_api.schemas.teams` (prefer
   `FlexibleModel` / `extra="allow"` for upstream fields).
5. **Add a controller route** in `fantasy_api.api.teams`:
   - call `get_current_user(authorization)` directly (same style as existing
     routes);
   - pass `internal_jwt` into the service;
   - set `response_model=...`, `responses=ERROR_RESPONSES`, and parameter
     descriptions so Swagger stays accurate.
6. **Container wiring** — `AppContainer.teams_service` is already built in
   `build_container`. Do not re-register the client for each new method.
7. **Router registration** — keep new teams routes on the existing
   `teams.router` included from `create_app()`.
8. **CORS** — browser writes need `PUT` on the API CORS allow-list (already
   enabled for lineup). Auth CORS is unchanged for Bearer JWT calls.
9. **Tests** — add cases in `backend/api/tests/test_teams.py` using
   `httpx.MockTransport` for both auth bearer and Fantasy responses. Cover:
   - happy path URL and headers;
   - missing/invalid JWT;
   - `needs_reauth`;
   - Fantasy non-2xx mapped to `UpstreamError` categories;
   - bearer absent from the HTTP response body;
   - for PUT: method, JSON body, `Content-Type`, empty 2xx → `{}`.
10. **OpenAPI** — regenerate the committed schema (also enforced by pre-commit):

```bash
uv run poe generate-openapi
# or: cd backend/api && uv run generate-openapi
```

11. **Endpoint schemas** — regenerate [endpoint-schemas.md](../endpoint-schemas.md):

```bash
uv run poe generate-endpoint-schemas
# or: cd backend/api && uv run generate-endpoint-schemas
```

Swagger UI at `/docs` always reflects the same generator
(`fantasy_api.openapi.build_openapi_schema`).

## Security invariants

- Obtain a bearer per logical request; do not persist it in API storage.
- Never return the bearer to the browser.
- Map auth `needs_reauth` to `NeedsReauthError`.
- Sanitize Fantasy failures via `UpstreamError` (no upstream body leak).
- Fantasy `401` currently maps to `fantasy_unauthorized`. A single
  retry-after-unauthorized via auth is a follow-up; do not add unbounded
  retries in the API.
- Lineup slot identifiers are `playerTeamId` values, not master `playerId`.
