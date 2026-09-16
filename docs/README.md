# LaLiga Fantasy Builder documentation

This directory describes authentication, architecture, and the application API.

## Index

### Architecture

- [Architecture](architecture.md) — service boundaries, trust boundaries,
  persistence, and request flows

### Authentication (`docs/authentication/`)

- [Authentication](authentication/authentication.md) — identities, credentials,
  login, pairing, token exchange, and security rules
- [Developing authenticated endpoints](authentication/developing-authenticated-endpoints.md)
  — patterns for protected API, auth, and LaLiga-backed endpoints

### Application API (`docs/api/`)

- [API overview](api/README.md) — Fantasy Builder API index
- [OpenAPI / Swagger](api/openapi.md) — schema generation and Swagger sync
- [Leagues](api/leagues/README.md) — league routes and identifiers
- [Adding leagues endpoints](api/leagues/adding-leagues-endpoints.md) —
  controller–service–repository checklist
- [Players](api/players/README.md) — catalog, market value, league card
- [Adding players endpoints](api/players/adding-players-endpoints.md) —
  public vs authenticated CRS checklist

Committed OpenAPI document:
[`backend/api/openapi.json`](../backend/api/openapi.json)
(regenerate with `uv run generate-openapi` in `backend/api`).

## Service ownership

`backend/auth` owns application login, browser sessions, CSRF protection,
LaLiga pairing, delegated credentials, and internal JWT issuance.

`backend/api` owns application features. It accepts auth-issued internal JWTs
and requests short-lived LaLiga bearers from the private auth interface when
an endpoint must call LaLiga Fantasy.

The API must never receive the auth session cookie, vault encryption key,
LaLiga refresh token, sealed token bundle, or a caller-provided user ID used
for authorization.
