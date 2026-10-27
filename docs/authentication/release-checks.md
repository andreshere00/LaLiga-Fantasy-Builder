# Authentication release checks

Use these checks before deploying a new identity or LaLiga-linking release. The
[authentication guide](authentication.md) describes the current flow, and the
[identity README](../../backend/identity/README.md) owns environment variables
and provider configuration.

## Identity and data

- Confirm HTTPS ingress, strong signing and encryption secrets, authenticated
  TLS mail, and separate non-superuser PostgreSQL roles for identity and vault.
- Run reviewed migrations, preserve the vault key, and rehearse backup and
  restore on disposable staging. Restart services and confirm that users,
  sessions, signing keys, and sealed LaLiga connections survive.
- Verify registration, email-code expiry and reuse rejection, sign-in,
  password reset, password change, session revocation, and account isolation.
  Confirm verification and recovery mail delivery through the configured SMTP
  provider, including failure behavior.
- For each enabled Google, Facebook, or Apple provider, test success,
  cancellation, repeat sign-in, account linking, and same-email collisions.
  Apple also needs its registered HTTPS callback and relay-email checks.
  Do not advertise providers that lack production configuration.
- Confirm API and auth accept only the configured Better Auth issuer and keys.
  A legacy cookie or token must not authorize access. Cross-tab logout and
  account switches must clear browser tokens and user-scoped queries.

## LaLiga linking

- Verify the configured redirect URI is registered for the LaLiga client.
  Test browser success, denial, cancellation, callback state/nonce/PKCE
  rejection, replay, reconnect, and `needs_reauth`.
- Check that the browser callback belongs to the session that started linking.
  Test a second account and browser so neither can use or see the first
  account's connection. Verify native CLI pairing separately.
- Keep callback query strings, bearer tokens, vault secrets, session cookies,
  reset material, and service tokens out of logs and telemetry.
- The guided helper and proposed [LaLiga SSO](laliga-sso-implementation-plan.md)
  have separate release gates. Do not treat either as released until its gates pass.
- For helper mode, first verify a consented macOS pairing against the normal
  HTTPS origin, native handler ownership, cloud vault persistence, read-only
  lookup and refresh. Check two application users independently before setting
  `LALIGA_HELPER_ENABLED=true`. Keep the browser callback setting unset unless
  its own registration has been verified. Roll back helper advertising by
  clearing the flag; retain existing sealed connections and vault keys.
- Verify that the helper opens the fixed connection page after success and that
  a waiting tab navigates only after its own account-scoped connection check.
  The installed background app and automatic website launch have additional
  gates in the [production helper plan](laliga-production-helper-rollout-plan.md).
- Before enabling the helper, confirm its destination is the fixed HTTPS
  application origin, TLS checks remain enabled, and redirects cannot move a
  credentialed request to another origin. Confirm the current native scheme
  handler is not replaced, no legacy localhost completion runs during cloud
  pairing, and an uncertain code exchange is not retried blindly. Check
  cancellation, expiry, account mismatch, provider denial, cleanup of any
  transient callback file, and absence of tokens, codes and pairing secrets
  from URLs, logs, command output and persistent browser storage.
- For manual desktop mode, keep `LALIGA_MANUAL_LINK_ENABLED=false` until a
  consented Google sign-in on the deployment target confirms the complete
  canceled native callback can be copied and redeemed. Test advertised Chrome,
  Edge and Safari variants, with and without an installed native handler; check
  read-only Fantasy access, refresh after expiry, service restart, two users,
  wrong browser, cancellation, replay and recovery. Review whether native
  client reuse is suitable for public distribution. Enable for a limited
  audience, then roll back by clearing the flag if needed. See the
  [manual pairing guide](manual-browser-pairing.md).

## Runtime and rollback

- Check health endpoints, image builds, ingress routes, read-only CLI flows,
  responsive browser views, keyboard navigation, and both themes. Rehearse a
  deployment rollback on disposable staging while preserving identity and vault
  writes made after the previous release.
- Review network boundaries: identity and vault storage stay private; Caddy
  must replace `X-Real-IP` with the network client address. Configure trusted
  proxy ranges before adding a load balancer.
- Self-contained application JWTs may remain valid for their configured lifetime
  after sign-out (currently up to 15 minutes plus 30 seconds clock tolerance).
  Do not claim immediate token revocation without a revocation mechanism.

Record the date, environment, test account identifiers, and results for each
release. Never store passwords or tokens in that record.
