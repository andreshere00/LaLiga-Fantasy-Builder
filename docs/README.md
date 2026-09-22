# LaLiga Fantasy Builder documentation

## Index

- [Architecture](architecture.md) — services, CRS, trust boundaries, errors
- [Authentication](authentication/authentication.md) — identities, login,
  pairing, token exchange
- [Developing authenticated endpoints](authentication/developing-authenticated-endpoints.md)
  — auth vs API, CSRF, internal JWT
- [API overview](api/README.md)
- [Adding endpoints](api/adding-endpoints.md) — documentation review, CRS,
  CLI with automated authentication
- [OpenAPI / Swagger](api/openapi.md)
- [Endpoint schemas](api/endpoint-schemas.md) — generated I/O reference for
  all API routes
- [Leagues](api/leagues/README.md) · [Teams](api/teams/README.md) ·
  [Players](api/players/README.md) · [Calendar](api/calendar/README.md) ·
  [Market](api/market/README.md) · [Buyout](api/buyout/README.md)
- [Proxy endpoint pitfalls](api/proxy-endpoint-pitfalls.md)

Agent instructions: [`AGENTS.md`](../AGENTS.md).

Committed OpenAPI: [`backend/api/openapi.json`](../backend/api/openapi.json)
(`uv run generate-openapi` in `backend/api`).

## Service ownership

`backend/auth` owns login, sessions, CSRF, LaLiga pairing, delegated
credentials, and internal JWT issuance.

`backend/api` owns application features. It accepts auth-issued internal JWTs
and requests short-lived LaLiga bearers from the private auth interface when
a route must call Fantasy.

The API must never receive the auth session cookie, vault key, LaLiga refresh
token, sealed bundle, or a caller-provided user ID used for authorization.
