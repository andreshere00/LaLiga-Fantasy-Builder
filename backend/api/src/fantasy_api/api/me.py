"""Example protected routes using the cross-service auth contract."""

from __future__ import annotations

from fastapi import APIRouter, Header
from pydantic import BaseModel

from fantasy_api.api.deps import get_container, get_current_user

router = APIRouter(tags=["me"])


class MeResponse(BaseModel):
    """Public view of the authenticated API caller."""

    user_id: str
    email: str | None = None
    name: str | None = None


class LaligaCredentialProbeResponse(BaseModel):
    """Probe that auth returned a LaLiga bearer (token redacted)."""

    user_id: str
    has_bearer: bool
    expires_at: int


@router.get("/me", response_model=MeResponse)
async def me(
    authorization: str | None = Header(default=None),
) -> MeResponse:
    """Return the authenticated user from the internal JWT.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Public user fields (no tokens).
    """
    user, _token = await get_current_user(authorization)
    return MeResponse(user_id=user.user_id, email=user.email, name=user.name)


@router.get("/laliga/credential-probe", response_model=LaligaCredentialProbeResponse)
async def laliga_credential_probe(
    authorization: str | None = Header(default=None),
) -> LaligaCredentialProbeResponse:
    """Fetch a LaLiga bearer via auth without exposing the token.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Redacted credential probe for the JWT subject.
    """
    user, token = await get_current_user(authorization)
    bearer = await get_container().credentials.get_laliga_bearer(token)
    return LaligaCredentialProbeResponse(
        user_id=user.user_id,
        has_bearer=bool(bearer.bearer_token),
        expires_at=bearer.expires_at,
    )
