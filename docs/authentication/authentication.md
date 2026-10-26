# Authentication

Better Auth 1.7.12 is the application identity authority. `backend/identity`
(Node 24, port 8003) owns credentials, optional direct Google/Facebook/Apple login, verification,
recovery, account linking, database sessions and application JWT issuance.
`backend/auth` (Python, port 8000) owns only LaLiga delegation and the encrypted vault.

The browser uses one origin. `/auth/*` goes to identity, `/laliga/*` to the vault,
and `/api/*` to the Fantasy API. Private `/internal/*` is never publicly proxied.
The Fantasy feature routes, methods and JSON contracts are unchanged.

## Accounts and sessions

Register at `/register` with a name, username, email and a 12–128 character
password. Usernames normalize to lowercase and contain 3–30 letters, digits or
underscores. Both username and email sign-in require a verified email.

The identity service enforces a password policy on registration and password reset:
minimum length, common passwords, repeated or sequential characters and (at
registration) the username or email. The registration and reset forms show the same
rules while typing.

Verification uses Better Auth's Email OTP plugin: an eight-digit code expires
in ten minutes, is hashed in storage, has five allowed attempts and is consumed
once. Enter it at `/verify-email`. The address from registration, or from an
email sign-in that still needs verification, is filled in there and kept for
this browser tab so a refresh does not clear it. After a successful code, the
app opens `/sign-in` with the username (or email) entered earlier filled in; the
password is never stored or prefilled. The default stateless
verification endpoint is disabled because it does not consume links. Recovery
uses the framework's single-use reset link (30 minutes) at `/reset-password`;
successful reset revokes sessions. Requests for unknown recovery addresses have
the same public response.

Sessions expire after one day without sliding renewal or cookie caching.
Better Auth owns cookie, Origin and CSRF validation; there is no separate Python
CSRF token. Production requires HTTPS and uses Secure, HttpOnly cookies.

`/account` provides explicit provider linking and unlinking. Implicit same-email
linking is disabled. Linking requires a session created in the last ten minutes;
unlinking the last login method is rejected. Different provider emails may be
linked only through the authenticated linking flow. Social-only accounts enroll
a password through the verified recovery flow. Provider credentials are encrypted
on the identity server; browser provider-token endpoints are disabled.
The identity database enforces one owner per provider account with a unique
`(providerId, accountId)` key, including when two callbacks run concurrently.

Account settings also allow a username change, an email change confirmed by an
eight-digit code sent to the new address, and a password change that revokes other
sessions. The LaLiga option opens LaLiga's own account site; changing an application
account does not change the LaLiga account. Permanent account deletion requires an
explicit confirmation plus the current password for credential accounts (or a fresh
session for social-only accounts). Identity obtains an application JWT for the
authenticated user and asks Auth to remove that user's sealed LaLiga connection
before deleting the Better Auth user. If Auth cannot confirm removal, deletion
stops and the application account remains. A successful deletion clears the
browser's in-memory token and private query cache.
Previously issued self-contained API JWTs can remain valid until their normal
15-minute expiry plus verifier clock tolerance; the LaLiga connection is removed
before the user record, so those tokens cannot access sealed LaLiga credentials.

New Facebook accounts without email receive an actionable error. Returning
provider accounts resolve omitted email/name only by their stored provider and
provider account ID; email is never an ownership-migration key.

The sign-in screen reads `GET /auth/sign-in-options` and displays only configured
direct providers. LaLiga SSO remains unavailable without an approved web client
and registered browser callback; see the [capability record](laliga-sso-capability.md).

## Application JWTs

The React client calls `GET /auth/token`, returning `{ "token": "..." }`.
Tokens stay in memory. The JWT plugin signs Ed25519/EdDSA tokens with the application
user ID in `sub`, issuer `INTERNAL_JWT_ISSUER`, audience `fantasy-api`, and a maximum
lifetime of 900 seconds. Only the display name is added to standard claims.

Both Python services use configured `AUTH_JWKS_URL` (normally
`http://identity:8003/auth/jwks`) with a five-minute cache and bounded fetch timeout.
They reject missing/empty subjects, wrong issuer/audience, non-EdDSA algorithms,
invalid signatures, unknown keys, expired tokens and excessive lifetimes. They
never follow token-supplied key URLs. Verification runs outside the async event loop.
Keys rotate weekly with a one-day verification grace period. Do not delete old
keys before the maximum token lifetime plus clock skew has passed.

Logout, password reset and session revocation stop new token issuance. Already
issued API JWTs remain valid until expiry (up to 15 minutes, plus 30-second verifier
clock tolerance). The frontend aborts stale work and clears all queries and tokens
on logout, expiry and account changes; Better Auth synchronizes sessions across tabs.

## LaLiga connection

`POST /laliga/login`, `POST /laliga/pairings`, `GET/DELETE /laliga/connection`
and `DELETE /laliga/pairings` require an application Bearer JWT. Owners come only
from verified `sub`. Browser login returns `{ "authorize_url": "..." }` only when
LaLiga has registered the exact HTTPS `LALIGA_BROWSER_REDIRECT_URI` for this
client ID. The URL must be the frontend origin's `/laliga/callback`; otherwise
browser linking returns 503 `browser_unavailable` instead of starting an unusable
native redirect. The native CLI pairing flow remains available independently.

The login response also sets an HttpOnly, Secure, `SameSite=Lax` cookie scoped to
`/laliga/callback`; only its hash is stored with the challenge. The callback
rejects a request without the matching cookie and leaves the challenge pending, so
another person cannot complete a flow you started and attach their LaLiga account
to your application account. Challenges created before migration 0005 have no
binding and must be restarted.

The UI chains the two steps: successful social or credential sign-in returns to
`/connect-laliga`, which waits for the application JWT and checks the connection.
An already linked account returns to the lineup; an unlinked account continues
to LaLiga's authorization page when browser linking is configured. The public
callback consumes state, exchanges the code with the original redirect URI, and
returns to the fixed frontend origin. A failed callback shows a retry action
without automatically creating another challenge.

This is an authorization-code/PKCE exchange with LaLiga, not an exchange of this
application's Google, Facebook or Apple credentials. The repository has no
verified LaLiga contract for an external-provider token exchange. Azure AD B2C
can trust inbound JWTs only through a configured custom policy; that would require
LaLiga-side cooperation and issuer/audience validation, rather than reusing the
application's keys. See Microsoft's [authorization code flow](https://learn.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow)
and [ID token hint policy](https://learn.microsoft.com/en-us/azure/active-directory-b2c/id-token-hint).

The CLI's native return remains `authredirect://com.lfp.laligafantasy`. Independent
pending records contain the immutable owner, state, pairing ID, secret, PKCE
verifier and expiry. The paired challenge stores the nonce. Native callback
completion is cookie-free, rate limited and single-use. Callback replay, expiry,
bad nonce/state and mismatched ownership are rejected. Expired secrets are pruned
on new challenge creation; deployments may also periodically delete expired rows.
Logout attempts to cancel pending challenges before ending the application
session. If the vault is unavailable, Better Auth sign-out still proceeds;
outstanding challenges expire within the pairing TTL.

Postgres advisory locks serialize pairing completion, cancellation, unlink and
credential refresh for each owner. Connections retain AES-GCM encryption and the
existing refresh/needs-reauth behavior. The private bearer exchange still requires
both `X-Service-Token` and the user's JWT. LaLiga tokens never reach the browser or
Fantasy API storage.

See [endpoints](endpoints.md), [identity setup](../../backend/identity/README.md),
and the [cutover runbook](better-auth-cutover.md).
