# LaLiga Fantasy Builder documentation

This directory describes the authentication model and backend architecture.

- [Authentication](authentication.md) — identities, credentials, login,
  pairing, token exchange, and security rules.
- [Architecture](architecture.md) — service boundaries, trust boundaries,
  persistence, and request flows.
- [Developing authenticated endpoints](developing-authenticated-endpoints.md)
  — patterns for adding protected API, auth, and LaLiga-backed endpoints.
- [Adding leagues endpoints](adding-leagues-endpoints.md) — controller–
  service–repository checklist for Fantasy leagues routes.
- API OpenAPI/Swagger — live at `http://localhost:8001/docs`; committed
  schema at [`backend/api/openapi.json`](../backend/api/openapi.json)
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
