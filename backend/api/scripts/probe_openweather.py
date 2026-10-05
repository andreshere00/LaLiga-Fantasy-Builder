"""Probe OpenWeather current weather and the 5-day forecast.

Reads ``OPENWEATHER_API_KEY`` from ``backend/api/.env``, then
``backend/scraping/.env``. The key is never printed.

Usage (from ``backend/api``)::

    uv run python scripts/probe_openweather.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILES = (
    _REPO_ROOT / "backend" / "api" / ".env",
    _REPO_ROOT / "backend" / "scraping" / ".env",
)
_BASE_URL = "https://api.openweathermap.org"
# Camp Nou, the 2026/27 Barcelona ground used by player-stats weather.
_LAT = 41.3809
_LON = 2.1228
_TIMEOUT_SECONDS = 15.0


def _load_api_key() -> tuple[str, Path]:
    """Return the first configured key and the env file that held it."""
    for path in _ENV_FILES:
        key = _read_env_value(path, "OPENWEATHER_API_KEY")
        if key:
            return key, path
    searched = ", ".join(str(path) for path in _ENV_FILES)
    raise SystemExit(f"OPENWEATHER_API_KEY is empty in: {searched}")


def _read_env_value(path: Path, name: str) -> str:
    """Return one assignment from a dotenv file, or an empty string."""
    if not path.is_file():
        return ""
    prefix = f"{name}="
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or not line.startswith(prefix):
            continue
        value = line[len(prefix) :].strip().strip("'\"")
        return value
    return ""


def _call(client: httpx.Client, path: str, api_key: str) -> httpx.Response:
    """GET one OpenWeather path. The key stays in the query, not in logs."""
    return client.get(
        f"{_BASE_URL}{path}",
        params={
            "lat": str(_LAT),
            "lon": str(_LON),
            "units": "metric",
            "lang": "es",
            "appid": api_key,
        },
    )


def _summary(path: str, response: httpx.Response) -> dict[str, Any]:
    """Build a short report that never includes the API key."""
    body = _json_body(response)
    report: dict[str, Any] = {
        "path": path,
        "status": response.status_code,
    }
    if response.status_code != 200 or not isinstance(body, dict):
        report["error"] = _public_error(body, response)
        return report
    city = body.get("city")
    report["place"] = city.get("name") if isinstance(city, dict) else body.get("name")
    weather = body.get("weather")
    if isinstance(weather, list) and weather and isinstance(weather[0], dict):
        report["conditions"] = weather[0].get("description")
    main = body.get("main")
    if isinstance(main, dict):
        report["temp_c"] = main.get("temp")
    forecast = body.get("list")
    if isinstance(forecast, list):
        report["slots"] = len(forecast)
        report["first_slots"] = [_slot(item) for item in forecast[:3] if isinstance(item, dict)]
    return report


def _json_body(response: httpx.Response) -> Any:
    """Parse JSON, or return None when the body is not JSON."""
    try:
        return response.json()
    except ValueError:
        return None


def _public_error(body: Any, response: httpx.Response) -> str:
    """Return an error string with the key redacted."""
    if isinstance(body, dict):
        message = body.get("message")
        if isinstance(message, str) and message:
            return message.replace(response.request.url.params.get("appid", ""), "[redacted]")
    text = response.text.replace(response.request.url.params.get("appid", ""), "[redacted]")
    return text[:300]


def _slot(item: dict[str, Any]) -> dict[str, Any]:
    """Keep kickoff-relevant fields from one 3-hour forecast slot."""
    weather = item.get("weather")
    description = None
    if isinstance(weather, list) and weather and isinstance(weather[0], dict):
        description = weather[0].get("description")
    main = item.get("main")
    temp = main.get("temp") if isinstance(main, dict) else None
    return {"at": item.get("dt_txt"), "temp_c": temp, "conditions": description}


def main() -> None:
    """Call current weather and the forecast used by the API, then print both."""
    api_key, source = _load_api_key()
    print(f"key_source: {source}")
    print(f"key_length: {len(api_key)}")
    print(f"coordinates: {_LAT}, {_LON}")
    with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
        reports = [
            _summary(path, _call(client, path, api_key))
            for path in ("/data/2.5/weather", "/data/2.5/forecast")
        ]
    print(json.dumps(reports, indent=2, ensure_ascii=False))
    if any(report["status"] != 200 for report in reports):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
