# Adding leagues endpoints

Use this guide when extending the Fantasy Builder API's leagues feature.
General auth and LaLiga bearer rules live in
[Developing authenticated endpoints](developing-authenticated-endpoints.md).

Leagues follow a controller–service–repository layout in `backend/api`:

```text
api/leagues.py              # FastAPI controller
services/leagues.py         # bearer fetch + repository orchestration
repositories/leagues.py     # Fantasy path construction
clients/laliga_fantasy.py   # shared authenticated GET client
schemas/leagues.py          # probe / helper models
```

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
   and calls `LaligaFantasyClient.get_json`.
3. **Add a service method** in `fantasy_api.services.leagues.LeaguesService`
   that:
   - accepts `internal_jwt` (and path params);
   - calls `credentials.get_laliga_bearer(internal_jwt)`;
   - forwards only `bearer_token` to the repository;
   - never logs or returns the bearer.
4. **Add a controller route** in `fantasy_api.api.leagues`:
   - call `get_current_user(authorization)` directly (same style as existing
     routes);
   - pass `internal_jwt` into the service;
   - return upstream JSON as a thin proxy unless a dedicated response model is
     required.
5. **Container wiring** — `AppContainer.leagues_service` is already built in
   `build_container`. Do not re-register the client for each new method.
6. **Router registration** — keep new leagues routes on the existing
   `leagues.router` included from `create_app()`.
7. **Tests** — add cases in `backend/api/tests/test_leagues.py` using
   `httpx.MockTransport` for both auth bearer and Fantasy responses. Cover:
   - happy path URL and headers;
   - missing/invalid JWT;
   - `needs_reauth`;
   - Fantasy non-2xx mapped to `UpstreamError` categories;
   - bearer absent from the HTTP response body.

## MockTransport test sketch

```python
def fantasy_handler(request: httpx.Request) -> httpx.Response:
    assert request.url.path == "/api/v1/competition/1/leagues/42/standing"
    assert request.headers["Authorization"] == "Bearer laliga-secret-token"
    assert request.headers["x-lang"] == "es"
    return httpx.Response(200, json={"ok": True})
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
