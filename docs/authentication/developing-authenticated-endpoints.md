# Developing authenticated endpoints

Where each service sits: [Architecture](../architecture.md). This page is how
to add a route without crossing the trust boundary.

- Application features belong in `backend/api` — follow
  [Adding endpoints](../api/adding-endpoints.md).
- Login, session, pairing, vault, and credentials belong in `backend/auth`.
- Encrypted LaLiga tokens stay inside auth.

## API identity (no LaLiga)

Use `get_current_user()` from `fantasy_api.api.deps`. It returns `AppUser` and
the raw internal JWT. Call it directly (do not mix with `Depends` until all
routes migrate).

Never accept `owner_id` or `user_id` from the client for authorization. Scope
repository queries to `user.user_id`. Return 404 when the scoped query finds
nothing — do not load by id and compare after leaking details.

```python
user, _jwt = await get_current_user(authorization)
team = await teams_repo.get_for_owner(team_id=team_id, owner_id=user.user_id)
```

LaLiga-backed routes forward the raw JWT into the feature service; the service
asks auth for a bearer. Auth selects the connection from verified `sub`.

Bearer rules: fetch per logical request; never return or persist it; redact it
from logs; map auth `needs_reauth` to `NeedsReauthError`. If Fantasy returns
`401`, retry once via auth `retry_after_unauthorized()` — no unbounded loops.

## Auth browser endpoint

Reads: `get_current_user(request)` in `fantasy_auth.api`. Mutations:
`require_csrf(request, x_csrf_token)` plus allowed Origin. Add `PUT`/`PATCH`
to the **auth** CORS allow-list.

Browser calls to the Fantasy API use Bearer JWT, not cookies. API writes need
the method on the **API** CORS allow-list (`create_app` in `backend/api`).

## Auth internal endpoint

Only when the API needs an operation next to auth-owned secrets. Require both:

```python
require_service_token(x_service_token)
user = await require_internal_user(authorization)
```

Do not add a client `user_id` field. Never return refresh tokens, sealed
blobs, vault keys, or OIDC secrets. Document `/internal/*` in network policy.

## Errors

Raise domain errors; handlers in `main.py` serialize them. API:
`UnauthorizedError`, `NeedsReauthError`, `UpstreamError`. Auth: `SessionError`,
`ValidationError`, `NeedsReauth`, `OwnershipError`, `ProviderError`. Never
return upstream bodies.

JWT tests for auth-critical paths: missing Bearer, malformed, expired, wrong
`iss`/`aud`, bad signature, missing `sub`.
