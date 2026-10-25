# Better Auth cutover and release checks

Implementation date: 24 October 2026. The repository owner confirmed that this
installation contains disposable development accounts and chose **re-register and
pair again**. No production ownership bridge is enabled. Existing sealed connections
are left untouched; matching email, username or manager name never transfers them.

## Development cutover

1. Stop app services and pending logins. Back up any persistent vault database and
   vault key before changing deployment. Memory-only connections are disposable.
2. Create the separate identity role/database. New Compose clusters run
   `docker/postgres/identity.sh`; existing clusters must run its SQL with an admin
   connection, supplying `identity_password`, `vault_password` and `vault_database` securely.
   For an existing vault, transfer its tables/sequences to `fantasy_vault` under a
   write pause (review the inventory first); keep the bootstrap superuser out of
   the runtime `DATABASE_URL`. New clusters provision both non-superuser roles. Never give the identity
   runtime the vault database's credentials. Check that identity cannot access vault
   tables and vault cannot access identity tables.
3. Copy the new environment examples, preserving your vault key and service
   credentials. Replace the old identity issuer/JWKS settings in both Python services.
   Existing `.env` files are not automatically overwritten by setup commands.
4. Run identity's reviewed migration and Python auth's additive migrations. Stop old
   token issuance and wait at least 16 minutes after the last token was issued.
5. Start the new stack. Register at `/register`, verify the email code, sign in,
   then reconnect LaLiga. Existing legacy tokens and cookies grant no access.
6. Confirm a second account cannot see the first account's connection, and that
   `--no-pair standings-analysis` and a linked read-only CLI flow work.

No database deletion is part of this implementation. Legacy `sessions` tables and
old sealed connections can be archived after the observation window. Before doing
so, inventory counts and owners and verify backup restoration in a disposable
instance. If real users are discovered, stop the cutover: a separately reviewed
bridge requiring proof of both identities and a reversible ownership journal is
required. Do not use this development re-registration procedure as silent migration.

## Automated validation completed

- Full Python auth/API/scraping suites passed their existing coverage gates;
  frontend unit tests, lint, typecheck/build and 64 affected browser checks passed.
- Real Node 24 Better Auth credentials, OTP/recovery, provider callback handling
  (mocked provider network), shared rate limits and session expiry ran against
  disposable PostgreSQL. Its actual Ed25519 token verified in both Python services.
- All Compose application images built and the isolated stack became healthy with
  persistent vault storage. Two users registered through Nginx, received mail in
  Mailpit, verified, signed in and called both Python services with distinct subjects.
  Original sessions and signing keys survived identity/auth restart.
- Identity and vault database roles are non-superusers; neither can connect to the
  other's database. Caddy configuration validated. Dependency audits reported no
  known vulnerabilities for the pinned identity/frontend dependency trees.
- Every Fantasy API route, method and data schema matches the previous contract;
  only its authentication descriptions changed. Generated OpenAPI checks passed.

These checks do not replace the real-provider and recovery rehearsal below.

## Production release gate

Automated tests cannot certify external registrations, email delivery or live
provider browser policies. Record evidence for each of these before deployment:

- Production configuration fails closed without HTTPS, provider credentials,
  authenticated TLS mail and strong secrets. Identity and vault use distinct roles;
  restarts preserve identity users, sessions, keys and sealed connections.
- Google: success, denial/cancellation, repeat sign-in, explicit linking and
  same-email collision. Facebook: the same plus missing email and public app access.
- Apple: the registered HTTPS domain, actual form POST callback in a browser,
  Secure cookies, first-login name, repeat login and relay email delivery.
- Username/email: registration, normalization/uniqueness, wrong password, unverified
  rejection, expired/consumed verification code, forgotten-password link expiry,
  reset replay, password change and revoked-session behavior.
- Linking from an old session is rejected; link a differing email with provider
  proof; reject last-method unlink and confirm a different account remains isolated.
- LaLiga: native callback without cookies, nonce/state/PKCE rejection, replay,
  cancellation, unlink/refresh race, reconnect and `needs_reauth`.
- Browser: phone/desktop and both themes; keyboard navigation; cross-tab logout and
  account switches clear tokens and queries; no stale response restores old data.
- Secret/log review: no provider credentials, reset/verification material, native
  callback URLs, session cookies or API tokens in logs or telemetry.
- Health checks, image builds, HTTPS ingress and mail transport failure behavior;
  Postgres backup/restore and rollback rehearsal on disposable staging.

The HTTPS Caddy ingress routes `/auth/*` directly to identity and replaces
`X-Real-IP` with the network client address. Identity has no published port. Do
not expose it directly or put an unconfigured proxy in front of Caddy; configure
trusted proxy ranges there before using a load balancer.

## Rollback

Pause identity/account writes and LaLiga writes first. Preserve the new identity
DB and secrets, including users created since cutover. Restore the previous release
and routing with explicit, bounded old issuer trust only if needed; force fresh
sign-in. Development re-pairing creates distinct ownership rows, so no ownership
moves need reversal. Do not restore an old vault snapshot over new connections.
Use the backup only for rehearsed recovery, preserving post-cutover writes.

JWT revocation remains bounded: self-contained API tokens expire within 15 minutes
plus 30 seconds clock tolerance. Shortening this window requires a different
revocation mechanism, not a claim that sign-out immediately invalidates JWTs.

## Reference audit

Active application authentication contains no Keycloak dependency, custom Python
session/CSRF store, application OIDC flow or JWT signer. Remaining historical
references are the original implementation plan, schema migration planning history,
legacy additive SQL migrations (inert rollback tables), and negative tests proving
legacy cookies fail. LaLiga B2C OIDC/RS256/PKCE is intentionally retained as the
upstream delegation protocol. Test-only static RSA API fixtures exercise the
unchanged feature contracts; production validators accept only EdDSA, covered by
the separate identity JWT matrix and actual TypeScript-issued fixture check.
