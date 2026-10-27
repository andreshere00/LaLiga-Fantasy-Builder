# Authentication documentation

- [Authentication](authentication.md) — identities, login, pairing, tokens
- [Auth endpoints](endpoints.md) — route tables and JSON shapes
- [Auth OpenAPI / Swagger](openapi.md) — `/docs` and committed `openapi.json`
- [Developing authenticated endpoints](developing-authenticated-endpoints.md)
  — auth vs API, CSRF, internal JWT
- [LaLiga SSO implementation plan](laliga-sso-implementation-plan.md) — use LaLiga's
  social sign-in to establish a Better Auth session and Fantasy connection without
  this installation owning direct social-provider credentials
- [Native helper capability record](laliga-sso-capability.md) — observed cloud
  trial and remaining checks for the guided macOS helper
- [Production helper rollout plan](laliga-production-helper-rollout-plan.md)
  — pending installed background app and automatic website launch
- [Manual desktop pairing](manual-browser-pairing.md) — copy-and-paste flow,
  server-held PKCE, browser binding, release gate and rollback

Related: [API](../api/README.md), [Architecture](../architecture.md),
[AGENTS.md](../../AGENTS.md).

Current runtime: [Identity setup](../../backend/identity/README.md).
Production release checks: [runbook](release-checks.md).
