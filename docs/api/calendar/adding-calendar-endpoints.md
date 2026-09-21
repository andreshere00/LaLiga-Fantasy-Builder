# Adding calendar endpoints

Use this guide when extending the Fantasy Builder API's calendar feature.
General internal JWT rules live in
[Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md).
OpenAPI/Swagger sync is described in [OpenAPI](../openapi.md).

Calendar follows a controller–service–repository layout in `backend/api`:

```text
api/calendar.py              # FastAPI controller
services/calendar.py         # repository orchestration (no bearer fetch)
repositories/calendar.py     # Fantasy path construction
clients/laliga_fantasy.py    # get_public_json for unauthenticated reads
schemas/calendar.py          # Pydantic / OpenAPI response models
```

Unlike leagues and teams, calendar upstream reads are **public**: Fantasy returns
`200` without a LaLiga bearer. Our routes still require an internal JWT; only
the upstream call omits `Authorization`.

## Checklist

1. **Pick the upstream path** under `{CMP}/week/...`, `{CMP}/calendar`, or
   `{ORIGIN}/stats/v1/competition/{id}/...`.
2. **Add a repository method** in
   `fantasy_api.repositories.calendar.CalendarRepository` that builds the path
   with `competition_path` / `stats_week_path` and calls
   `LaligaFantasyClient.get_public_json`.
3. **Add a service method** in `fantasy_api.services.calendar.CalendarService`
   that delegates to the repository (no `AuthCredentialsClient`).
4. **Add or extend a Pydantic response model** in
   `fantasy_api.schemas.calendar` (prefer `FlexibleModel` /
   `extra="allow"` for upstream fields).
5. **Add a controller route** in `fantasy_api.api.calendar`:
   - call `get_current_user(authorization)` (JWT gate only);
   - set `response_model=...`, `responses=ERROR_RESPONSES`, and parameter
     descriptions so Swagger stays accurate.
6. **Container wiring** — `AppContainer.calendar_service` is built in
   `build_container`. Reuse the shared `LaligaFantasyClient`.
7. **Router registration** — keep new calendar routes on `calendar.router`
   included from `create_app()`.
8. **Tests** — add cases in `backend/api/tests/test_calendar.py` using
   `httpx.MockTransport` on the Fantasy client. Cover:
   - happy path URL, query params, and headers (`Accept`, `x-lang`, no
     `Authorization`);
   - auth credentials client never invoked;
   - missing/invalid JWT;
   - Fantasy non-2xx mapped to `UpstreamError`;
   - unexpected payload shapes → `502`.
9. **OpenAPI** — regenerate the committed schema:

```bash
uv run poe generate-openapi
# or: cd backend/api && uv run generate-openapi
```

10. **Endpoint schemas** — regenerate [endpoint-schemas.md](../endpoint-schemas.md):

```bash
uv run poe generate-endpoint-schemas
# or: cd backend/api && uv run generate-endpoint-schemas
```

## Security invariants

- Require an internal JWT on every calendar route (browser/BFF identity).
- Never call `/internal/laliga/bearer` for public Fantasy reads.
- Never return LaLiga tokens to clients.
- Sanitize Fantasy failures via `UpstreamError` (no upstream body leak).
