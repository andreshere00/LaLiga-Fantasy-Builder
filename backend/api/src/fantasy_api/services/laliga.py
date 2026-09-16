"""Shared LaLiga bearer orchestration for Fantasy-backed services."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fantasy_api.clients.auth_credentials import AuthCredentialsClient


async def with_laliga_bearer[T](
    credentials: AuthCredentialsClient,
    internal_jwt: str,
    method: Callable[..., Awaitable[T]],
    *args: object,
) -> T:
    """Fetch a short-lived LaLiga bearer and invoke a repository method.

    Args:
        credentials: Auth private credentials client.
        internal_jwt: Auth-issued internal access token.
        method: Repository callable whose first argument is the bearer.
        *args: Remaining arguments forwarded to ``method``.

    Returns:
        Result of ``method(bearer_token, *args)``.
    """
    bearer = (await credentials.get_laliga_bearer(internal_jwt)).bearer_token
    return await method(bearer, *args)
