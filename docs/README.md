# LaLiga Fantasy Builder documentation

This directory describes the authentication model and backend architecture.

- [Authentication](authentication.md) — identities, credentials, login,
  pairing, token exchange, and security rules.
- [Architecture](architecture.md) — service boundaries, trust boundaries,
  persistence, and request flows.
- [Developing authenticated endpoints](developing-authenticated-endpoints.md)
  — patterns for adding protected API, auth, and LaLiga-backed endpoints.

## Service ownership

`backend/auth` owns application login, browser sessions, CSRF protection,
LaLiga pairing, delegated credentials, and internal JWT issuance.

`backend/api` owns application features. It accepts auth-issued internal JWTs
and requests short-lived LaLiga bearers from the private auth interface when
an endpoint must call LaLiga Fantasy.

The API must never receive the auth session cookie, vault encryption key,
LaLiga refresh token, sealed token bundle, or a caller-provided user ID used
for authorization.
