# Adding leagues endpoints

Use this guide when extending the Fantasy Builder API's leagues feature.
General auth and LaLiga bearer rules live in
[Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md).
OpenAPI/Swagger sync is described in [OpenAPI](../openapi.md).

Leagues follow a controller–service–repository layout in `backend/api`:

```text
api/leagues.py              # FastAPI controller
services/leagues.py         # with_laliga_bearer + repository orchestration
repositories/leagues.py     # Fantasy path construction
clients/laliga_fantasy.py   # shared authenticated GET/PUT client
schemas/leagues.py          # Pydantic / OpenAPI response models
```

Shared glue (also used by teams):

- `fantasy_api.repositories.paths` — `segment`, `competition_path`
- `fantasy_api.services.laliga` — `with_laliga_bearer`
- `fantasy_api.schemas.payload` — `as_object`, `as_object_list`
- `fantasy_api.api.payload` — `parse_payload`, `as_model_list`

Upstream base path:

```text
{ORIGIN}/api/v1/competition/{competition_id}/leagues/...
```

`ORIGIN` and `competition_id` come from `LALIGA_FANTASY_ORIGIN` and
`LALIGA_COMPETITION_ID`.

## Checklist

1. **Pick the upstream path** under `{CMP}/leagues/...` (for example
   `GET {CMP}/leagues/{leagueId}/market`).
2. **Add a repository method** in
   `fantasy_api.repositories.leagues.LeaguesRepository` that builds the path
   with `competition_path` (or the repo helper) and calls
   `LaligaFantasyClient.get_json`.
3. **Add a service method** in `fantasy_api.services.leagues.LeaguesService`
   that:
   - accepts `internal_jwt` (and path params);
   - calls `with_laliga_bearer(...)`;
   - never logs or returns the bearer.
4. **Add or extend a Pydantic response model** in
   `fantasy_api.schemas.leagues` (prefer `FlexibleModel` /
   `extra="allow"` for upstream fields).
5. **Add a controller route** in `fantasy_api.api.leagues`:
   - call `get_current_user(authorization)` directly (same style as existing
     routes);
   - pass `internal_jwt` into the service;
   - set `response_model=...`, `responses=ERROR_RESPONSES`, and parameter
     descriptions so Swagger stays accurate.
6. **Container wiring** — `AppContainer.leagues_service` is already built in
   `build_container`. Do not re-register the client for each new method.
7. **Router registration** — keep new leagues routes on the existing
   `leagues.router` included from `create_app()`.
8. **Tests** — add cases in `backend/api/tests/test_leagues.py` using
   `httpx.MockTransport` for both auth bearer and Fantasy responses. Cover:
   - happy path URL and headers;
   - missing/invalid JWT;
   - `needs_reauth`;
   - Fantasy non-2xx mapped to `UpstreamError` categories;
   - bearer absent from the HTTP response body.
9. **OpenAPI** — regenerate the committed schema (also enforced by pre-commit):

```bash
uv run poe generate-openapi
# or: cd backend/api && uv run generate-openapi
```

Swagger UI at `/docs` always reflects the same generator
(`fantasy_api.openapi.build_openapi_schema`).

## MockTransport test sketch

```python
def fantasy_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/v1/competition/1/leagues/42/standing"
    assert request.headers["Authorization"] == "Bearer laliga-secret-token"
    assert request.headers["x-lang"] == "es"
    return httpx.Response(200, json=[{"position": 1, "points": 10}])
```

Wire auth and Fantasy transports through the test container helper (see
`build_leagues_container` in `test_leagues.py`).

## Connectivity probe

Before relying on a new upstream path in production flows, confirm Fantasy
reachability with:

```http
GET /laliga/leagues-probe
Authorization: Bearer <internal JWT>
```

The probe returns only `ok`, `league_count`, and `league_ids`. It never
returns the LaLiga bearer.

## Security invariants

- Obtain a bearer per logical request; do not persist it in API storage.
- Never return the bearer to the browser.
- Map auth `needs_reauth` to `NeedsReauthError`.
- Sanitize Fantasy failures via `UpstreamError` (no upstream body leak).
- Fantasy `401` currently maps to `fantasy_unauthorized`. A single
  retry-after-unauthorized via auth is a follow-up; do not add unbounded
  retries in the API.

## Before you merge

Cross-feature review learnings (unexpected upstream shape, JSON errors, OpenAPI
drift, CLI parity, write-path contracts) live in
[Proxy endpoint pitfalls](../proxy-endpoint-pitfalls.md). Run its **Pre-merge
checklist** for every new LaLiga proxy, not only leagues.
