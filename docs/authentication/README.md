# Authentication documentation

- [Authentication](authentication.md) — identities, login, pairing, tokens
- [Auth endpoints](endpoints.md) — route tables and JSON shapes
- [Auth OpenAPI / Swagger](openapi.md) — `/docs` and committed `openapi.json`
- [Developing authenticated endpoints](developing-authenticated-endpoints.md)
  — auth vs API, CSRF, internal JWT
- [LaLiga SSO implementation plan](laliga-sso-implementation-plan.md) — use LaLiga's
  social sign-in to establish a Better Auth session and Fantasy connection without
  this installation owning direct social-provider credentials
- [LaLiga cloud helper implementation plan](laliga-cloud-helper-implementation-plan.md)
  — connect through a local helper and the deployed backend without requiring a
  new HTTPS callback registration; includes native feasibility checks and rollout

Related: [API](../api/README.md), [Architecture](../architecture.md),
[AGENTS.md](../../AGENTS.md).

Current runtime: [Identity setup](../../backend/identity/README.md).
Production release checks: [runbook](release-checks.md).
