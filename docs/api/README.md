# Fantasy Builder API documentation

Application API docs for `backend/api` (`fantasy_api`).

- [Adding endpoints](adding-endpoints.md) — availability/auth, CRS, CLI
- [OpenAPI / Swagger](openapi.md)
- [Endpoint schemas](endpoint-schemas.md) — generated input/output reference
  for every API route
- [Leagues](leagues/README.md) · [Teams](teams/README.md) ·
  [Players](players/README.md) · [Calendar](calendar/README.md) ·
  [Market](market/README.md) · [Buyout](buyout/README.md)
- [Proxy endpoint pitfalls](proxy-endpoint-pitfalls.md)

Auth: [Authentication](../authentication/authentication.md),
[Auth endpoints](../authentication/endpoints.md),
[Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md).

| Resource | URL / path |
|----------|------------|
| Swagger UI | http://localhost:8001/docs |
| ReDoc | http://localhost:8001/redoc |
| Live OpenAPI | http://localhost:8001/openapi.json |
| Committed schema | [`backend/api/openapi.json`](../../backend/api/openapi.json) |
| Service README | [`backend/api/README.md`](../../backend/api/README.md) |

Leagues, teams, players, calendar, market, and buyout share
`repositories/paths.py` and payload helpers where applicable. Players catalog
and market value are public upstream; calendar matchday reads are public
upstream but still require an internal JWT at the API boundary. League, team,
player league-card, market, and buyout routes exchange a LaLiga bearer.
Market and buyout mutations are medium-confidence community contracts.
`fantasy-market` and `fantasy-buyout` stay read-only.

Callers send `Authorization: Bearer <jwt>` minted by `POST /auth/token`.
The browser app does this after sign-in. Market bid and buyout pay mutations
are implemented in the UI only; see [Frontend — Market](../frontend.md#market-screen).
Terminal sessions: `uv run fantasy-browser-session` from `backend/auth`.
System map: [Architecture](../architecture.md).
