"""Shared httpx stubs for Fantasy Builder CLI tests."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest
from fantasy_api.cli import common as cli_common

RouteHandler = Callable[[httpx.Request], httpx.Response]
Routes = dict[tuple[str, str], Any]


def handler_map(routes: Routes) -> RouteHandler:
    """Build a mock transport handler from method/path → response mappings."""
    def handler(request: httpx.Request) -> httpx.Response:
        key = (request.method, request.url.path)
        if key not in routes:
            return httpx.Response(404, json={"error": f"missing {key}"})
        payload = routes[key]
        if callable(payload):
            response = payload(request)
            if not isinstance(response, httpx.Response):
                raise TypeError("route handler must return httpx.Response")
            return response
        return httpx.Response(200, json=payload)

    return handler


def patch_httpx_client(
    monkeypatch: pytest.MonkeyPatch,
    routes: Routes | RouteHandler,
) -> None:
    """Patch ``cli_common.httpx.Client`` with a mock transport."""
    handler = handler_map(routes) if isinstance(routes, dict) else routes
    transport = httpx.MockTransport(handler)
    real_client = httpx.Client

    def client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = transport
        kwargs.pop("timeout", None)
        return real_client(*args, timeout=30.0, **kwargs)

    monkeypatch.setattr(cli_common.httpx, "Client", client_factory)
