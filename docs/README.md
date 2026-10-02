# LaLiga Fantasy Builder documentation

One map of the running system: [Architecture](architecture.md).
Identity and tokens: [Authentication](authentication/authentication.md).
How to run it: [root README](../README.md).

## Index

- [Architecture](architecture.md) — services, login return path, CRS, trust
  boundaries, errors
- [Frontend](frontend.md) — routes, lineup and market screens (with
  [screenshots](frontend.md#screenshots)), API usage
- [Authentication](authentication/authentication.md) — session, internal JWT,
  LaLiga vault, CSRF
- [Auth endpoints](authentication/endpoints.md) — auth service HTTP reference
- [Auth OpenAPI](authentication/openapi.md) — Swagger and `backend/auth/openapi.json`
- [Developing authenticated endpoints](authentication/developing-authenticated-endpoints.md)
  — auth vs API, CSRF, internal JWT
- [API overview](api/README.md)
- [Adding endpoints](api/adding-endpoints.md)
- [OpenAPI / Swagger](api/openapi.md)
- [Endpoint schemas](api/endpoint-schemas.md) — generated; do not edit by hand
- [Leagues](api/leagues/README.md) · [Teams](api/teams/README.md) ·
  [Players](api/players/README.md) · [Calendar](api/calendar/README.md) ·
  [Market](api/market/README.md) · [Buyout](api/buyout/README.md)
- [Proxy endpoint pitfalls](api/proxy-endpoint-pitfalls.md)

Agent instructions: [`AGENTS.md`](../AGENTS.md).

`backend/auth` owns login, sessions, the LaLiga vault, and internal JWTs.
`backend/api` owns Fantasy features and accepts only those JWTs.
`frontend` is the lineup and market UI and does not hold LaLiga tokens.
