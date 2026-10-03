# Auth service endpoints

HTTP reference for `backend/auth` (`fantasy_auth`). The browser and frontend
proxy these under `/auth` and `/laliga` on the **frontend origin** (port 3000),
not on the API port.

Machine-readable schema: [`backend/auth/openapi.json`](../../backend/auth/openapi.json).
Swagger UI when auth is running: http://localhost:8000/docs ([OpenAPI](openapi.md)).

Conceptual flows (CSRF, pairing, internal JWT): [Authentication](authentication.md).

## Caller credentials

| Credential | Used on | Purpose |
|------------|---------|---------|
| `fantasy_session` cookie | Session routes | Opaque app session |
| `fantasy_csrf` cookie + `X-CSRF-Token` | Mutations | Double-submit CSRF |
| `Authorization: Bearer <internal JWT>` | `/internal/*` | Verified `sub` for LaLiga vault |
| `X-Service-Token` | `/internal/*` | Shared secret (API → auth) |

Session cookie names come from auth settings (`cookie_name`, `csrf_cookie_name`).

## Health

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/health` | None | `{"status":"ok"}` |
| `GET` | `/health/live` | None | Same as `/health` |
| `GET` | `/health/ready` | None | `200` with `status`, `store`; `503` when Postgres/Redis checks fail |

With `USE_MEMORY_STORE=true`, ready reports `"store": "memory"`.

## Application identity (`auth` tag)

| Method | Path | Auth | Response / behaviour |
|--------|------|------|----------------------|
| `GET` | `/auth/login` | None | `302` to app IdP; sets session + CSRF cookies |
| `GET` | `/auth/callback` | Pending session cookie | Completes OIDC; HTML clients `302` to frontend or LaLiga hop; JSON clients get user + `csrf_token`; rotates cookies |
| `GET` | `/auth/me` | Session cookie | `{"user":{user_id,email,name},"csrf_token":...}` |
| `POST` | `/auth/logout` | Session + CSRF when cookie present | `{"ok":true}`; clears cookies; idempotent without session |
| `POST` | `/auth/token` | Session + CSRF | `InternalTokenResponse`: `access_token`, `token_type`, `expires_in`, `expires_at` |
| `GET` | `/.well-known/jwks.json` | None | JWKS for verifying internal JWTs (Fantasy API) |

### `GET /auth/callback` query

| Param | Required | Description |
|-------|----------|-------------|
| `code` | yes | Authorization code from IdP |
| `state` | yes | OIDC state bound to session |

### JSON session view (callback API clients, `/auth/me`)

| Field | Type | Description |
|-------|------|-------------|
| `user.user_id` | string | Application user id (`sub`) |
| `user.email` | string \| null | From IdP when available |
| `user.name` | string \| null | Display name |
| `csrf_token` | string | Value for `X-CSRF-Token` on mutations |

## LaLiga pairing and connection (`laliga` tag)

| Method | Path | Auth | Response / behaviour |
|--------|------|------|----------------------|
| `GET` | `/laliga/login` | Session cookie | `302` to B2C or frontend when already linked |
| `GET` | `/laliga/connection` | Session cookie | `ConnectionStatusResponse` (no tokens) |
| `DELETE` | `/laliga/connection` | Session + CSRF | `{"ok":true}`; removes sealed LaLiga tokens |
| `POST` | `/laliga/pairings` | Session + CSRF | `PairingCreateResponse` for CLI helper |
| `POST` | `/laliga/pairings/complete-redirect` | Rate limit by IP | Native `authredirect://` callback; `{"ok":true,"frontend_origin":...}` |
| `POST` | `/laliga/pairings/{pairing_id}/complete` | Pairing secret in body | CLI completion; manager profile fields, no tokens |

### `ConnectionStatusResponse`

| Field | Type | Description |
|-------|------|-------------|
| `linked` | boolean | LaLiga account sealed for this app user |
| `needs_reauth` | boolean | Refresh failed or connection invalid |
| `manager_id` | string \| null | Fantasy manager id when linked |
| `manager_name` | string \| null | Display name |
| `avatar` | string \| null | Avatar URL when present |

### `POST /laliga/pairings/complete-redirect` body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `callback` | string | yes | Full native callback URL (includes `state`, `code`) |

### `POST /laliga/pairings/{pairing_id}/complete` body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret` | string | yes | One-time pairing secret |
| `token_response` | object | yes | Raw B2C token JSON from the helper |

### `PairingCreateResponse`

| Field | Type | Description |
|-------|------|-------------|
| `pairing_id` | string | Public pairing id |
| `secret` | string | Shown once to the helper |
| `expires_at` | integer | Unix expiry |
| `nonce` | string | Expected id_token nonce |

## Private API credentials (`internal` tag)

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/internal/laliga/bearer` | Bearer internal JWT + `X-Service-Token` | `LaligaBearerResponse` |

### `LaligaBearerResponse`

| Field | Type | Description |
|-------|------|-------------|
| `bearer_token` | string | Short-lived LaLiga access token |
| `token_type` | string | `"Bearer"` |
| `expires_at` | integer | Unix expiry |

User id is taken **only** from the verified JWT `sub`. Callers must not send
a separate user id. Route `/internal/*` on a private network only.

## Errors

Auth maps domain errors to JSON `{"error","detail"}` (and appropriate status).
Common cases:

| Status | When |
|--------|------|
| `401` | Missing/invalid session or internal JWT |
| `403` | CSRF, service token, or ownership failure |
| `422` | Validation |
| `503` | Startup or readiness failure |

Fantasy API clients also see `needs_reauth` when LaLiga delegation is missing;
see [Architecture](../architecture.md).

## Related

- [Developing authenticated endpoints](developing-authenticated-endpoints.md)
- [Fantasy API routes](../api/README.md) — consumes internal JWT + private bearer
- [`backend/auth/README.md`](../../backend/auth/README.md) — local run and CLIs
