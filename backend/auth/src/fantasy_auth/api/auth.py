"""App identity routes: login, callback, logout, me."""

from __future__ import annotations

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from fantasy_auth.api.deps import get_container, require_csrf
from fantasy_auth.domain.errors import SessionError

router = APIRouter(tags=["auth"])


def _set_session_cookies(
    response: Response,
    *,
    session_id: str,
    csrf_token: str,
) -> None:
    container = get_container()
    settings = container.settings
    response.set_cookie(
        key=settings.cookie_name,
        value=session_id,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.session_ttl_seconds,
        path="/",
    )


def _wants_html(accept: str | None) -> bool:
    """Return True when the Accept header asks for HTML."""
    return accept is not None and "text/html" in accept.lower()


def _clear_session_cookies(response: Response) -> None:
    settings = get_container().settings
    for key in (settings.cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(
            key,
            path="/",
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
        )


@router.get("/auth/login")
async def auth_login() -> RedirectResponse:
    """Start app OIDC login and set pending session cookies.

    Returns:
        Redirect to the app identity provider.
    """
    container = get_container()
    start = await container.sessions.start_login()
    response = RedirectResponse(url=start.authorize_url, status_code=302)
    _set_session_cookies(
        response,
        session_id=start.session_id,
        csrf_token=start.csrf_token,
    )
    return response


@router.get("/auth/callback")
async def auth_callback(
    request: Request,
    code: str,
    state: str,
) -> Response:
    """Complete app OIDC login from the IdP redirect.

    Browsers (``Accept: text/html``) are sent to ``FRONTEND_ORIGIN`` after the
    session cookies are set. Other clients still receive the JSON session view.

    Args:
        request: Incoming request (reads session cookie).
        code: Authorization code.
        state: OIDC state.

    Returns:
        Redirect for HTML clients, otherwise a JSON session view. Both set the
        rotated CSRF cookie.
    """
    container = get_container()
    session_id = request.cookies.get(container.settings.cookie_name)
    if not session_id:
        raise SessionError("missing session")
    view = await container.sessions.complete_login(
        session_id=session_id,
        code=code,
        state=state,
    )
    body = {
        "user": {
            "user_id": view.user.user_id,
            "email": view.user.email,
            "name": view.user.name,
        },
        "csrf_token": view.csrf_token,
    }
    if _wants_html(request.headers.get("accept")):
        from fantasy_auth.api.pairings import browser_landing_url

        response: Response = RedirectResponse(
            url=await browser_landing_url(session_id),
            status_code=302,
        )
    else:
        response = JSONResponse(content=body)
    _set_session_cookies(
        response,
        session_id=session_id,
        csrf_token=view.csrf_token,
    )
    return response


@router.post("/auth/logout")
async def auth_logout(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> Response:
    """Delete the server-side session and clear cookies.

    Requires CSRF when a session cookie is present. Without a session cookie
    the call is an idempotent success.

    Note:
        B2C ``/logout`` must still be visited separately to clear SSO cookies.
    """
    container = get_container()
    session_id = request.cookies.get(container.settings.cookie_name)
    if session_id:
        await require_csrf(request, x_csrf_token)
        await container.sessions.logout(session_id)
    response = JSONResponse(content={"ok": True})
    _clear_session_cookies(response)
    return response


@router.get("/auth/me")
async def auth_me(request: Request) -> dict:
    """Return the current app user and CSRF token.

    Returns:
        Public session view.
    """
    container = get_container()
    session_id = request.cookies.get(container.settings.cookie_name)
    if not session_id:
        raise SessionError()
    view = await container.sessions.get_me(session_id)
    return {
        "user": {
            "user_id": view.user.user_id,
            "email": view.user.email,
            "name": view.user.name,
        },
        "csrf_token": view.csrf_token,
    }
