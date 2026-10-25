"""Verify an actual Better Auth token in each independently installed Python service."""

import json
import sys

import jwt

try:
    from fantasy_auth.adapters.identity_jwt import IdentityJwtValidator as Validator
except ImportError:
    from fantasy_api.security.internal_jwt import InternalJwtValidator as Validator

fixture = json.loads(open(sys.argv[1]).read())
validator = Validator(
    jwks_url="https://identity.invalid/auth/jwks",
    issuer="http://localhost:3000/auth",
    audience="fantasy-api",
)
validator._jwks_client.fetch_data = lambda: fixture["jwks"]
assert validator.validate(fixture["token"])["sub"] == fixture["subject"]
assert jwt.get_unverified_header(fixture["token"])["alg"] == "EdDSA"
print("Better Auth Ed25519 JWT verified by", Validator.__module__)
