# Adding API endpoints

Use this for every new or extended Fantasy Builder API route.

1. Review documentation for **availability** and **authentication**.
2. Implement **controller → service → repository** (CRS).
3. Expose the route through a **CLI** that can run with **automated login**.
4. Update the **docs** that describe availability, auth, and the new route.

Auth vs API ownership, CSRF, and JWT `sub` scoping:
[Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md).
Contract pitfalls:
[Proxy endpoint pitfalls](proxy-endpoint-pitfalls.md).
Feature notes: [leagues](leagues/README.md), [teams](teams/README.md),
[players](players/README.md), [calendar](calendar/README.md).

---

## 1. Review documentation first

Do not guess an upstream path or auth mode.

| Question | Where to look |
|----------|----------------|
| Does Fantasy expose this, and at what confidence? | [Upstream catalog](../../.cursor/skills/developing-endpoints/upstream-api-reference.md) |
| Already proxied? | Feature READMEs, [`openapi.json`](../../backend/api/openapi.json) |
| Public or authenticated? | Catalog **Public** vs **Authenticated** tables |
| Identifiers? | `playerId` vs `playerTeamId`, `leagueId`, `teamId`, `week`, `page` |
| Mutation vs read? | Catalog “Responsible use”; no real bids/lineup PUT in tests |
| App-only (no LaLiga)? | [Architecture](../architecture.md) — still CRS, app storage |

**Stop** if the catalog lists the feature under “without confirmed upstream
route”, marks it **Low** confidence with contradictory sources, or the path is
the legacy host `api-fantasy.llt-services.com`.

| Mode | Controller | Service | CLI |
|------|------------|---------|-----|
| Public Fantasy read | No `get_current_user` | Repository, **no** bearer | JWT optional |
| Authenticated Fantasy | `get_current_user` → `internal_jwt` | `with_laliga_bearer(...)` | JWT + pair LaLiga |
| Mixed (e.g. players) | Public and auth on one router | Direct repo vs bearer | Public skips `resolve_jwt` |

Public GETs stay off Bearer security in OpenAPI; authenticated routes use
`responses=ERROR_RESPONSES`.

---

## 2. Controller–service–repository

Do not put HTTP, path building, or bearer fetch in the controller. Do not skip
the service or repository.

```text
api/<feature>.py              # auth header, parse, respond
services/<feature>.py         # JWT → optional bearer → repository
repositories/<feature>.py     # encoded Fantasy (or app) paths
clients/laliga_fantasy.py     # shared HTTP
schemas/<feature>.py
```

Reuse: `repositories/paths.py`, `services/laliga.py` (`with_laliga_bearer`),
`schemas/payload.py` / `api/payload.py`, one `LaligaFantasyClient` per worker.

- **Existing domain:** add repo + service + schema + route on the current
  router. `AppContainer` already holds the service.
- **New LaLiga domain:** same modules, wire in `api/deps.py`, register in
  `main.py`, add an OpenAPI tag.
- **App-only:** same modules; repository uses app storage. Scope queries to
  JWT `sub`. Never accept caller `user_id`.

Layer rules: controller has no `httpx`; service never logs/returns the bearer;
repository encodes every path segment. Reads use `FlexibleModel` /
`extra="allow"` (unexpected JSON → 502, not `{}` / `[]`). Writes use a
separate model (`extra="forbid"`, required fields for full-replace). Browser
writes need the method on the **API** CORS allow-list.

---

## 3. CLI with automated authentication

### Domain CLI (`backend/api`)

Extend `fantasy_api.cli.<feature>` with `add_common_cli_args`, `resolve_jwt`,
`api_get`, `path_segment` from `cli/common.py`. Register the script in
`backend/api/pyproject.toml`. Public reads omit JWT. Fail fast on missing
files and placeholder ids **before** login.

### Automated login (`backend/auth`)

```bash
cd backend/auth
uv sync --extra browser
uv run playwright install chromium
uv run fantasy-browser-session --exports
uv run fantasy-browser-session leagues-analysis --json
```

Repo wrapper: `./scripts/fantasy-browser-session.sh`. Keycloak is `demo` /
`demo`. LaLiga pairing opens the system browser (Google SSO); the native
callback is captured automatically — never paste `authredirect://`. `--no-pair`
only for public-only flows.

New authenticated bundle: `session_analysis.py` + `browser_session/args.py` +
`flows.py`. Do not import `fantasy_api` from auth. Do not implement LaLiga ROPC.

---

## 4. Documentation to update

| When | Update |
|------|--------|
| Any route | Feature README routes table (method, path, upstream, auth, model) |
| New domain | Architecture domain table; `docs/api/README.md` index |
| LaLiga proxy | Catalog “implemented in this repo” |
| Analysis subcommand | `backend/auth/README.md` |
| Always | `uv run poe generate-openapi` |

Do not add a per-domain “adding-*-endpoints” how-to; unique notes belong in
the feature README.

---

## Checklist

```text
- [ ] Catalog + feature docs reviewed (availability, auth, identifiers)
- [ ] Repository method (encoded path, client call)
- [ ] Service method (bearer only when upstream requires it)
- [ ] Schema + controller (OpenAPI, errors, public vs JWT)
- [ ] Container + router (new domain only)
- [ ] Tests: URL/headers, JWT, needs_reauth, upstream errors, no bearer leak
- [ ] Domain CLI + browser-session for authenticated use
- [ ] Feature README, catalog/architecture if needed, OpenAPI
```
