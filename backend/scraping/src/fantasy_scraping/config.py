"""Process settings for the scraping HTTP service."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment for the private scraping process.

    Attributes:
        scraping_service_token: Shared secret the API sends as ``X-Service-Token``.
        debug: When true, an empty token is allowed so local probes can start.
        expose_docs: When true, serve Swagger at ``/docs`` without enabling debug
            probes.
        service_port: Port uvicorn binds inside the container.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    scraping_service_token: SecretStr = Field(default=SecretStr(""))
    debug: bool = False
    expose_docs: bool = Field(default=False, validation_alias="SCRAPING_EXPOSE_DOCS")
    service_port: int = Field(default=8002, validation_alias="SCRAPING_SERVICE_PORT")


def get_settings() -> Settings:
    """Load process settings from the environment.

    Returns:
        The settings object.
    """
    return Settings()
