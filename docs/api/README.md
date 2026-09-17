# Fantasy Builder API documentation

Application API docs for `backend/api` (`fantasy_api`).

- [Adding endpoints](adding-endpoints.md) — availability/auth, CRS, CLI
- [OpenAPI / Swagger](openapi.md)
- [Leagues](leagues/README.md) · [Teams](teams/README.md) ·
  [Players](players/README.md)
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

Leagues, teams, and players share `repositories/paths.py`,
`services/laliga.py`, and payload helpers. Players catalog and market value
are public; the league card is authenticated.

Callers mint an internal JWT via `POST /auth/token`, then send
`Authorization: Bearer <jwt>`. Authenticated local login:
`uv run fantasy-browser-session` from `backend/auth`.
