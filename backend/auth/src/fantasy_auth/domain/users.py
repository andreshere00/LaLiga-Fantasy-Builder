"""User identity models for app sessions and LaLiga profiles."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class AppUser:
    """Authenticated application user (own IdP session).

    Attributes:
        user_id: Stable application subject identifier.
        email: Optional email from the app IdP.
        name: Optional display name from the app IdP.
    """

    user_id: str
    email: str | None = None
    name: str | None = None


@dataclass(frozen=True, slots=True)
class LaligaUser:
    """LaLiga Fantasy manager profile derived from JWT + ``/user/me``.

    Attributes:
        sub: OIDC subject from B2C.
        oid: Optional Azure OID claim.
        email: Email from JWT or API.
        name: Display name.
        given_name: Given name from JWT.
        family_name: Family name from JWT.
        idp: Identity provider claim (e.g. google.com).
        user_id: Fantasy manager ID from ``/api/v4/user/me``.
        username: Manager username.
        display_name: Preferred display name.
        manager_name: Fantasy manager name.
        avatar: Profile image URL when present.
        authenticated: Always True when a bundle was accepted.
    """

    authenticated: bool = True
    sub: str | None = None
    oid: str | None = None
    email: str | None = None
    name: str | None = None
    given_name: str | None = None
    family_name: str | None = None
    idp: str | None = None
    user_id: str | None = None
    username: str | None = None
    display_name: str | None = None
    manager_name: str | None = None
    avatar: str | None = None


@dataclass(frozen=True, slots=True)
class ConnectionStatus:
    """Public status of a user's LaLiga connection (no secrets).

    Attributes:
        linked: Whether sealed tokens exist for the user.
        needs_reauth: Whether refresh failed and re-pairing is required.
        manager_id: Fantasy manager ID when known.
        manager_name: Fantasy manager name when known.
    """

    linked: bool
    needs_reauth: bool = False
    manager_id: str | None = None
    manager_name: str | None = None


def extract_app_user_from_claims(claims: Mapping[str, Any]) -> AppUser:
    """Map validated app IdP claims to an ``AppUser``.

    Args:
        claims: Decoded and verified JWT payload.

    Returns:
        Application user identity.

    Raises:
        ValueError: When ``sub`` is missing.
    """
    sub = claims.get("sub")
    if not sub:
        raise ValueError("id_token missing sub")
    return AppUser(
        user_id=str(sub),
        email=str(claims["email"]) if claims.get("email") else None,
        name=str(claims["name"]) if claims.get("name") else None,
    )


def extract_user_from_claims(claims: Mapping[str, Any]) -> LaligaUser:
    """Map validated JWT claims to a ``LaligaUser``.

    Ports ``extractUserFromTokens`` but assumes claims were already validated.

    Args:
        claims: Decoded and verified JWT payload.

    Returns:
        Partial LaLiga user from identity claims only.
    """
    return LaligaUser(
        email=claims.get("email") or claims.get("unique_name"),
        name=claims.get("name") or claims.get("given_name"),
        given_name=claims.get("given_name"),
        family_name=claims.get("family_name"),
        sub=claims.get("sub"),
        oid=claims.get("oid"),
        idp=claims.get("idp"),
        authenticated=True,
    )


def merge_jwt_with_profile(
    jwt_user: LaligaUser,
    api_user: Mapping[str, Any],
) -> LaligaUser:
    """Merge Fantasy ``/user/me`` fields onto JWT-derived identity.

    Ports ``fetchCurrentUserProfile`` merge semantics.

    Args:
        jwt_user: User built from validated JWT claims.
        api_user: JSON body from ``GET /api/v4/user/me``.

    Returns:
        Merged LaLiga user with Fantasy profile fields.
    """
    manager_id = (
        api_user.get("id")
        or api_user.get("userId")
        or api_user.get("managerId")
    )
    username = (
        api_user.get("username")
        or api_user.get("managerName")
        or api_user.get("name")
        or api_user.get("displayName")
    )
    display_name = (
        api_user.get("displayName")
        or api_user.get("managerName")
        or api_user.get("username")
        or api_user.get("name")
        or jwt_user.name
    )
    manager_name = (
        api_user.get("managerName")
        or api_user.get("displayName")
        or api_user.get("username")
        or api_user.get("name")
    )

    return replace(
        jwt_user,
        user_id=str(manager_id) if manager_id is not None else jwt_user.user_id,
        username=str(username) if username is not None else jwt_user.username,
        display_name=str(display_name) if display_name else jwt_user.display_name,
        manager_name=str(manager_name) if manager_name else jwt_user.manager_name,
        avatar=(
            str(api_user.get("avatar") or api_user.get("profileImage"))
            if (api_user.get("avatar") or api_user.get("profileImage"))
            else jwt_user.avatar
        ),
        email=jwt_user.email or (
            str(api_user["email"]) if api_user.get("email") else None
        ),
        name=(
            str(manager_name)
            if manager_name
            else jwt_user.name
        ),
        given_name=jwt_user.given_name or (
            str(api_user["firstName"]) if api_user.get("firstName") else None
        ),
        family_name=jwt_user.family_name or (
            str(api_user["lastName"]) if api_user.get("lastName") else None
        ),
    )
