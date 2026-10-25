# LaLiga SSO implementation plan

Status: proposed, 25 October 2026. Planning only; this document changes no runtime behavior.

## Objective and corrected requirement

Let a person sign in to Fantasy Builder through **LaLiga's authenticator**, using
Google, Facebook, Apple, or another method offered by LaLiga. Successful sign-in
establishes a Better Auth application session and connects the person's Fantasy
account in one guided journey, without separate Google/Facebook/Apple credentials
owned by this installation.

LaLiga keeps its social-provider client secrets. Our backend receives a LaLiga
authorization code and exchanges it for LaLiga-issued tokens. This is not an
exchange of our Better Auth JWT for Google credentials, and it does not retrieve
LaLiga's private social-provider credentials.

This plan supersedes the direct-social-provider requirement and application-first
login order in the [original Better Auth plan](better-auth-implementation-plan.md).
It retains Better Auth as the application session/JWT authority, Python auth as
the LaLiga vault, and all existing Fantasy API methods and JSON contracts.
Username/email sign-in, verification and recovery remain available. Existing
independently configured social providers can remain optional; they must not be
required for LaLiga SSO or advertised as available when unconfigured.

## Current behavior and the failure

| Area | Current behavior | Required change |
| --- | --- | --- |
| Social buttons | `AuthPages.tsx` calls Better Auth's Google/Facebook/Apple providers directly | Start LaLiga federation, rather than a missing locally configured provider |
| Credentials | This installation has no direct social-provider credentials | Make those credentials unnecessary in LaLiga SSO mode |
| LaLiga login | `POST /laliga/login` requires an existing application JWT | Add a separate browser-bound, unauthenticated sign-in initiation flow; keep the existing linking route protected |
| Pairing ownership | Pending records require an application user before upstream authentication | Introduce a distinct pre-login transaction; resolve application ownership only after verified LaLiga identity |
| Callback | Configured redirect is `authredirect://com.lfp.laligafantasy` | Confirm an authorized browser callback for web deployment; retain native pairing independently |
| Session/token issuance | Better Auth owns sessions, cookies, Ed25519 JWT and JWKS | Use framework APIs after trusted LaLiga proof; do not restore Python application sessions/signing |
| Connection | Python stores owner-scoped sealed credentials | Attach a pending sealed grant to the verified Better Auth subject after session creation |

Relevant implementation:

- `frontend/src/auth/AuthPages.tsx`, `ConnectLaligaPage.tsx`, `AuthProvider.tsx`, `client.ts`.
- `backend/identity/src/auth.ts`, `config.ts`, `server.ts`, `migrate.ts`.
- `backend/auth/src/fantasy_auth/api/pairings.py`, `application/pairing.py`,
  `adapters/b2c_httpx.py`, `adapters/jwks.py`, `ports/repos.py`.
- `frontend/vite.config.ts`, `frontend/nginx.conf`, `docker/Caddyfile`.

## Phase 1: prove the upstream integration before building on it

This is a release dependency, not an assumed configuration change.

1. Confirm the approved LaLiga client/application registration, tenant, issuer,
   policy, scopes, discovery/JWKS URLs, and token endpoint. Establish whether the
   registration supports an external web application, which client authentication
   it requires, and whether its tokens authorize the Fantasy profile/API reads.
   Do not assume a new web client has the same Fantasy access as the existing
   native client, or that a published native client ID is an approved web client.
2. Obtain or verify an exact registered HTTPS callback, proposed as
   `https://<app-origin>/auth/laliga/callback`. Verify the development callback
   separately; use an approved HTTPS development origin if localhost is unsupported.
   Changing `LALIGA_REDIRECT_URI` locally does not register a callback upstream.
3. Inspect a consented sign-in using each method actually offered by the configured
   LaLiga policy. Record sanitized issuer, audience, subject, policy and claim
   shapes, required scopes, refresh behavior, and whether email is present and
   explicitly verified. Do not retain codes, cookies, tokens or user PII in fixtures.
4. Verify Google/Facebook/Apple preselection independently. B2C supports
   `domain_hint` when its policy is configured for it; the actual LaLiga values
   and support are unconfirmed. Never invent policy names or use a provider's
   `client_id` as a hint. Keep a generic LaLiga sign-in path available.
