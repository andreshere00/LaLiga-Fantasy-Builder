# Proxy endpoint pitfalls

Lessons from code review on the **leagues** ([PR #2](https://github.com/andreshere00/LaLiga-Fantasy-Builder/pull/2))
and **teams** ([PR #4](https://github.com/andreshere00/LaLiga-Fantasy-Builder/pull/4))
features. Use this when adding or extending LaLiga-backed routes so the next
iteration does not repeat the same proxy, OpenAPI, CLI, and test gaps.

The CRS split (controller → service → repository → client) is correct — these
notes are about **contract and edge-case behavior**, not layer count.

---

## Core rule: fail closed on the proxy

A thin Fantasy proxy must not turn “we did not understand upstream” into a
successful empty payload. Clients cannot tell that apart from a legitimate empty
result (no activity on this page, rival team with sparse money, etc.).

**Do:** map unexpected shapes and non-JSON bodies to `UpstreamError` (502 or
forwarded Fantasy status) via shared parsers.

**Do not:** return `[]`, `{}`, or `model_validate({})` when the upstream body
is the wrong type.

### Pattern in code

Reuse the shared helpers in `fantasy_api.schemas` (leagues module today;
extract to `schemas/payload.py` when a third domain needs them):

| Helper | Use when |
|--------|----------|
| `as_object(data)` | Response must be a JSON object (`TeamDetail`, `TeamMoney`, …) |
| `as_object_list(data)` | Response is a list or wrapped list (`standing`, `teams`, …) |
| `summarize_leagues_payload(data)` | Probe/count paths that need ids without full models |

Controllers wrap parsers with `_parse_payload` / `parse_payload` so
`ValueError` becomes `UpstreamError` — see `api/leagues.py` and `api/payload.py`.

**Tests to add:** non-dict object route, non-list list route, `200` with HTML or
plain text body, wrapped list (`{"data": [...]}`) on both HTTP routes and probes.

---

## HTTP client (`LaligaFantasyClient`)

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Uncaught `JSONDecodeError` | FastAPI 500 instead of `UpstreamError` | Catch `json.JSONDecodeError` on every success path (`get_json`, `put_json`, …) |
| Empty body on all methods | GET `{}` poisons list routes; fake rows via `as_object_list({})` | Return `{}` only for **PUT** or **HTTP 204**; GET with empty body → 502 |
| New client per request | High TLS/handshake cost when CLI hits many API routes | One `httpx.AsyncClient` per `LaligaFantasyClient` / `AuthCredentialsClient` instance (reuse in container) |

Auth’s credentials client should follow the same JSON rules on success paths.

---

## Read vs write Pydantic models

| Concern | Read models | Write models |
|---------|-------------|--------------|
| Unknown upstream fields | `FlexibleModel` / `extra="allow"` | `extra="forbid"` — unknown keys → **422**, not forwarded upstream |
| Optional vs required | Most fields optional (sparse rival payloads) | Require fields Fantasy treats as a **full replace** (e.g. all lineup slots on PUT) |
| Unverified upstream fields | Document in docstring; preserve in reads | Omit from write schema until verified, or keep optional with an explicit “unofficial client” note |

**Confused deputy:** with `extra="allow"` on a write model, `model_dump()` forwards
undeclared JSON keys to Fantasy with the user’s bearer. That must never ship.

---

## Path parameters and encoding

Build repository paths with `repositories/paths.segment()` (or
`urllib.parse.quote(..., safe="")`). Numeric ids are not the only case — ids
with `/`, `?`, or `%` change the upstream path if interpolated raw.

Apply the same encoding in **CLIs** when building API paths (`cli/common.path_segment`).

---

## Mutations and authorization

- **Authentication:** JWT `sub` → auth bearer (never accept client `user_id`).
- **Authorization for resource id:** Fantasy may or may not reject writes to
  another user’s `team_id`. If the API does not verify ownership, **document**
  that ownership is delegated to Fantasy and tell clients to obtain ids from
  `GET /leagues` (or equivalent).

Do not assume upstream write paths are safe without verification or explicit docs.

---

## OpenAPI / Swagger

| Pitfall | Fix |
|---------|-----|
| Raw Google docstrings in Swagger (`Args:` / `Returns:` in description) | `build_openapi_schema` must call `enrich_operation_from_docstring` (see `openapi.py`) |
| Missing upstream status codes | `ERROR_RESPONSES` should include codes the handler actually returns (e.g. **503** when Fantasy 503 is forwarded) |
| Path text describes CLI behavior | `Path(description=...)` documents **this API** only (e.g. week is required here even if `fantasy-leagues` infers it) |
| Drift vs committed schema | Run `uv run poe generate-openapi` and commit `backend/api/openapi.json` |

Checklist: [OpenAPI / Swagger](openapi.md).

---

## Payload unwrapping consistency

If one code path unwraps `{ "data": [...] }` and another only unwraps `{ "leagues": [...] }`,
HTTP routes and probes will disagree (e.g. list returns rows, probe reports
`league_count: 0`).

**Do:** one shared unwrap (`as_object_list`, `_COLLECTION_WRAPPER_KEYS`) for
list-shaped Fantasy responses everywhere that shape matters.

---

## Sensitive fields

`FantasyLeague.token` (private league join code) is proxied on `GET /leagues`
while probes redact bearer tokens. If responses are logged or cached in a
browser, consider excluding join tokens the same way bearers are excluded.

---

## CLI helpers

| Pitfall | Fix |
|---------|-----|
| Duplicated `--jwt` / `--session` / token exchange in every CLI | `add_common_cli_args(parser)` + `resolve_jwt(args, command="fantasy-…")` in `cli/common.py` |
| `--week` accepts `0` while API uses `Path(ge=1)` | Mirror API bounds in CLI argparse (`type=_parse_week`, `ge=1`) |
| `safe_json` catches bare `Exception` | Catch `json.JSONDecodeError` only; non-dict JSON → `{}` |
| Manager rendered as `{...}` dict | Use `manager.get("managerName")` when `manager` is a mapping (`_manager_label`) |
| Duplicated MockTransport boilerplate in tests | Shared `tests/cli_http_stub.py`: `handler_map`, `patch_httpx_client` |

---

## Service layer

**Do:** thin services with `with_laliga_bearer` / `_call(internal_jwt, repo_method, …)`
— one place for bearer fetch, no logging or returning bearer.

**Do not:** collapse domain services into a generic proxy; keep
`LeaguesService`, `TeamsService`, etc. as separate orchestrators.

---

## Testing matrix (beyond happy path)

Minimum for a new LaLiga-backed route:

- [ ] Correct upstream URL, `Authorization`, `x-lang`
- [ ] Missing / malformed JWT
- [ ] Auth `needs_reauth` → `needs_reauth`
- [ ] Fantasy 401 / 5xx → sanitized `UpstreamError`; **no bearer in body**
- [ ] Unexpected payload shape → **502**, not empty 200
- [ ] Non-JSON 200 → **502**, not 500
- [ ] Wrapped list payload (if applicable)
- [ ] `Path(ge=…)` bounds for week, page, etc.
- [ ] Write route: extra keys → 422; incomplete body → 422 (full-replace semantics)
- [ ] Write route: empty upstream success body (PUT 204) if applicable
- [ ] JWT edge cases when touching auth-critical paths: expired, wrong `iss` /
  `aud`, missing `sub` (see
  [Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md))

Optional follow-ups (lower noise per PR): shared `conftest.py` for
`rsa_pems` / `mint_internal_jwt` / container builders across `test_leagues.py`,
`test_teams.py`, `test_api_auth.py`.

---

## Pre-merge checklist

1. **Proxy:** no silent `{}` / `[]` on bad upstream shape; JSON errors → `UpstreamError`.
2. **Write:** separate write schema; `extra="forbid"`; required fields match Fantasy replace semantics.
3. **Client:** empty body handling scoped to PUT/204; shared async client reused.
4. **Paths:** encode all path segments in repository and CLI.
5. **OpenAPI:** regenerate `openapi.json`; spot-check `/docs` (summary, params, error codes).
6. **Docs:** ownership / sensitive fields / unofficial write fields called out in route or feature README.
7. **CLI:** common auth args; validation matches API; path encoding.
8. **CI:** GitHub Actions (or pre-commit) runs lint + tests on the PR branch.

---

## Related docs

- [Adding leagues endpoints](leagues/adding-leagues-endpoints.md)
- [OpenAPI / Swagger](openapi.md)
- [Developing authenticated endpoints](../authentication/developing-authenticated-endpoints.md)
- Agent skill: `.cursor/skills/developing-endpoints/SKILL.md`
