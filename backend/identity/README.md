# Application identity

Better Auth **1.7.12**, Node **24.15.0**, Bun **1.3.14**, Express 5 and PostgreSQL.
The React client pins the same Better Auth version. Python services independently
verify its Ed25519 JWTs; identity imports neither Python service.

## Local setup

```bash
cp backend/identity/.env.example backend/identity/.env
bun install --cwd backend/identity --frozen-lockfile
docker compose up -d postgres redis mailpit
cd backend/identity
bun run migrate
bun run dev
```

Start the other services with `uv run poe dev-clean` from the root instead of
starting identity separately. Visit `/register` on http://localhost:3000.
Read verification mail in http://localhost:8025. There are no shared demo passwords.
Identity always persists to its own PostgreSQL database, even when the LaLiga
vault runs in development memory mode.
The local stack waits up to 60 seconds for identity's database and mail readiness
before starting Vite. If it fails, check the migration output and ensure PostgreSQL
and Mailpit are running. Use Node 24 as specified above; newer major versions are
outside the supported runtime range.

Social providers are optional in development. To enable Google locally, create a
Google OAuth web application with authorized redirect URI
`http://localhost:3000/auth/callback/google`, set both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `backend/identity/.env`, then restart identity. An `.env`
edit does not restart the Node source watcher. Without these credentials, use
email/username registration and sign-in; Google returns `PROVIDER_NOT_FOUND`.

The initial SQL was generated with `auth@1.7.12` from `src/runtime.ts`, including
username, JWT and shared database rate limits. `bun run migrate` applies reviewed
SQL under a transaction and advisory lock, with a checksum journal. It is safe to
repeat; changed already-applied SQL fails closed. Future schema changes need a
new versioned migration, not edits to an applied schema. Schema generation needs
a disposable empty database and configured environment (`bun run schema:generate`).

## Production configuration

Use `.env.example` as the variable reference. Inject secrets through deployment
secret management, never `VITE_*` or source control. Set `NODE_ENV=production`, an
exact HTTPS `BETTER_AUTH_URL`, matching HTTPS `INTERNAL_JWT_ISSUER`, a random
32+ character `BETTER_AUTH_SECRET`, isolated database credentials, authenticated
SMTP, and all provider credentials. Keep the secret stable: it encrypts provider
credentials and signing keys. Back it up separately from the database.

Register callbacks at `https://your-domain/auth/callback/google`, `/facebook`,
and `/apple`. Google needs its web OAuth client; Facebook needs its app ID/secret,
email access and app review/public-mode setup; Apple needs a Service ID, Team ID,
Key ID and `.p8` private key. Apple secrets are generated when resolving provider
configuration and expire after one hour, avoiding manual six-month secret renewal.
Apple's origin is explicitly trusted for its POST callback. Configure Apple relay
email sender authorization as well as normal SPF/DKIM/DMARC for delivery.

The service has no public Compose port. Only a trusted ingress may reach it;
Nginx replaces `X-Real-IP` locally; HTTPS Caddy routes `/auth/*` directly to
identity and replaces it with the actual client address. Better Auth uses the configured public
origin rather than trusting arbitrary forwarded host/proto headers. Do not expose
8003 directly to untrusted clients. Rate limits use the shared identity database.
Readiness checks the migrated user table and mail transport; health responses
contain no dependency details. Termination drains requests and closes the pool.

Production Compose: set `IDENTITY_NODE_ENV=production`, `IDENTITY_SMTP_HOST` to
the real mail host, and the identity env's SMTP port/TLS/credentials. Set vault
`USE_MEMORY_STORE=false`, preserve its encryption key, and inject strong service
and database secrets. The root Compose defaults are explicitly for local use.
The optional local mail sink must not be exposed publicly.

For repeatable HTTPS staging, point a dedicated DNS name to your ingress and run
`docker compose -f docker-compose.yml -f docker-compose.https.yml --profile apps up --build`.
Set `APP_DOMAIN`, HTTPS origin/issuer and the registered provider callbacks first.
The Caddy ingress obtains and renews certificates; expose only 80/443 publicly.
Use a separate database, secrets and provider apps from production.

## Verification

```bash
bun run typecheck
bun run build
IDENTITY_TEST_DATABASE_URL=postgresql://.../disposable_test bun run test
```

Tests create and remove their own schema. Provider network boundaries are mocked;
framework state, replay, account linking, encryption, credential verification,
OTP consumption, recovery, revocation and real JWT signing run against PostgreSQL.
Set `IDENTITY_INTEROP_OUTPUT=/tmp/better-auth-interop.json` to export a synthetic
JWT/JWKS fixture. Run `tests/verify_python.py` in each Python service's environment
to prove actual framework-token compatibility. CI also builds the identity image.

Real Google/Facebook/Apple login, Apple HTTPS/form callback cookies and production
mail deliverability require the [staging checklist](../../docs/authentication/better-auth-cutover.md).
