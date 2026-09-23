# Agent instructions

Coding agents working in this repository should follow these rules. Deeper
guides live under [`docs/`](docs/README.md).

## Read before changing the API

1. [Architecture](docs/architecture.md) — auth vs API, CRS, trust boundaries.
2. [Adding endpoints](docs/api/adding-endpoints.md) — availability, auth, CLI,
   docs to update.
3. [Proxy endpoint pitfalls](docs/api/proxy-endpoint-pitfalls.md) — fail closed,
   read vs write schemas.
4. [Developing authenticated endpoints](docs/authentication/developing-authenticated-endpoints.md)
   — JWT `sub`, CSRF, internal routes.
5. The feature README for the domain you touch.

## Layout

| Service | Path | Port | Owns |
|---------|------|------|------|
| Frontend | `frontend` | 3000 | Lineup UI. Proxies `/auth`, `/laliga`, and `/api` |
| Auth | `backend/auth` | 8000 | Sessions, OIDC, LaLiga pairing, vault, internal JWT |
| API | `backend/api` | 8001 | Features; LaLiga via private bearer exchange |

```text
Browser → frontend origin
        → POST /auth/token (auth) → internal JWT in memory
        → /api/... with Bearer JWT
API     → GET /internal/laliga/bearer (auth, private) → LaLiga bearer
API     → Fantasy upstream with bearer → JSON (no tokens)
```

New LaLiga features go in `backend/api`: `api/` → `services/` →
`repositories/` → `clients/laliga_fantasy.py`. Wire a new domain on
`AppContainer` (`api/deps.py`) and register the router in `main.py`.

## Domains

| Domain | Prefix | Auth | Notes |
|--------|--------|------|-------|
| Leagues | `/leagues` | JWT + bearer | Reads |
| Teams | `/teams` | JWT + bearer | Lineup PUT is a full replace |
| Players | `/players` | Mixed | Catalog and market value are public |
| Calendar | `/calendar` | JWT; public upstream | No LaLiga bearer |
| Market | `/market` | JWT + bearer | Mutations medium confidence; CLI is read-only |
| Buyout | `/buyout` | JWT + bearer | Medium confidence; CLI is read-only |

`playerTeamId` is the squad-entry id. It is not interchangeable with master
`playerId`. Several upstream bodies name the field `playerId` and still expect
the squad-entry id (market listings, direct offers, shield activation).

Do not proxy a route marked **Low** confidence or hosted on
`api-fantasy.llt-services.com`. The legacy buyout increase
`PUT .../buyout/player` is not implemented; use
`POST /buyout/.../increase`.

## Security

- Authorize from the verified JWT `sub`. Never accept a caller `user_id`.
- Do not return LaLiga tokens, vault secrets, or raw upstream error bodies.
- Do not persist the LaLiga bearer in API storage or log it.
- Do not expose `/internal/*` without `X-Service-Token` on a private network.
- Write models use `extra="forbid"`. Read models use `FlexibleModel`
  (`extra="allow"`). Unexpected JSON becomes `UpstreamError` (502), not `{}`
  or `[]`.
- Encode every path segment with `repositories/paths.py` (and `path_segment`
  in CLIs).
- Automated CLIs and `fantasy-browser-session` must not place bids, pay
  clauses, increase clauses, or activate shields. Auth must not import
  `fantasy_api`.

## Python

- Python 3.14, PEP 8, black, ruff. Lines at most 100 characters.
- Type hints on public APIs. Google docstrings on public methods and classes;
  one line on private helpers.
- Pydantic for request and response models. No mutable default arguments.
- Tests: `{method_name}_{state_under_test}_{expected_behavior}`,
  Arrange-Act-Assert, sections `# ---- Mocks, fixtures & helpers ---- #`,
  `# ---- Happy path ---- #`, `# ---- Error paths ---- #`,
  `# ---- Edge cases ---- #`.
- LaLiga route tests use `httpx.MockTransport`: upstream URL and headers,
  missing JWT, `needs_reauth`, Fantasy non-2xx with no bearer in the body,
  unexpected shape and non-JSON 200 → 502, write extras and incomplete bodies
  → 422.

```bash
cd backend/api && uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
cd backend/auth && uv run pytest
```

## After an API route or schema change

```bash
uv run poe generate-openapi
uv run poe generate-endpoint-schemas
```

Commit `backend/api/openapi.json` and `docs/api/endpoint-schemas.md`. Do not
hand-edit the schema doc. Update the feature README, the architecture domain
table when the domain is new, and the service READMEs when a CLI or
browser-session flow changes.
