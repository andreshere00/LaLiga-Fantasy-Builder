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

For a verified macOS cloud setup, `./scripts/connect-laliga.sh` signs in to
`https://fantasybuilder.es`, asks the user to confirm the server-verified
Fantasy Builder account, and connects LaLiga without an analysis or local
server secrets. It requires macOS, `uv`, and an interactive browser. It does
not create or load `backend/auth/.env`. To uninstall, deregister the per-user
`~/Library/Application Support/laliga-fantasy-builder/LaligaAuthredirect.app`
with macOS Launch Services (`lsregister -u`), then remove the
`laliga-fantasy-builder` support directory and the repository checkout. This
does not unlink the cloud connection; use the website account page for that.
The native provider callback and
social login methods still require a consented compatibility trial before
distribution. Do not set `LALIGA_HELPER_ENABLED=true` until that trial passes.
The macOS helper checks the current `authredirect://` default handler and
will not replace another application's handler; the existing Chromium
interception fallback may not support every provider login method.
To set up the helper, clone the repository, install `uv`, open a terminal in
the repository root, and run `./scripts/connect-laliga.sh`. The wrapper
installs the browser dependency in `backend/auth/.venv`; no GCP credentials
or application server secrets are needed on the Mac.
After successful pairing, the wrapper opens the fixed website connection page.
That page checks the signed-in website account when it regains focus and enters
the application only when that account is linked. An installed background
helper requires the distribution and handoff work in the
[production helper plan](../../docs/authentication/laliga-production-helper-rollout-plan.md).

`GET /laliga/link-options` requires an application JWT and reports enabled
browser/manual/helper methods and the verified application account. The helper flag
controls advertising only; it does not disable existing developer pairing
routes. A user can still choose **Check connection** if the automatic focus
check does not run.

`LALIGA_MANUAL_LINK_ENABLED=false` controls an independent desktop flow that
needs no local helper. The user signs in to LaLiga in a new tab, copies the
canceled native callback URL from DevTools Network and pastes it into the
original tab. Auth holds PKCE and accepts that callback only with the same
verified application owner, browser-proof cookie and frontend Origin. The
frontend confirms the connection and then navigates to the application.
See the [manual pairing guide](../../docs/authentication/manual-browser-pairing.md)
and its live release gate before enabling the flag.

LaLiga linking is separate from application login. `POST /laliga/login` is available
only after LaLiga registers the exact HTTPS `/laliga/callback` URL for this client
and `LALIGA_BROWSER_REDIRECT_URI` is configured with the matching `FRONTEND_ORIGIN`.
Without it, the browser receives `browser_unavailable`; the native CLI pairing
helper remains available. Browser callbacks require one-time state/nonce/PKCE proof
and a browser-binding cookie. All owner-scoped browser
routes require a verified Bearer token. `/internal/*` additionally requires
`X-Service-Token` and private networking. No live financial actions should be used
for authentication validation.

See [authentication](../../docs/authentication/authentication.md),
[endpoints](../../docs/authentication/endpoints.md),
[release checks](../../docs/authentication/release-checks.md), and
[OpenAPI](openapi.json).
