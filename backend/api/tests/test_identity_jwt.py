"""Identity JWT wire-contract security and rotation tests."""

# ---- Mocks, fixtures & helpers ---- #
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fantasy_api.domain.errors import UnauthorizedError
from fantasy_api.security.internal_jwt import InternalJwtValidator


@pytest.fixture
def identity():
    key = Ed25519PrivateKey.generate()
    jwk = json.loads(jwt.algorithms.OKPAlgorithm.to_jwk(key.public_key()))
    jwk.update(kid="first", alg="EdDSA", use="sig")
    validator = InternalJwtValidator(
        jwks_url="https://identity.test/auth/jwks",
        issuer="https://app.test/auth",
        audience="fantasy-api",
    )
    validator._jwks_client.fetch_data = lambda: {"keys": [jwk]}
    now = int(time.time())
    claims = {
        "sub": "alice",
        "iss": "https://app.test/auth",
        "aud": "fantasy-api",
        "iat": now,
        "exp": now + 900,
    }
    return validator, key, claims


def sign(key, claims, kid="first"):
    return jwt.encode(claims, key, algorithm="EdDSA", headers={"kid": kid})


# ---- Happy path ---- #
def test_validate_identity_token_preserves_application_subject(identity):
    validator, key, claims = identity
    assert validator.validate(sign(key, claims))["sub"] == "alice"


# ---- Error paths ---- #
@pytest.mark.parametrize(
    "change",
    [
        {"sub": ""},
        {"sub": "   "},
        {"sub": None},
        {"sub": 123},
        {"iss": "https://legacy.test"},
        {"aud": "another-api"},
        {"exp": 1},
        {"iat": 1},
        {"iat": "1"},
        {"exp": None},
    ],
)
def test_validate_invalid_claims_rejected(identity, change):
    validator, key, claims = identity
    claims.update(change)
    with pytest.raises(UnauthorizedError, match="invalid application token"):
        validator.validate(sign(key, claims))


@pytest.mark.parametrize("claim", ["sub", "iat", "exp", "iss", "aud"])
def test_validate_missing_claim_rejected(identity, claim):
    validator, key, claims = identity
    del claims[claim]
    with pytest.raises(UnauthorizedError):
        validator.validate(sign(key, claims))


def test_validate_wrong_signature_unknown_key_and_algorithm_rejected(identity):
    validator, key, claims = identity
    for token in [
        sign(Ed25519PrivateKey.generate(), claims),
        sign(key, claims, "unknown"),
        jwt.encode(claims, "wrong-secret" * 4, algorithm="HS256"),
        "malformed",
    ]:
        with pytest.raises(UnauthorizedError):
            validator.validate(token)


def test_validate_jwks_outage_sanitized(identity):
    validator, key, claims = identity

    def unavailable():
        raise jwt.PyJWKClientConnectionError("private network detail")

    validator._jwks_client.fetch_data = unavailable
    with pytest.raises(UnauthorizedError, match="^invalid application token$"):
        validator.validate(sign(key, claims))


# ---- Edge cases ---- #
def test_validate_rotated_key_and_previous_key_during_grace(identity):
    validator, key, claims = identity
    replacement = Ed25519PrivateKey.generate()
    keys = []
    for kid, private in [("first", key), ("second", replacement)]:
        value = json.loads(jwt.algorithms.OKPAlgorithm.to_jwk(private.public_key()))
        value.update(kid=kid, alg="EdDSA", use="sig")
        keys.append(value)
    validator._jwks_client.fetch_data = lambda: {"keys": keys}
    assert validator.validate(sign(replacement, claims, "second"))["sub"] == "alice"
    assert validator.validate(sign(key, claims))["sub"] == "alice"
