"""Download verified, local fallback badges from football-logos.cc's public pages."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "frontend/public/badges/football-logos"
MANIFEST = ROOT / "frontend/src/api/footballLogoFallbacks.json"


def fetch(url: str, referer: str) -> bytes:
    """Read a public logo resource using the source page's download headers."""
    request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": referer})
    with urlopen(request, timeout=30) as response:
        return response.read(5_000_001)


def main() -> None:
    """Refresh the curated manifest and PNG files without guessing asset URLs."""
    entries = json.loads((ROOT / "assets/football_logo_sources.json").read_text())
    pages: dict[str, str] = {}
    manifest = []
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        source = entry["sourcePage"]
        country, slug = urlparse(source).path.strip("/").split("/")
        directory = f"https://football-logos.cc/{country}/"
        # Competition detail pages also publish the exact download/preview URLs.
        page = source if entry["kind"] == "competition" else directory
        if page not in pages:
            pages[page] = fetch(page, "https://football-logos.cc/").decode()
        pattern = (
            r"https://assets\.football-logos\.cc/logos/"
            + re.escape(country)
            + r"/(?:256x256|512x512)/"
            + re.escape(slug)
            + r"\.[a-z0-9]+\.png"
        )
        match = re.search(pattern, pages[page])
        if match is None:
            raise ValueError(f"No verified 256px asset on {page}: {slug}")
        asset_url = match.group()
        image = fetch(asset_url, source)
        if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) > 5_000_000:
            raise ValueError(f"Invalid PNG: {asset_url}")
        filename = f"{country}-{slug}.png"
        (DIRECTORY / filename).write_bytes(image)
        manifest.append(
            {
                **entry,
                "assetUrl": asset_url,
                "localPath": f"/badges/football-logos/{filename}",
                "sha256": hashlib.sha256(image).hexdigest(),
                "retrievedAt": datetime.now(UTC).date().isoformat(),
            }
        )
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified and installed {len(manifest)} local fallback badges.")


if __name__ == "__main__":
    main()
