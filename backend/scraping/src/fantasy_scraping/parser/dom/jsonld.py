"""JSON-LD person reader. Blocks are data, never code."""

import json
from datetime import date

from lxml.html import HtmlElement

from fantasy_scraping.parser.models.common import JsonLdPerson, PartialParseWarning
from fantasy_scraping.parser.normalise.text import clean_text

_TYPES = {"person", "athlete", "sportsperson"}
_HTTP = ("http://", "https://")


def _http(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.startswith(_HTTP):
        return text
    return None


def _as_list(value: object) -> list[object]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _flatten(node: object) -> list[dict[str, object]]:
    found: list[dict[str, object]] = []
    if isinstance(node, list):
        for item in node:
            found.extend(_flatten(item))
        return found
    if not isinstance(node, dict):
        return found
    graph = node.get("@graph")
    if graph is not None:
        found.extend(_flatten(graph))
        return found
    found.append(node)
    return found


def _types(node: dict[str, object]) -> set[str]:
    raw = node.get("@type", "")
    values = raw if isinstance(raw, list) else [raw]
    return {str(item).casefold() for item in values}


def _height(value: object) -> int | None:
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        digits = "".join(char for char in value if char.isdigit())
        return int(digits) if digits else None
    return None


def _birth(value: object) -> date | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _place(value: object) -> str | None:
    if isinstance(value, str):
        return clean_text(value) or None
    if isinstance(value, dict):
        name = value.get("name") or value.get("address")
        if isinstance(name, str):
            return clean_text(name) or None
    return None


def _nationalities(node: dict[str, object]) -> list[str]:
    raw = node.get("nationality", node.get("nationalities"))
    items = raw if isinstance(raw, list) else [raw]
    names: list[str] = []
    for item in items:
        if isinstance(item, str) and item.strip():
            names.append(clean_text(item))
        elif isinstance(item, dict) and isinstance(item.get("name"), str):
            names.append(clean_text(str(item["name"])))
    return names


def _person(node: dict[str, object]) -> JsonLdPerson:
    same = [_http(item) for item in _as_list(node.get("sameAs"))]
    return JsonLdPerson(
        name=clean_text(node["name"]) if isinstance(node.get("name"), str) else None,
        birth_date=_birth(node.get("birthDate")),
        birth_place=_place(node.get("birthPlace")),
        nationalities=_nationalities(node),
        height_cm=_height(node.get("height")),
        url=_http(node.get("url")),
        same_as=[item for item in same if item is not None],
    )


def read_jsonld(root: HtmlElement) -> tuple[JsonLdPerson | None, list[PartialParseWarning]]:
    """Read the first Person, Athlete or SportsPerson JSON-LD node.

    Args:
        root: Parsed tree, still containing script nodes.

    Returns:
        The person and any ``jsonld_invalid`` warnings. Malformed blocks are
        skipped.
    """
    warnings: list[PartialParseWarning] = []
    for script in root.xpath('//script[@type="application/ld+json"]'):
        raw = script.text or ""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            warnings.append(
                PartialParseWarning(
                    code="jsonld_invalid",
                    section="meta",
                    path="meta.json_ld",
                    rule_id="meta.json_ld",
                    message="json-ld block skipped",
                    severity="warning",
                )
            )
            continue
        for node in _flatten(payload):
            if _types(node) & _TYPES:
                return _person(node), warnings
    return None, warnings
