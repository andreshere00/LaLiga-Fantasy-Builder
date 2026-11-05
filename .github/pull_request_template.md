## Description

<!-- Explain the purpose of this PR in 1–3 lines. -->

## Summary of changes

<!-- Provide 3–10 bullet points describing the changes. -->

- [Change 1]
- [Change 2]
- [Change 3]

## How to test

<!-- Include prerequisites, reproducible steps or commands, expected results,
and the checks you actually ran with their outcomes. Explain any skipped checks. -->

1. [Prerequisites and setup]
2. [Steps or commands to run]
3. [Expected results and actual outcomes]

## Design and code quality requirements

<!-- Review the requirements in AGENTS.md. Check applicable items once verified;
mark non-applicable items as N/A and briefly explain why. -->

### Architecture and security

- [ ] Relevant architecture, endpoint, proxy, authentication, and feature documentation
  has been reviewed before API changes.
- [ ] Service responsibilities and trust boundaries are preserved. New LaLiga features
  follow `api/` → `services/` → `repositories/` → `clients/laliga_fantasy.py`;
  new domains are wired in `AppContainer` and registered in `main.py`.
- [ ] Authorization uses the verified JWT `sub`, never a caller-provided `user_id`.
  Internal endpoints require `X-Service-Token` on a private network.
- [ ] LaLiga tokens, vault secrets, and raw upstream error bodies are never returned;
  LaLiga bearers are never persisted in API storage or logged. Auth imports neither
  `fantasy_api` nor `fantasy_scraping`; scraping holds no LaLiga tokens.
- [ ] Write models use `extra="forbid"`; read models use `FlexibleModel`
  (`extra="allow"`). Unexpected upstream JSON raises `UpstreamError` (502).
- [ ] Every upstream path segment is encoded with `repositories/paths.py`
  (or `path_segment` in CLIs), and `playerTeamId` is distinguished from `playerId`.
- [ ] No Low-confidence or `api-fantasy.llt-services.com` routes are proxied.
  Buyout increases use `POST /buyout/.../increase`, not the legacy PUT route.
- [ ] Automated CLIs and `fantasy-browser-session` do not place bids, pay or increase
  clauses, or activate shields. Scraping CLIs preserve robots rules and rate limits
  and do not place Fantasy bids.

### Code quality and validation

- [ ] Python changes target Python 3.14, follow PEP 8, pass black and ruff,
  and keep lines within 100 characters.
- [ ] Public Python APIs have type hints; public methods and classes have Google
  docstrings; private helpers have one-line docstrings. Request and response models
  use Pydantic, and no mutable default arguments are introduced.
- [ ] Python tests follow `{method_name}_{state_under_test}_{expected_behavior}`,
  Arrange-Act-Assert, and the required Mocks/fixtures/helpers, Happy path,
  Error paths, and Edge cases sections from `AGENTS.md`.
- [ ] LaLiga route tests use `httpx.MockTransport` and cover upstream URLs and headers,
  missing JWT, `needs_reauth`, sanitized Fantasy non-2xx errors, unexpected shapes
  and non-JSON 200 responses (502), and extra or incomplete write bodies (422).
- [ ] Applicable backend checks pass:
  `cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80`
  and `cd backend/auth && uv run pytest`. Other affected services and frontend
  checks are documented above with their results.

### Contracts and documentation

- [ ] API route or schema changes include regenerated `backend/api/openapi.json`
  and `docs/api/endpoint-schemas.md`, using `uv run poe generate-openapi` and
  `uv run poe generate-endpoint-schemas`. The schema documentation was not hand-edited.
- [ ] Scraping route or schema changes include regenerated
  `backend/scraping/openapi.json`, using `uv run poe generate-scraping-openapi`.
- [ ] The feature README is updated; new domains are added to the architecture domain
  table; CLI or browser-session changes are reflected in the service READMEs.
