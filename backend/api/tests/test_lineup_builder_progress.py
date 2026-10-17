"""Real authenticated progress routes and request-owned stream lifecycles."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fantasy_api.domain.errors import UpstreamError
from fantasy_api.schemas.lineup_builder import BuildPreferences, BuildProgressEvent
from fantasy_api.services.lineup_builder import LineupBuilderService
from test_container import TEST_LALIGA_BEARER
from test_lineup_builder_api import _client
from test_lineup_builder_api import rsa_pems as builder_rsa_pems

# ---- Mocks, fixtures & helpers ---- #

PATH = "/lineup-builder/leagues/league/build/stream"


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    """Reuse local signing keys for authenticated integration tests."""
    return builder_rsa_pems.__wrapped__()


def _events(response) -> list[dict]:
    """Decode the JSON-lines transport independently from the implementation."""
    return [json.loads(line) for line in response.text.splitlines()]


# ---- Happy path ---- #


def test_stream_lineup_authenticated_returns_progress_then_result(rsa_pems) -> None:
    client, jwt, requests = _client(rsa_pems)
    with client:
        response = client.post(
            PATH, headers={"Authorization": f"Bearer {jwt}"}, json={"formations": ["4,4,2"]}
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["cache-control"] == "no-store"
    events = _events(response)
    progress = [event["progress"] for event in events if event["type"] == "progress"]
    percentages = [row["percent"] for row in progress]
    assert percentages == sorted(percentages)
    assert percentages[-1] == 100
    assert events[-1]["type"] == "result"
    assert len(events[-1]["result"]["candidates"][0]["starters"]) == 11
    assert sum(event["type"] == "result" for event in events) == 1
    assert all(request.method == "GET" for request in requests)
    assert TEST_LALIGA_BEARER not in response.text


def test_build_progress_player_evaluations_counts_exclusions(rsa_pems) -> None:
    client, jwt, _ = _client(rsa_pems, stats_failure="profile")
    updates = []
    service = client.app.state.container.lineup_builder_service
    original = service.build

    async def observe(*args, **kwargs):
        """Record every callback rather than only coalesced transport updates."""
        callback = kwargs["on_progress"]

        def record(progress):
            updates.append(progress)
            callback(progress)

        return await original(*args, **{**kwargs, "on_progress": record})

    service.build = observe
    with client:
        response = client.post(PATH, headers={"Authorization": f"Bearer {jwt}"}, json={})
    counts = [update.completed_players for update in updates if update.stage == "players"]
    assert counts == list(range(12))
    assert all(update.total_players == 11 for update in updates if update.stage == "players")
    assert _events(response)[-1]["type"] == "error"
    assert all(update.percent < 100 for update in updates)


# ---- Error paths ---- #


def test_stream_lineup_missing_jwt_rejects_before_upstream(rsa_pems) -> None:
    client, _, requests = _client(rsa_pems)
    with client:
        response = client.post(PATH, json={})
    assert response.status_code == 401
    assert requests == []


@pytest.mark.parametrize("body", [{"user_id": "other"}, {"sources": []}])
def test_stream_lineup_invalid_preferences_rejects_before_upstream(rsa_pems, body) -> None:
    client, jwt, requests = _client(rsa_pems)
    with client:
        response = client.post(PATH, headers={"Authorization": f"Bearer {jwt}"}, json=body)
    assert response.status_code == 422
    assert requests == []


@pytest.mark.parametrize(
    "options,code,status",
    [
        ({"auth_error": True}, "needs_reauth", 401),
        ({"upstream_status": 500}, "fantasy_error", 500),
        ({"malformed_json": True}, "fantasy_error", 502),
        ({"standings_failure": True}, "standings_unavailable", 503),
    ],
)
def test_stream_lineup_source_failure_emits_sanitized_terminal_error(
    rsa_pems, options, code, status
) -> None:
    client, jwt, _ = _client(rsa_pems, **options)
    with client:
        response = client.post(PATH, headers={"Authorization": f"Bearer {jwt}"}, json={})
    events = _events(response)
    assert events[-1]["type"] == "error"
    assert events[-1]["error"] == code
    assert events[-1]["status"] == status
    assert all(event["type"] != "result" for event in events)
    assert TEST_LALIGA_BEARER not in response.text


def test_stream_lineup_other_league_returns_no_result(rsa_pems) -> None:
    client, jwt, _ = _client(rsa_pems)
    with client:
        response = client.post(
            PATH.replace("/league/", "/other/"),
            headers={"Authorization": f"Bearer {jwt}"},
            json={},
        )
    assert _events(response)[-1] == {
        "type": "error",
        "status": 404,
        "error": "not_found",
        "diagnostics": [],
    }


# ---- Edge cases ---- #


async def test_stream_closed_cancels_source_work_and_releases_capacity() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def snapshot(*args, **kwargs):
        """Remain in source work until the client closes the stream."""
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    service = LineupBuilderService(SimpleNamespace(snapshot=snapshot))
    stream = service.stream("jwt", "league", BuildPreferences())
    first = await anext(stream)
    await started.wait()
    assert isinstance(first.root, BuildProgressEvent)
    await stream.aclose()
    assert cancelled.is_set()
    assert service._active == 0


async def test_stream_unexpected_error_does_not_expose_exception_message() -> None:
    repository = SimpleNamespace(snapshot=AsyncMock(side_effect=ValueError("secret-token")))
    service = LineupBuilderService(repository)
    events = [event.model_dump() async for event in service.stream("jwt", "l", BuildPreferences())]
    assert events[-1]["error"] == "builder_failed"
    assert "secret-token" not in json.dumps(events)
    assert service._active == 0


async def test_stream_busy_emits_terminal_error_without_starting_sources() -> None:
    repository = SimpleNamespace(snapshot=AsyncMock(side_effect=UpstreamError("unused")))
    service = LineupBuilderService(repository)
    service._active = 2
    events = [event.model_dump() async for event in service.stream("jwt", "l", BuildPreferences())]
    assert events == [{"type": "error", "status": 429, "error": "builder_busy", "diagnostics": []}]
    repository.snapshot.assert_not_awaited()


async def test_stream_http_disconnect_delivers_early_progress_and_cancels_build(rsa_pems) -> None:
    client, jwt, _ = _client(rsa_pems)
    disconnected = asyncio.Event()
    source_cancelled = asyncio.Event()
    first_chunk = asyncio.get_running_loop().create_future()
    request_sent = False

    async def snapshot(*args, **kwargs):
        """Block source completion so progress must arrive before any result."""
        try:
            await asyncio.Event().wait()
        finally:
            source_cancelled.set()

    service = client.app.state.container.lineup_builder_service
    service._repository = SimpleNamespace(snapshot=snapshot)

    async def receive():
        """Deliver the request then a controlled browser disconnect."""
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": b"{}", "more_body": False}
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        """Observe actual ASGI chunks without a buffering HTTP test transport."""
        if message["type"] == "http.response.body" and message.get("body"):
            if not first_chunk.done():
                first_chunk.set_result(json.loads(message["body"]))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": PATH,
        "raw_path": PATH.encode(),
        "query_string": b"",
        "headers": [
            (b"authorization", f"Bearer {jwt}".encode()),
            (b"content-type", b"application/json"),
        ],
        "server": ("testserver", 80),
        "client": ("testclient", 1234),
        "root_path": "",
    }
    with client:
        request = asyncio.create_task(client.app(scope, receive, send))
        try:
            chunk = await asyncio.wait_for(first_chunk, timeout=2)
            assert chunk["type"] == "progress"
            assert service._active == 1
        finally:
            disconnected.set()
            await asyncio.wait_for(request, timeout=2)
    assert source_cancelled.is_set()
    assert service._active == 0
