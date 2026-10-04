"""Process settings for the scraping HTTP service."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment for the private scraping process.

    Attributes:
        scraping_service_token: Shared secret the API sends as ``X-Service-Token``.
        debug: When true, an empty token is allowed so local probes can start.
        service_port: Port uvicorn binds inside the container.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    scraping_service_token: SecretStr = Field(default=SecretStr(""))
    debug: bool = False
    service_port: int = Field(default=8002, validation_alias="SCRAPING_SERVICE_PORT")


def get_settings() -> Settings:
    """Load process settings from the environment.

    Returns:
        The settings object.
    """
    return Settings()
