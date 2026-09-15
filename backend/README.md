# Backend services (LaLiga Fantasy Builder)

Deployable backend services live here as **sibling packages**, each with its
own `pyproject.toml` / Docker image.

| Path | Role | Deploy |
| --- | --- | --- |
| [`auth/`](auth/) | Authentication & LaLiga pairing BFF | Separate service (port 8000) |
| [`api/`](api/) | Main Fantasy Builder API | Separate service (port 8001) |

Auth is intentionally isolated so you can scale, version, and release it
without the main application.

## Cross-service auth contract

1. Browser logs in via auth cookies (`/auth/login` → `/auth/callback`).
2. Browser exchanges the session for an internal JWT: `POST /auth/token`
   (requires CSRF + Origin).
3. Browser calls the Fantasy API with `Authorization: Bearer <internal JWT>`.
4. API verifies the JWT against auth JWKS (`GET /.well-known/jwks.json`).
5. API fetches a short-lived LaLiga bearer from auth:
   `GET /internal/laliga/bearer` with the same JWT **and** `X-Service-Token`.

**Rules:**
- Sealed LaLiga tokens and the vault key stay in auth.
- API never accepts a caller-supplied user id for authorization (`sub` only).
- `/internal/*` must stay on a private network; the service token is
  defense-in-depth, not a public credential.

Error codes to handle on the API side: `unauthorized`, `needs_reauth`.

Do **not** nest a second `.git` here unless you explicitly want a submodule;
this monorepo already supports independent deploys per folder.
