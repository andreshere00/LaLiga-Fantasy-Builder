"""Determinism of a parsed page."""

import json
import os
import subprocess
import sys

from hypothesis import given, settings
from hypothesis import strategies as st
from support import FIXTURES, page

from fantasy_scraping.parser.hashing import canonical_json
from fantasy_scraping.parser.service import ParserService

HTML = (FIXTURES / "raphinha_laliga_26_27.html").read_text(encoding="utf-8")
SERVICE = ParserService()


def _json(html: str) -> str:
    payload = canonical_json(
        SERVICE.parse(page("raphinha_laliga_26_27.html", html=html)).futbolfantasy
    )
    data = json.loads(payload)
    data["meta"]["inputSha256"] = ""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def test_parse_whitespace_between_tags_keeps_json() -> None:
    mutated = HTML.replace("><", ">\n<")
    assert _json(HTML) == _json(mutated)


def test_parse_attribute_quotes_keep_json() -> None:
    mutated = HTML.replace('class="name"', "class='name'")
    assert _json(HTML) == _json(mutated)


def test_parse_html_comment_keeps_json() -> None:
    mutated = HTML.replace("<body>", "<body><!-- drift -->")
    assert _json(HTML) == _json(mutated)


def test_parse_extra_script_block_keeps_json() -> None:
    mutated = HTML.replace(
        "</body>",
        '<script type="text/javascript">window.__noise = 1;</script></body>',
    )
    assert _json(HTML) == _json(mutated)


@settings(derandomize=True, max_examples=4)
@given(st.sampled_from([" ", "\n", "\t"]))
def test_parse_intertag_whitespace_hypothesis_keeps_json(extra: str) -> None:
    mutated = HTML.replace("<h1>", f"<h1>{extra}")
    assert _json(HTML) == _json(mutated)


def test_content_hash_hash_seed_and_locale_are_stable() -> None:
    script = """
from datetime import UTC, datetime
from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser.service import ParserService
html = open("tests/parser/fixtures/futbolfantasy/raphinha_laliga_26_27.html",
    encoding="utf-8").read()
page = ScrapedPage(
    source=Source.FUTBOLFANTASY,
    kind=PageKind.PLAYER,
    url="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27",
    fetched_at=datetime(2026, 10, 4, 12, 0, tzinfo=UTC),
    status_code=200,
    html=html,
    season="2026-27",
    player_slug="raphinha",
    season_slug="laliga-26-27",
)
print(ParserService().parse(page).content_hash)
"""
    hashes: list[str] = []
    for seed in ("0", "1", "4242"):
        for locale in ("C", "es_ES.UTF-8"):
            env = os.environ.copy()
            env["PYTHONHASHSEED"] = seed
            env["PYTHONPATH"] = "src"
            env["LC_ALL"] = locale
            completed = subprocess.run(
                [sys.executable, "-c", script],
                check=True,
                capture_output=True,
                text=True,
                env=env,
                cwd=".",
            )
            hashes.append(completed.stdout.strip())
    assert len(set(hashes)) == 1
