# PR #4 review notes — Add teams endpoint

Source: [PR #4](https://github.com/andreshere00/LaLiga-Fantasy-Builder/pull/4)
(`feat/add-teams-endpoint` → `main`).

Decision from review: **comment** (not blocking). Architecture, JWT/bearer
invariants, path encoding, OpenAPI, and tests are in good shape. GitHub showed
no CI checks on the branch; 101 related tests passed locally.

This note lists remaining work only. Praise and “already done well” items are
omitted.

---

## Important

Should be addressed, or explicitly declined with a reason, before treating the
write path as finished.

### LFB-001 — `LineupWrite` forwards extra JSON keys upstream

`LineupWrite` subclasses `FlexibleModel` (`extra="allow"`). The controller then
dumps the model and sends it to Fantasy:

```python
payload = body.model_dump(mode="json", exclude_unset=True)
```

`extra="allow"` is appropriate for **read** passthrough. On **write**, any
undeclared key the client sends is included in that dump and forwarded with the
user’s LaLiga bearer (confused deputy).

**Fix:** `extra="forbid"` on the write model, or dump only declared fields.
Unknown keys should 422, not become an upstream PUT body.

**Where:** `backend/api/src/fantasy_api/schemas/teams.py`,
`backend/api/src/fantasy_api/api/teams.py`

### LFB-002 — Partial / empty lineup PUT is accepted

Every `LineupWrite` field is optional, so `PUT /teams/{id}/lineup` with `{}` or
only `{"goalkeeper": "pt-1"}` is valid and is proxied as a full replace. That
can wipe a live lineup.

The catalog’s base body is `goalkeeper`, `defender`, `midfield`, `striker`,
`tactical_formation`.

**Fix:** Require those base slots on the write model (list element types can
stay loose).

**Where:** `backend/api/src/fantasy_api/schemas/teams.py` (+ tests in
`backend/api/tests/test_teams.py`)

### LFB-003 — Empty-body `{}` applies to GET as well as PUT

Shared client logic:

```python
if not response.content:
    return {}
```

Correct for PUT 204. It also changes GET: an empty Fantasy body used to fail
JSON parse (502); now it becomes `{}`.

For money/lineup **objects** that is often desirable. For **list** routes that
share this client, `as_object_list({})` treats the object as a one-element
collection (`[{}]`), which can turn an empty leagues/standing payload into a
fake row.

**Fix:** Return `{}` only for PUT (or HTTP 204). Keep GET fail-closed unless
the route is known to be an object.

**Where:** `backend/api/src/fantasy_api/clients/laliga_fantasy.py`

### LFB-004 — PUT `team_id` is not bound to the JWT user

Authentication is JWT `sub` → auth bearer (correct; no client `user_id`).
Authorization for **which team** is entirely `team_id` + LaLiga.

Fine for GET (rival lineups/money are product behavior). PUT is a mutation, and
upstream lineup PUT is only medium-confidence. If LaLiga does not reject a
non-owned `team_id`, this API is a confused deputy.

**Fix (pick one):**

- Document that PUT ownership is enforced by Fantasy, not by this API; or
- Cheap check (team id from `GET /leagues`) before PUT if upstream writes are
  not trusted.

**Where:** `docs/api/teams/README.md`, optionally
`backend/api/src/fantasy_api/services/teams.py`

---

## Nits

Nice to have; not merge-blocking.

### LFB-005 — `coach` / `captain` / `bench` on the write schema

The upstream catalog still lists captain, bench, and coach as unverified.
Declaring them on `LineupWrite` makes them part of the public contract. Docs
already caveat this; extra keys would pass anyway today because of LFB-001.

If extras are forbidden (LFB-001), either drop these until verified or keep
them optional with the unofficial-client note.

**Where:** `backend/api/src/fantasy_api/schemas/teams.py`

### LFB-006 — `safe_json` swallows all exceptions

```python
try:
    data = response.json()
except Exception:
    return {}
```

`json.JSONDecodeError` (plus a dict check) is enough.

**Where:** `backend/api/src/fantasy_api/cli/common.py`

### LFB-007 — CLI `--week` has no `ge=1`

API lineup-by-week rejects `week < 1` with 422. The CLI accepts any `int` and
surfaces that as a generic API error.

**Where:** `backend/api/src/fantasy_api/cli/teams.py`

### LFB-008 — PR size and CI visibility

Diff is ~3.4k / −645, mostly `openapi.json`, tests, and docs. Feature code is
reasonable and already split into two commits. GitHub reported **no checks** on
`feat/add-teams-endpoint`.

**Fix:** Confirm Actions actually run on this PR.

### LFB-009 — CLI interpolates `team_id` into paths without encoding

`f"/teams/{tid}/money"` is fine for numeric ids. Odd characters could miss the
intended API route. The API itself encodes upstream segments correctly.

**Where:** `backend/api/src/fantasy_api/cli/teams.py`

---

## Refactors

Structural cleanups. Highest value first. The CRS split (controller → service →
repository → client) should stay; do not collapse `TeamsService`.

### R1 — Finish the CLI common extract (do in this PR if iterating)

`cli/common.py` already owns HTTP (`api_get`, token exchange, league/team id
helpers). `cli/teams.py` and `cli/leagues.py` still copy ~80 lines of
`--auth-base` / `--jwt` / `--session` / `--csrf` flags and the “missing
credentials → exchange token” flow.

**Extract:** `add_common_cli_args(parser)` + `resolve_jwt(args) -> str | None`.

**Where:** `backend/api/src/fantasy_api/cli/common.py`,
`cli/leagues.py`, `cli/teams.py`

### R2 — Split write schema from read `FlexibleModel` (pairs with LFB-001 / LFB-002)

Keep `TeamMoney` / `TeamLineup` / `LineupFormation` as `FlexibleModel`
(`extra="allow"`). Give `LineupWrite` its own config: `extra="forbid"` and
required base slots.

Same files, different contract for reads vs writes. Not a layer change.

**Where:** `backend/api/src/fantasy_api/schemas/teams.py`

### R3 — Scope empty-body handling to PUT/204 (pairs with LFB-003)

Keep `_request_json`; branch on method or status instead of treating every
empty body as `{}`.

**Where:** `backend/api/src/fantasy_api/clients/laliga_fantasy.py`

### R4 — CLI test HTTP stub helper (follow-up)

`_patch_client` / `_handler_map` are duplicated in `test_cli_teams.py` and
`test_cli_leagues.py`. Move next to CLI tests or a shared conftest.

**Where:** `backend/api/tests/test_cli_teams.py`,
`backend/api/tests/test_cli_leagues.py`

### R5 — API test fixtures (follow-up, noisy for this PR)

`rsa_pems`, `mint_internal_jwt`, and container builders are copied across
`test_teams.py`, `test_leagues.py`, and `test_api_auth.py`. A shared
`conftest.py` would shrink a lot of lines; better as a later cleanup.

**Where:** `backend/api/tests/`

### R6 — Do not do

- Do not extract more of the HTTP client, repositories, or routers.
  `paths.py`, `services/laliga.py`, `schemas/payload.py`, and `api/payload.py`
  are the right extracts.
- Do not collapse `TeamsService` / `LeaguesService` into a generic proxy.
  Thin `with_laliga_bearer` wrappers matching leagues are the intended shape.

---

## Suggested order if applying fixes

1. R2 + LFB-001 + LFB-002 (+ tests for extra keys and incomplete PUT body)
2. R3 + LFB-003 (+ GET empty-body stays 502 for list routes)
3. LFB-004 docs sentence (ownership delegated to Fantasy)
4. R1 CLI argparse extract
5. Nits LFB-005–LFB-007 as convenient
6. Leave R4 / R5 for a follow-up