5. Check the pinned Better Auth **1.7.12** APIs for a small custom provider plugin:
   endpoint middleware, user/account lookup and creation, framework session/cookie
   creation, and standard JWT issuance. Prove them against disposable PostgreSQL.
   Current online Generic OAuth documentation may describe a different release;
   inspect installed source/types before selecting APIs.

Deliver a sanitized capability record and a browser proof of code exchange,
identity validation, and a read-only Fantasy profile lookup. No live Fantasy writes.

**Exit gate:** the approved client, callback, identity claims, and Fantasy access
are demonstrated. If only the existing native callback is available, document the
web release as externally blocked and keep the existing helper as development
pairing only. Do not claim helper-dependent login is a production web solution,
accept arbitrary callbacks, intercept another app's redirect, or weaken PKCE.

## Architecture and ownership

```mermaid
sequenceDiagram
    participant B as Browser / frontend origin
    participant I as Better Auth identity
    participant A as Python LaLiga auth + vault
    participant L as LaLiga authenticator
    participant S as Social provider chosen at LaLiga
    B->>I: POST /auth/laliga/sign-in
    I->>A: Private start request
    A-->>I: LaLiga authorize URL + attempt reference
    I-->>B: Browser-binding cookie + authorize URL
    B->>L: Authorization code + PKCE request
    L->>S: LaLiga-managed social sign-in
    S-->>L: Provider authentication result
    L-->>B: Registered callback with code and state
    B->>I: GET /auth/laliga/callback
    I->>I: Verify transaction and initiating browser
    I->>A: Private completion: code + attempt proof
    A->>L: Exchange code using stored PKCE verifier
    A->>A: Verify identity, confirm Fantasy profile, seal tokens
    A-->>I: Verified identity summary + opaque pending grant
    I->>I: Resolve account; create Better Auth session
    I-->>B: Framework session cookie; redirect /connect-laliga
    B->>I: POST /auth/laliga/complete with session cookie
    I->>I: Obtain standard application JWT through JWT plugin
    I->>A: Private finalize with JWT + service token + grant
    A->>A: Bind sealed grant to verified application sub
    A-->>I: Connected status; no tokens
    I-->>B: Completion; use existing connection/API flow
```

Use a narrow Better Auth plugin for the LaLiga bridge. Framework APIs continue to
own users, account links, sessions, cookie signing, logout and application JWTs.
The plugin orchestrates trusted verification and pending enrollment; it does not
implement a second password system, session cookie format, or JWT signer.

Python auth remains the only service to exchange, refresh, persist and decrypt
LaLiga tokens. Identity receives only validated identity metadata and an opaque
pending-grant reference over an authenticated private channel. No LaLiga access,
refresh or ID token is stored in Better Auth's `account` token columns.

The browser holds only the framework session cookie and its existing short-lived
application JWT in memory. Neither the JWT nor a pending-grant secret belongs in
a redirect URL or browser storage. Authorization codes reach only the registered
callback and are never included in application error messages or access logs.

## Phase 2: add a browser-bound pre-login transaction

Create separate storage and services for SSO sign-in. Do not make the existing
`PairingRecord.user_id` nullable or remove JWT authorization from linking routes.

Identity owns the initiating browser transaction: random identifier, hashed
browser proof, hashed state/correlation values, exact callback, safe local return
path, sign-in versus link intent, creation/expiry, processing state, and the
associated framework user/session once established. Use per-attempt browser
binding so parallel tabs do not silently replace each other's proof.

Python owns the upstream attempt: opaque attempt/proof identifiers, configured
issuer/client/policy, nonce, PKCE S256 verifier, callback, expiry and lifecycle.
Protect stored verifier/proof material with the vault key. Tokens obtained after
completion are sealed immediately into a short-lived pending grant. The attempt
has no caller-selected application owner.

Required controls:

- Cryptographically random state, nonce and verifier; explicit TTL of ten minutes.
- Validate allowed Origin on initiation and completion, with the same-origin
  protections provided by Better Auth. The callback uses state, browser binding
  and PKCE rather than requiring a pre-existing application session.
- HttpOnly, Secure-in-production, host-only binding cookies with the narrowest
  compatible path. Confirm callback response mode and SameSite behavior with the
  real policy; prefer top-level query callback when supported.
