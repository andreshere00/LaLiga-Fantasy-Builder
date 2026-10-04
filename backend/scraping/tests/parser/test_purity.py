"""The parser package stays free of network, clock and randomness."""

import ast
from pathlib import Path

ROOT = Path(__file__).parents[2] / "src" / "fantasy_scraping" / "parser"
FORBIDDEN_MODULES = {
    "httpx",
    "requests",
    "socket",
    "subprocess",
    "random",
    "secrets",
    "locale",
}
FORBIDDEN_CALLS = {
    ("datetime", "now"),
    ("datetime", "today"),
    ("datetime", "utcnow"),
    ("date", "today"),
}


def test_parser_package_has_no_forbidden_imports_or_clocks() -> None:
    offenders: list[str] = []
    for path in ROOT.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root in FORBIDDEN_MODULES or alias.name == "urllib.request":
                        offenders.append(f"{path.name}:{alias.name}")
            elif isinstance(node, ast.ImportFrom) and node.module:
                root = node.module.split(".")[0]
                if root in FORBIDDEN_MODULES or node.module.startswith("urllib.request"):
                    offenders.append(f"{path.name}:{node.module}")
                if node.module == "os" and any(alias.name == "environ" for alias in node.names):
                    offenders.append(f"{path.name}:os.environ")
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                pair = (node.value.id, node.attr)
                if pair in FORBIDDEN_CALLS:
                    offenders.append(f"{path.name}:{pair[0]}.{pair[1]}")
            elif isinstance(node, ast.Name) and node.id == "scraper":
                offenders.append(f"{path.name}:scraper")
    assert offenders == []
