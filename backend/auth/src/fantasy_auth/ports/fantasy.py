"""Port for the unofficial LaLiga Fantasy HTTP API."""

from __future__ import annotations

from typing import Any, Mapping, Protocol


class FantasyClient(Protocol):
    """Minimal Fantasy API surface needed for ownership confirmation."""

    async def get_current_user(self, bearer_token: str) -> Mapping[str, Any]:
        """Fetch the authenticated manager profile.

        Args:
            bearer_token: LaLiga B2C bearer (access_token preferred).

        Returns:
            JSON body from ``GET /api/v4/user/me``.
        """