- Reject missing/wrong browser proof before claiming or exchanging a code. A
  copied callback must not authenticate another browser or consume its transaction.
- Atomic persisted claims prevent concurrent exchange and replay across workers.
  Never blindly retry a possibly redeemed authorization code after a timeout;
  require a fresh authorization when the exchange result is unknown.
- Allow only configured upstream URLs, exact callback and enumerated provider
  hints. Return paths must be allowlisted local routes, excluding `//`, external
  origins, backslashes and encoded redirect bypasses.
- Shared rate limits for starts/callbacks, bounded request timeouts, storage TTL
  cleanup, and sanitized failure categories. Do not rely on process-local locks.

Strengthen the reused B2C validator: fixed allowed algorithm and policy/client,
verified signature, required nonempty `sub`, exact issuer/audience, expiry and
relevant time claims, nonce, bounded JWKS/discovery access, and cache refresh on
key rotation. A decoded token or profile API response alone is insufficient proof.

## Phase 3: map LaLiga identity to a Better Auth account

Use a stable **verified issuer + subject** identity. Store it under provider
`laliga` and enforce a database uniqueness constraint on that association. Treat
an issuer, tenant, policy or client change as an identity migration requiring
review, rather than silently matching new subjects by email or manager name.

- Returning identity: resolve the existing account association and preserve the
  Better Auth user ID. Do not create a new user on every social sign-in.
- New identity: create the user/account with framework APIs and the verified
  profile. The upstream social method is optional display metadata, not the local
  provider ID or an authorization decision.
- Do not automatically merge a LaLiga account with an existing password/direct-
  social account sharing an email. Require fresh application authentication and
  an explicit link flow with its target captured server-side before redirect.
- Do not accept a browser `user_id`, manager ID, email, or provider name as proof
  of ownership. Never move another account's connection during login.
- Do not fabricate an email or mark it verified merely because a claim exists.
  If the approved policy supplies a reliably verified address, retain its proof.
  Otherwise require verified email enrollment before activating a new application
  account, because the current Better Auth schema requires a unique email.
  Reuse framework email-verification/OTP behavior, bind the pending LaLiga proof
  to that enrollment, withhold the application session until verification, and
  expire abandoned enrollment. Prove this path in the pinned-version spike.
- Email collision must offer existing-method sign-in and explicit linking;
  missing profile fields must not produce guessed identities or leaked details.
- An existing application session must not be silently replaced. Account switching
  is explicit; linking requires a fresh session and independently verified LaLiga
  identity. Continue enforcing last-sign-in-method protection.

Use a provider association table or compatible framework account representation
with unique `(issuer, subject)` and, for the current one-connection model, one
active LaLiga identity per application user. Concurrent first login must converge
on one account. Do not hand-insert framework session rows or assume a nonexistent
framework API; cover the selected adapter/plugin calls with integration tests.

## Phase 4: finalize the connection without claiming cross-database atomicity

Identity and the vault use separate databases. Implement an explicit recoverable
state transition, not an assumed transaction covering both services.

1. Python completes upstream verification and stores sealed credentials as a
   pending grant with its verified subject, transaction and expiry.
2. Identity resolves the application account, persists its pending-grant/session
   association, and creates the normal Better Auth session/cookie.
3. `/connect-laliga` automatically calls the session-protected bridge completion
   endpoint. Identity obtains a standard JWT through the existing JWT plugin
   using that framework session. Grant references remain server-side.
4. Python finalization requires that application Bearer JWT and the private
   service token. Derive the connection owner from the verified JWT `sub`.
   Verify grant/transaction proof and the immutable LaLiga-to-application binding.
   Lock relevant subject/owner records and atomically attach the sealed grant.
5. Mark finalization durable and idempotent: retries for the same transaction and
   owner return the committed result; a different owner receives a rejection.
   Persist a bounded completion receipt so a lost response does not lose success.
6. Only a confirmed connection result renders the lineup as ready. An application
   session can exist while finalization is pending or failed; show that distinction
   and offer retry, reconnect, or public browsing.

