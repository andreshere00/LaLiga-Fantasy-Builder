"""Pydantic contracts for identity-provider and Fantasy HTTP responses."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr
from pydantic.alias_generators import to_camel


class ProviderReadModel(BaseModel):
    """Provider response base that retains documented extension fields."""

    model_config = ConfigDict(extra="allow")


class B2CTokenResponse(ProviderReadModel):
    """OAuth token response accepted from LaLiga B2C."""

    access_token: StrictStr | None = None
    id_token: StrictStr | None = None
    refresh_token: StrictStr | None = None
    token_type: StrictStr | None = None
    expires_in: StrictInt | StrictStr | None = None
    expires_on: StrictInt | StrictStr | None = None
    id_token_expires_in: StrictInt | StrictStr | None = None
    refresh_token_expires_in: StrictInt | StrictStr | None = None
    client_id: StrictStr | None = None
    policy: StrictStr | None = None
    scope: StrictStr | None = None


class AppOidcTokenResponse(ProviderReadModel):
    """Authorization-code response from the application's OIDC provider."""

    id_token: StrictStr
    access_token: StrictStr | None = None
    refresh_token: StrictStr | None = None
    token_type: StrictStr | None = None
    expires_in: StrictInt | None = None


class FantasyManagerProfile(ProviderReadModel):
    """Known public fields returned by LaLiga ``GET /api/v4/user/me``."""

    model_config = ConfigDict(
        extra="allow",
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: StrictStr | StrictInt | None = None
    user_id: StrictStr | StrictInt | None = None
    manager_id: StrictStr | StrictInt | None = None
    username: StrictStr | None = None
    manager_name: StrictStr | None = None
    display_name: StrictStr | None = None
    name: StrictStr | None = None
    avatar: StrictStr | None = None
