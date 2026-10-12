"""Synchronous client for the private scraper HTTP surface, used by the CLI."""

import os
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, ValidationError

from fantasy_scraping.api.schemas import ErrorResponse
from fantasy_scraping.scraper.errors import InvalidRequestError, ScrapingError
from fantasy_scraping.scraper.models import PlayerRoute
from fantasy_scraping.scraper.routes import ProbeResponse, ScrapePlayersResponse

TIMEOUT_S: float = 30
LOCAL_SUFFIXES: tuple[str, ...] = ("localhost", "127.0.0.1", "::1")
_RESPONSE_MODELS: dict[tuple[str, str], type[BaseModel]] = {
    ("GET", "/internal/scrape/routes"): PlayerRoute,
    ("POST", "/internal/scrape/players"): ScrapePlayersResponse,
    ("POST", "/internal/scrape/probe"): ProbeResponse,
}


class RemoteError(ScrapingError):
    """Non-2xx answer from the scraper service, carrying its own category."""

    def __init__(self, category: str, detail: str) -> None:
        """Keep the remote ``{error, detail}`` pair.

        Args:
            category: Remote error name.
            detail: Remote fixed sentence.
        """
        super().__init__(detail)
        self.category = category  # type: ignore[misc]


def _check_url(url: str) -> str:
    """Require https, or http for local and private-network hosts only."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    private = host in LOCAL_SUFFIXES or "." not in host or host.startswith(("10.", "192.168."))
    if parts.scheme == "https" or (parts.scheme == "http" and private):
        return url.rstrip("/")
    raise InvalidRequestError("service url must be https or a private host")


class RemoteScraper:
    """Calls ``/internal/scrape/*`` with the token from ``SCRAPING_SERVICE_TOKEN``."""

    def __init__(self, base_url: str, transport: httpx.BaseTransport | None = None) -> None:
        """Validate the URL and read the token from the environment.

        Args:
            base_url: Service origin, for example ``http://localhost:8002``.
            transport: Optional transport, used by tests.

        Raises:
            InvalidRequestError: The URL is unsafe or the token is not set.
        """
        token = os.environ.get("SCRAPING_SERVICE_TOKEN", "")
        if not token:
            raise InvalidRequestError("SCRAPING_SERVICE_TOKEN is not set")
        self._http: httpx.Client = httpx.Client(
            base_url=_check_url(base_url),
            headers={"X-Service-Token": token},
            timeout=TIMEOUT_S,
            transport=transport,
        )

    def call(self, method: str, path: str, **kwargs: object) -> dict[str, object]:
        """Send one request and return the JSON body.

        Args:
            method: HTTP method.
            path: Path under the service origin.
            **kwargs: ``params`` or ``json`` for httpx.

        Returns:
            Decoded JSON body.

        Raises:
            RemoteError: The service answered non-2xx.
        """
        response_model = _RESPONSE_MODELS.get((method.upper(), path))
        if response_model is None:
            raise InvalidRequestError("unsupported scraper endpoint")
        try:
            response = self._http.request(method, path, **kwargs)  # type: ignore[arg-type]
        except httpx.HTTPError as exc:
            raise RemoteError("upstream_unavailable", "scraper service unreachable") from exc
        if response.is_success:
            try:
                validated = response_model.model_validate(response.json())
            except (ValueError, ValidationError):
                raise RemoteError(
                    "upstream_unavailable", "scraper service returned an unexpected response"
                ) from None
            return validated.model_dump(mode="json", by_alias=True)
        try:
            body = ErrorResponse.model_validate(response.json())
            raise RemoteError(body.error, body.detail or "scraper service request failed")
        except ValueError, KeyError, TypeError, ValidationError:
            raise RemoteError(
                "upstream_unavailable", f"scraper service answered {response.status_code}"
            ) from None

    def close(self) -> None:
        """Close the connection pool."""
        self._http.close()