Handle failures explicitly: pending grant expires if identity provisioning fails;
reload resumes a persisted finalization; response loss retries safely; an expired
grant requires fresh LaLiga authorization. No partial failure silently transfers
or deletes an existing connection. Serialize finalization with existing refresh,
unlink, cancellation and pairing operations. Logout cancels active pre-login and
pending-finalization work as well as existing pairings, preventing late attachment.

## Proposed endpoint contracts

These are new routes; implementation must register schemas and generated docs.
Do not change existing Fantasy API methods or relax existing pairing permissions.

| Route | Owner | Boundary and result |
| --- | --- | --- |
| `POST /auth/laliga/sign-in` | Identity plugin | Public initiation with Origin protection and rate limiting; optional supported provider and safe local return path; sets browser proof, returns validated authorize URL |
| `GET /auth/laliga/callback` | Identity plugin | Exact upstream callback; browser-bound state; creates framework session only after proof/enrollment; redirects without tokens |
| `POST /auth/laliga/complete` | Identity plugin | Framework session + Origin protection; uses server-side pending reference; returns connection completion status |
| `POST /auth/laliga/link` | Identity plugin | Fresh existing session + Origin protection; captures target server-side; never acts as anonymous sign-in |
| `GET /auth/sign-in-options` | Identity | Public, non-secret availability/capability flags for supported UI choices; no keys, tenant internals or token material |
| `POST /internal/laliga/sso/start` | Python auth | Private service token; creates bounded ownerless upstream attempt |
| `POST /internal/laliga/sso/complete` | Python auth | Private service token + transaction proof; exchanges and validates code; returns identity summary/opaque pending grant, never raw tokens |
| `POST /internal/laliga/sso/finalize` | Python auth | Private service token + verified application JWT + grant proof; derives owner from `sub`; idempotent attachment |

Internal cancellation/expiry may require a matching private operation; define its
bounded, idempotent schema alongside these routes. All write bodies forbid extra
fields. No `/internal/*` is exposed through Vite, Nginx or Caddy. A callback is the
only approved location for upstream codes; sanitize query strings in proxy and
application access logs and use `Cache-Control: no-store`/`Referrer-Policy: no-referrer`.

## Phase 5: frontend, settings and developer tools

- Start sign-in without requiring `authClient.useSession()` to return a user first.
  Use the new LaLiga bridge client; keep standard Better Auth session/token APIs
  after login and retain existing stale-account/cancellation guards.
- If provider preselection is proven, retain equal-size Google/Facebook/Apple
  logo buttons and explain “via LaLiga.” Their handlers start LaLiga federation,
  not `authClient.signIn.social({ provider: "google" })` on this installation.
- If preselection is unavailable, show one primary “Continue with LaLiga” action
  and explain that social selection happens on LaLiga. Do not display three
  supposedly distinct actions that all ignore the chosen provider.
- Show direct provider buttons only when their separate optional integration is
  configured. Expose no secrets in availability flags or `VITE_*` variables.
- Retain an email/password alternative, verification/recovery and account methods.
  Separate application identity linking from disconnecting Fantasy access.
- Cover opening LaLiga, waiting, cancellation, expiry, enrollment, collision,
  finalization, retry and success. Preserve entered recovery data. Inspect phone
  and desktop layouts, keyboard focus, both themes and reduced-motion behavior.
- Make `/connect-laliga` finalize the pending SSO grant before starting a new
  authorization. Avoid the current automatic second LaLiga redirect after success.
- Introduce an explicit LaLiga SSO availability/configuration switch. Production
  validation requires its approved client, callback, vault/service secrets and
  persistence, not all three direct social-provider credentials. Keep complete-
  pair validation when an optional direct provider is enabled.
- The existing native client configuration remains isolated from the approved web
  configuration when registrations differ. Preserve the issuing client/policy on
  every token bundle so refresh uses the correct registration.
- Update CLI browser login for system-browser social flows and the selected
  callback strategy. Do not automate social passwords or assume embedded Chromium
  works for Google. Preserve `--jwt`/`INTERNAL_JWT` and read-only CLI behavior.

## Phase 6: migrations, documentation and cutover

Use additive versioned migrations in both services. Extend the identity migration
runner, which currently supports a single checksummed schema, rather than changing
that already-applied SQL. Add unique constraints/indexes, encrypted attempt/grant
storage, expiry cleanup and completion receipts. Test upgrades from existing data.

