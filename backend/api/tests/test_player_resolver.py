# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

import httpx
import pytest
from fantasy_api.domain.errors import NotFoundError
from fantasy_api.repositories.players import PlayersRepository
from fantasy_api.services.player_resolver import PlayerResolver
from test_container import build_test_container


@pytest.fixture
def rsa_pems() -> tuple[str, str]:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return private_pem, public_pem


# ---- Happy path ---- #


@pytest.mark.asyncio
async def test_resolve_known_player_returns_entry(rsa_pems: tuple[str, str]) -> None:
    _private, public = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[{"id": "4288", "nickname": "Raphinha", "teamId": 4, "name": "Raphinha"}],
        )

    container = build_test_container(
        public,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
    )
    resolver = PlayerResolver(
        PlayersRepository(container.laliga_client, competition_id=1),
        ttl_seconds=60,
    )
    player = await resolver.resolve("4288")
    assert player.nickname == "Raphinha"


# ---- Error paths ---- #


@pytest.mark.asyncio
async def test_resolve_unknown_player_raises_not_found(rsa_pems: tuple[str, str]) -> None:
    _private, public = rsa_pems

    def fantasy_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"id": "1", "nickname": "Other"}])

    container = build_test_container(
        public,
        fantasy_handler=httpx.MockTransport(fantasy_handler),
    )
    resolver = PlayerResolver(
        PlayersRepository(container.laliga_client, competition_id=1),
        ttl_seconds=60,
    )
    with pytest.raises(NotFoundError):
        await resolver.resolve("4288")
