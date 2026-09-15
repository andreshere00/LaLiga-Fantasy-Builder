"""Example protected routes using the cross-service auth contract."""

from __future__ import annotations

from fastapi import APIRouter, Header

from fantasy_api.api.deps import get_container, get_current_user
from fantasy_api.openapi import ERROR_RESPONSES
from fantasy_api.schemas.common import LaligaCredentialProbeResponse, MeResponse

router = APIRouter(tags=["me"])


@router.get(
    "/me",
    response_model=MeResponse,
    responses=ERROR_RESPONSES,
    summary="Get authenticated application user",
)
async def me(
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
) -> MeResponse:
    """Return the authenticated user from the internal JWT.

    Args:
        authorization: ``Bearer <internal JWT>``.

    Returns:
        Public user fields (no tokens).
    """
    user, _token = await get_current_user(authorization)
    return MeResponse(user_id=user.user_id, email=user.email, name=user.name)


@router.get(
    "/laliga/credential-probe",
    response_model=LaligaCredentialProbeResponse,
    responses=ERROR_RESPONSES,
    summary="Probe LaLiga bearer availability",
)
async def laliga_credential_probe(
    authorization: str | None = Header(
        default=None,
        description="Bearer internal JWT issued by auth ``POST /auth/token``.",
    ),
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