The owner confirmed the installation contains development accounts: people may
sign in again and pair again. Do not delete old vault rows, rotate the vault key,
or mass-reassign ownership. Existing accounts require explicit linking if reused;
real-user deployments need a separate reviewed ownership migration.

Update identity/auth READMEs, architecture, authentication/endpoints, frontend,
CLI docs, environment examples, Compose/HTTPS ingress and CI. Regenerate auth
OpenAPI; regenerate API OpenAPI/endpoint schemas only if their inputs change.
Record the capability gate and real-provider staging checks in the cutover runbook.

Ship behind a disabled-by-default flag until the upstream gate and staging checks
pass, then enable for the target installation. Rollback disables the new initiation
and restores the previous entry screen without undoing account/vault data.
Existing valid framework sessions and JWT validation continue to work. Document
cancellation of pending new-flow transactions and verify rollback with backups.

## Validation and acceptance

| Boundary | Required evidence |
| --- | --- |
| Upstream registration | Real approved HTTPS callback, successful code/PKCE exchange, expected issuer/audience, Fantasy profile access and refresh; no write actions |
| Browser binding | Missing/mismatched/expired state or cookie, copied callback in another browser, parallel tabs, replay, denied consent, malformed callback and open redirect attempts |
| Token validation | Wrong signature/algorithm/issuer/audience/policy/nonce, missing or empty subject, expired/future tokens, JWKS rotation and bounded network failure |
| Framework integration | Actual Better Auth user/account/session/JWT creation against PostgreSQL; standard logout/expiry; no fake session rows or custom application JWT issuance |
| Identity mapping | Repeat login, concurrent first login, same-email collision, missing/unverified email enrollment, differing social methods, explicit linking and account switching |
| Vault ownership | Owner only from verified app `sub`; grant cannot be reassigned; cross-user use rejected; concurrent attach/unlink/refresh/cancel; no token exposure |
| Recovery | Identity/vault failure, timeout with unknown exchange result, lost finalize response, reload, expired grant, logout during callback/finalization, service restart |
| Frontend | Anonymous entry works with all direct provider credentials absent; supported logos/hints; no second authorization loop; accessible pending/error/recovery/success states |
| Compatibility | All Fantasy API routes, methods, schemas and JWT authorization unchanged; existing pairing/native helper and read-only CLI coverage pass |
| Deployment | Private routes unreachable publicly; correct Origin/cookie behavior behind HTTPS; redacted callbacks/logs; additive migration, backup restore and rollback rehearsal |

Use deterministic mocked upstream transports for protocol failures and concurrency;
use actual Better Auth/PostgreSQL for session/identity integration. Run meaningful
Python and frontend checks and the repository coverage/generated-schema gates.
Mocked provider callbacks do not establish real Google/Facebook/Apple compatibility.

Completion means a fresh browser with no application session can choose an offered
LaLiga sign-in method, authenticate there, obtain a normal Better Auth session,
connect the correct Fantasy account and read its leagues without configuring this
installation's Google/Facebook/Apple secrets. A returning user keeps the same
application ID. No extra application login or redundant LaLiga authorization is
required. Any provider-specific or callback limitation must be visible and must
not be described as complete production support.

## Sources and limits of evidence

- [LaLiga's official privacy policy](https://www.laliga.com/informacion-legal/politica-privacidad-app-oficial)
  describes its ecosystem SSO and Google/Facebook/Apple registration. It does not
  grant this application a client registration, callback or token audience.
- [Microsoft B2C authorization-code flow](https://learn.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow)
  defines registered callbacks and PKCE/code exchange.
- [Microsoft B2C web authentication options](https://learn.microsoft.com/en-us/azure/active-directory-b2c/enable-authentication-web-application-options)
  describes provider hints; the configured LaLiga policy must be tested separately.
- [Better Auth OAuth concepts](https://better-auth.com/docs/concepts/oauth) and
  [Generic OAuth documentation](https://better-auth.com/docs/plugins/generic-oauth)
  describe federation. Validate every integration API against the installed
  `better-auth@1.7.12`; do not assume current-site examples match that release.

These sources were checked on 25 October 2026. The repository establishes the
current native pairing behavior; production browser federation remains subject
to the Phase 1 capability gate. No real-provider proof is claimed by this plan.
