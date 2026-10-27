# LaLiga delegation and vault

Python/FastAPI on port 8000. Application login, passwords, sessions and JWT
issuance live in [identity](../identity/README.md). This service verifies identity
JWTs and owns LaLiga pairing, manager confirmation, AES-GCM sealed credentials,
refresh singleflight and the private bearer exchange. It never imports the API.

Copy `.env.example` to `.env`, set `AUTH_JWKS_URL`, issuer, audience, service token
and vault key. Production requires Postgres and Redis with `USE_MEMORY_STORE=false`.
Keep the existing vault key when upgrading. SQL migrations are additive; the old
session tables are inert rollback data and are never read by active code.

```bash
uv sync --group dev
uv run uvicorn fantasy_auth.main:app --port 8000
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=90
```

The browser and native helper use the shared frontend origin at port 3000.
`fantasy-browser-session --exports` opens the application sign-in screen for
interactive credential or social login and exports only `INTERNAL_JWT` on explicit
request. It never enters social-provider passwords. Use `--jwt` for headless reads.
`--no-pair standings-analysis --json` exercises application-only access; a
LaLiga-backed read can prompt for interactive pairing when needed. The
`authenticate-laliga` entry point uses this same flow. `pair-laliga --jwt ...`
retains the independent PKCE helper. Old session/CSRF and provider-password flags
are no longer supported.
Run `./scripts/authenticate-laliga.sh` from the repository root to install the
matching Playwright Chromium, sign in to the application, and pair LaLiga when
the vault is unlinked. With explicit arguments, the wrapper passes them through;
use `--pair-only` to request pairing without an API analysis.
The local frontend must be running at `http://localhost:3000` for interactive
application sign-in.

LaLiga linking is separate from application login. `POST /laliga/login` is available
only after LaLiga registers the exact HTTPS `/laliga/callback` URL for this client
and `LALIGA_BROWSER_REDIRECT_URI` is configured with the matching `FRONTEND_ORIGIN`.
Without it, the browser receives `browser_unavailable`; the native CLI pairing
helper remains available. Browser callbacks require one-time state/nonce/PKCE proof
and no browser cookie. All owner-scoped browser
routes require a verified Bearer token. `/internal/*` additionally requires
`X-Service-Token` and private networking. No live financial actions should be used
for authentication validation.

See [authentication](../../docs/authentication/authentication.md),
[endpoints](../../docs/authentication/endpoints.md),
[cutover](../../docs/authentication/better-auth-cutover.md), and
[OpenAPI](openapi.json).
