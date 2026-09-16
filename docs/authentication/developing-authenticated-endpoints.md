# Developing authenticated endpoints

Choose the endpoint location from its responsibility:

- Add application features to `backend/api`.
- Add login, session, pairing, vault, or credential behavior to `backend/auth`.
- Keep direct access to encrypted LaLiga credentials inside auth.

## API endpoint using application identity

Use `get_current_user()` from `fantasy_api.api.deps`. It validates the
internal JWT and returns both the `AppUser` and raw token.

```python
from fastapi import APIRouter, Header
from pydantic import BaseModel

from fantasy_api.api.deps import get_current_user

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamListResponse(BaseModel):
    """Teams visible to the authenticated user."""

    owner_id: str
    team_ids: list[str]


@router.get("", response_model=TeamListResponse)
async def list_teams(
    authorization: str | None = Header(default=None),
) -> TeamListResponse:
    """Return teams belonging to the authenticated user.

    Args:
        authorization: Auth-issued internal Bearer JWT.

    Returns:
        User-scoped team identifiers.
    """
    user, _internal_jwt = await get_current_user(authorization)
    team_ids = await teams_service.list_for_owner(user.user_id)
    return TeamListResponse(owner_id=user.user_id, team_ids=team_ids)
```

The repository currently calls the dependency helper directly. If routes are
later converted to FastAPI `Depends`, apply that change consistently across
the API instead of mixing styles.

Never accept `owner_id` or `user_id` from the client for authorization. A path
ID may identify a resource, but repository queries must still scope that
resource to `user.user_id`.

```python
team = await teams_repo.get_for_owner(
    team_id=team_id,
    owner_id=user.user_id,
)
```

Return `404` or the project's chosen resource error if the scoped query finds
nothing. Do not first load by ID and compare after exposing resource details.

## API endpoint that calls LaLiga Fantasy

After validating the caller, forward the raw internal JWT only through the
leagues (or feature) service. The service asks auth for a bearer and calls
Fantasy. Auth uses its verified `sub` to select the connection.

For leagues specifically, follow
[Adding leagues endpoints](../api/leagues/adding-leagues-endpoints.md).
For players, follow
[Adding players endpoints](../api/players/adding-players-endpoints.md)
(catalog and market-value are public Fantasy reads and must not request a
bearer).

```python
from typing import Any

from fastapi import APIRouter, Header

from fantasy_api.api.deps import get_container, get_current_user

router = APIRouter(tags=["leagues"])


@router.get("/leagues/{league_id}/teams/{team_id}")
async def get_team(
    league_id: str,
    team_id: str,
    authorization: str | None = Header(default=None),
) -> Any:
    """Return a Fantasy team roster for the authenticated caller.

    Args:
        league_id: Fantasy league identifier.
        team_id: Fantasy team identifier.
        authorization: Auth-issued internal Bearer JWT.

    Returns:
        Upstream team JSON.

    Raises:
        NeedsReauthError: When the user must pair LaLiga again.
        UpstreamError: When auth or LaLiga is unavailable.
    """
    _user, internal_jwt = await get_current_user(authorization)
    return await get_container().leagues_service.get_team(
        internal_jwt,
        league_id,
        team_id,
    )
```

Rules for LaLiga-backed endpoints:

- Obtain the bearer for each logical request; do not persist it in API storage.
- Never return the bearer to the browser.
- Pass it only in the upstream `Authorization` header.
- Redact authorization headers and token values from logs and traces.
- Map auth's `needs_reauth` response to `NeedsReauthError`.
- Use async clients and timeouts for all network I/O.
- If LaLiga returns `401`, add a narrowly defined auth operation that invokes
  `CredentialProvider.retry_after_unauthorized()` and retry once. Never create
  an unbounded retry loop.

## Auth browser endpoint

Routes used directly by the browser belong in `fantasy_auth.api`.

For a safe read, resolve the session:

```python
from fastapi import APIRouter, Request

from fantasy_auth.api.deps import get_current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("")
async def get_preferences(request: Request) -> dict[str, str]:
    """Return preferences for the authenticated browser session."""
    user, _session = await get_current_user(request)
    return await preferences.get_for_user(user.user_id)
```

For any mutation, enforce CSRF and origin validation:

```python
from fastapi import APIRouter, Header, Request
from pydantic import BaseModel

from fantasy_auth.api.deps import require_csrf

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PreferenceUpdate(BaseModel):
    """Preference update request."""

    locale: str


@router.put("")
async def update_preferences(
    body: PreferenceUpdate,
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> dict[str, bool]:
    """Update preferences for the authenticated browser session."""
    user = await require_csrf(request, x_csrf_token)
    await preferences.update(user.user_id, body.locale)
    return {"ok": True}
```

When adding `PUT` or `PATCH`, also add that method to the auth CORS allow-list.

## Auth internal endpoint

Only add a private auth endpoint when API needs an operation that must remain
next to auth-owned secrets. Require both controls:

```python
require_service_token(x_service_token)
user = await require_internal_user(authorization)
```

The user must come from `require_internal_user()`. Do not add a `user_id`
request field. Return the minimum data needed and never return refresh tokens,
sealed blobs, vault keys, pairing secrets, or OIDC client secrets.

Document every new `/internal/*` route in the ingress/network policy.

## Registering routers

Create one router per cohesive feature and include it from the service's
`create_app()`:

```python
from fantasy_api.api import teams

app.include_router(teams.router)
```

Keep transport models in the API module and business logic in application
services. Put external HTTP behavior behind a typed client or protocol.

## Error handling

Raise specific domain errors and let service-level handlers serialize them.

In `backend/api`:

- `UnauthorizedError` for invalid internal JWTs;
- `NeedsReauthError` when LaLiga must be paired again;
- `UpstreamError` for auth or LaLiga failures.

In `backend/auth`:

- `SessionError` for session, CSRF, origin, or service-token failures;
- `ValidationError` for JWT or claim validation;
- `NeedsReauth` for unusable delegated credentials;
- `OwnershipError` for ownership violations;
- `ProviderError` for sanitized upstream failures.

Do not catch broad exceptions in route handlers. Never return upstream bodies
that may contain tokens or provider details.

## Testing checklist

Use pytest and the repository's test organization:

```python
# ---- Mocks, fixtures & helpers ---- #

# ---- Happy path ---- #

# ---- Error paths ---- #

# ---- Edge cases ---- #
```

Test names follow `{method_name}_{state_under_test}_{expected_behavior}`.
Each test follows Arrange–Act–Assert and covers one behavior.

For an application endpoint, cover:

- valid internal JWT;
- missing Bearer header;
- malformed, expired, wrong-issuer, wrong-audience, and bad-signature JWTs;
- resource ownership based on JWT `sub`;
- no token or sensitive data in the response.

For a LaLiga-backed endpoint, also cover:

- auth credentials client receives the same internal JWT;
- `X-Service-Token` is sent only server-to-server;
- `needs_reauth` mapping;
- sanitized auth and LaLiga failures;
- bearer values are absent from API responses and logs.

For an auth browser mutation, cover valid and invalid CSRF, bad origin, expired
session, and ownership.

Run checks in the affected package:

```bash
uv sync --all-extras
uv run black --check src tests
uv run ruff check src tests
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
uv run mypy src
uv run bandit -r src
```

Add missing development tools to the package's `pyproject.toml` before relying
on these commands in CI.
