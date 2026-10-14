"""Provider prose cannot change deterministic candidates or cite invented facts."""

# ---- Mocks, fixtures & helpers ---- #

import json
from pathlib import Path

import httpx
import pytest
from fantasy_api.config import Settings
from fantasy_api.schemas.lineup_builder import BuildResponse
from fantasy_api.services.lineup_builder_explanations import (
    DisabledExplanationProvider,
    OpenAIExplanationProvider,
)
from pydantic import SecretStr, ValidationError

ROOT = Path(__file__).resolve().parents[3]


def build() -> BuildResponse:
    """Load a shared exact-score candidate fixture."""
    return BuildResponse.model_validate(
        json.loads((ROOT / "contracts/lineup-builder-response.json").read_text())["payload"]
    )


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_explain_valid_structured_output_preserves_candidates() -> None:
    result = build()
    before = result.model_dump(mode="json")
    candidate = result.candidates[0].candidate_id
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        """Inspect bounded Responses payload with no tools or caller credentials."""
        body = json.loads(request.content)
        calls.append(body)
        assert "tools" not in body
        assert body["store"] is False
        assert "reasoning" not in body
        assert body["text"]["format"]["strict"] is True
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "explanations": [
                                            {
                                                "candidate_id": candidate,
                                                "text": "Published scores support this XI.",
                                                "evidence_ids": [],
                                            }
                                        ]
                                    }
                                ),
                            }
                        ]
                    }
                ],
            },
        )

    provider = OpenAIExplanationProvider(
        Settings(
            _env_file=None,
            lineup_explanations_enabled=True,
            lineup_explanation_model="configured-model",
            openai_api_key=SecretStr("secret"),
        ),
        transport=httpx.MockTransport(handler),
    )
    try:
        assert await provider.explain(result, None) == {
            candidate: "Published scores support this XI."
        }
        assert result.model_dump(mode="json") == before
        assert len(calls) == 1
    finally:
        await provider.aclose()


# ---- Error paths ---- #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        None,
        {},
        {"status": "incomplete"},
        {"status": "completed", "output": []},
        {
            "status": "completed",
            "output": [
                {
                    "content": [
                        {
                            "type": "output_text",
                            "text": (
                                '{"explanations":[{"candidate_id":"invented",'
                                '"text":"bad","evidence_ids":["unknown"]}]}'
                            ),
                        }
                    ]
                }
            ],
        },
    ],
)
async def test_explain_provider_failure_or_invented_reference_returns_unavailable(response) -> None:
    provider = OpenAIExplanationProvider(
        Settings(
            _env_file=None,
            lineup_explanations_enabled=True,
            lineup_explanation_model="configured-model",
            openai_api_key=SecretStr("secret"),
        ),
        transport=httpx.MockTransport(
            lambda _: httpx.Response(500 if response is None else 200, json=response)
        ),
    )
    try:
        assert await provider.explain(build(), None) == {}
    finally:
        await provider.aclose()


def test_settings_enabled_without_model_and_key_rejects_configuration() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, lineup_explanations_enabled=True)


# ---- Edge cases ---- #


@pytest.mark.asyncio
async def test_disabled_provider_and_unsupported_effort_never_call_api() -> None:
    disabled = DisabledExplanationProvider()
    assert await disabled.explain(build(), None) == {}
    await disabled.aclose()
    provider = OpenAIExplanationProvider(
        Settings(_env_file=None),
        transport=httpx.MockTransport(lambda _: pytest.fail("external call")),
    )
    try:
        assert await provider.explain(build(), "high") == {}
    finally:
        await provider.aclose()
