"""Offline fantasy-parse CLI."""

from fantasy_scraping.parser.cli import main
from support import FIXTURES

HTML = FIXTURES / "raphinha_laliga_26_27.html"
ARGS = [
    str(HTML),
    "--url",
    "https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27",
    "--slug",
    "raphinha",
    "--season",
    "2026-27",
    "--season-slug",
    "laliga-26-27",
    "--fetched-at",
    "2026-10-04T12:00:00+00:00",
]


def test_main_json_stdout_contains_player(capsys: object) -> None:
    assert main([*ARGS, "--json"]) == 0
    captured = capsys.readouterr()  # type: ignore[attr-defined]
    assert '"displayName":"Raphinha"' in captured.out.replace(" ", "")


def test_main_markdown_file_and_parse_error(tmp_path: object, capsys: object) -> None:
    target = tmp_path / "out.md"  # type: ignore[operator]
    assert main([*ARGS, "--markdown", "--output", str(target)]) == 0
    assert target.read_text(encoding="utf-8").startswith("# Raphinha")
    assert main(["/no/such.html", *ARGS[1:]]) == 2
    captured = capsys.readouterr()  # type: ignore[attr-defined]
    assert captured.err
