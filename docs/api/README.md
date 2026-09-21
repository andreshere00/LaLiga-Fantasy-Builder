# Fantasy Builder API documentation

Application API docs for `backend/api` (`fantasy_api`).

- [Adding endpoints](adding-endpoints.md) — availability/auth, CRS, CLI
- [OpenAPI / Swagger](openapi.md)
- [Endpoint schemas](endpoint-schemas.md) — generated input/output reference
  for every API route
- [Leagues](leagues/README.md) · [Teams](teams/README.md) ·
  [Players](players/README.md) · [Calendar](calendar/README.md)
- [Proxy endpoint pitfalls](proxy-endpoint-pitfalls.md)

Auth: [Authentication](../authentication/authentication.md),
[Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md).

| Resource | URL / path |
|----------|------------|
| Swagger UI | http://localhost:8001/docs |
| ReDoc | http://localhost:8001/redoc |
| Live OpenAPI | http://localhost:8001/openapi.json |
| Committed schema | [`backend/api/openapi.json`](../../backend/api/openapi.json) |
| Service README | [`backend/api/README.md`](../../backend/api/README.md) |

Leagues, teams, players, and calendar share `repositories/paths.py` and payload
helpers where applicable. Players catalog and market value are public upstream;
calendar matchday reads are public upstream but still require an internal JWT
at the API boundary. League, team, and player league-card routes exchange a
LaLiga bearer.

Callers mint an internal JWT via `POST /auth/token`, then send
`Authorization: Bearer <jwt>`. Authenticated local login:
`uv run fantasy-browser-session` from `backend/auth`.
