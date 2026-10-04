"""Service-token guard for private routes."""

import secrets
from typing import Annotated

from fastapi import Header, HTTPException, Request


def require_service_token(
    request: Request, x_service_token: Annotated[str | None, Header()] = None
) -> None:
    """Reject calls without the shared service token.

    Args:
        request: Current request, used to read the configured token.
        x_service_token: Value of the ``X-Service-Token`` header.

    Raises:
        HTTPException: 401 when the token is missing or wrong.
    """
    settings = request.app.state.settings
    expected = settings.scraping_service_token.get_secret_value()
    if settings.debug and not expected and not x_service_token:
        return
    if not x_service_token or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="invalid service token")
