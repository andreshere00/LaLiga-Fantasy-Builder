"""Extract a bounded static player row and its exact column labels without eval."""

import csv
import io
import math
import re
from datetime import datetime

from lxml import html
from lxml.etree import ParserError
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from fantasy_scraping.scraper.errors import UnexpectedContentError


class DataMBPlayer(BaseModel):
    """Public percentile snapshot; no HTML, secrets or invented raw statistics."""

    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1, max_length=120)
    club: str = Field(min_length=1, max_length=120)
    league: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=0, le=100)
    position: str = Field(min_length=1, max_length=40)
    season: str = Field(pattern=r"^20\d{2}-\d{2}$")
    minutes: int = Field(ge=0)
    percentiles: list[float] = Field(min_length=7, max_length=7)
    metric_labels: list[str] = Field(min_length=7, max_length=7)
    fetched_at: AwareDatetime
    stale: bool = False


def _literal(script: str, start: int) -> tuple[str, int]:
    """Read one JS string with a small explicit escape grammar, rejecting interpolation."""
    quote = script[start]
    if quote not in "'\"`":
        raise ValueError("not a string literal")
    output: list[str] = []
    cursor = start + 1
    escapes = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f"}
    while cursor < len(script):
        char = script[cursor]
        cursor += 1
        if char == quote:
            return "".join(output), cursor
        if quote == "`" and char == "$" and script[cursor : cursor + 1] == "{":
            raise ValueError("template interpolation")
        if char == "\\":
            if cursor >= len(script):
                raise ValueError("unterminated escape")
            char = script[cursor]
            cursor += 1
            if char in "\\'\"`":
                output.append(char)
            elif char in escapes:
                output.append(escapes[char])
            elif char in {"x", "u"}:
                width = 2 if char == "x" else 4
                digits = script[cursor : cursor + width]
                if len(digits) != width or not re.fullmatch(r"[a-fA-F0-9]+", digits):
                    raise ValueError("invalid escape")
                output.append(chr(int(digits, 16)))
                cursor += width
            else:
                raise ValueError("unsupported escape")
        else:
            output.append(char)
    raise ValueError("unterminated literal")


def _labels(scripts: list[str]) -> list[str]:
    """Read only the exact metadata-prefixed fifteen-string header array."""
    candidates = []
    for script in scripts:
        for match in re.finditer(r"\[\s*(['\"])\1\s*,\s*(['\"])\2\s*,\s*(['\"])Club\3", script):
            cursor = match.start() + 1
            labels = []
            while len(labels) < 16:
                while script[cursor].isspace():
                    cursor += 1
                label, cursor = _literal(script, cursor)
                labels.append(label)
                while script[cursor].isspace():
                    cursor += 1
                if script[cursor] == "]":
                    break
                if script[cursor] != ",":
                    raise ValueError("invalid header array")
                cursor += 1
            if (
                len(labels) != 15
                or labels[:7] != ["", "", "Club", "League", "Age", "Position", "Season"]
                or labels[-1] != "Minutes played"
            ):
                raise ValueError("changed column schema")
            candidates.append(labels[7:14])
    if len(candidates) != 1 or len(set(candidates[0])) != 7:
        raise ValueError("missing or ambiguous metric labels")
    return candidates[0]


def parse_player(body: str, season: str, fetched_at: datetime) -> DataMBPlayer:
    """Validate a single public player row, including season, scale and source labels.

    Args:
        body: Downloaded HTML, bounded by the transport.
        season: Canonical requested season (2026-27).
        fetched_at: Aware retrieval time.

    Returns:
        A seven-percentile player snapshot in source column order.

    Raises:
        UnexpectedContentError: Invalid, ambiguous, or unsupported source structure.
    """
    try:
        scripts = html.fromstring(body).xpath("//script[not(@src)]/text()")
        matches = [
            (script, match)
            for script in scripts
            for match in re.finditer(r"\bconst\s+csvData\s*=\s*", script)
        ]
        if len(matches) != 1:
            raise ValueError("missing or ambiguous csvData")
        script, match = matches[0]
        literal, cursor = _literal(script, match.end())
        if not re.match(r"\s*;", script[cursor:]):
            raise ValueError("dynamic csvData")
        rows = list(csv.reader(io.StringIO(literal), strict=True))
        if len(rows) != 1 or len(rows[0]) != 15:
            raise ValueError("invalid CSV dimensions")
        row = rows[0]
        if row[6].replace("/", "-") != season or not re.fullmatch(r"20\d{2}-\d{2}", season):
            raise ValueError("season mismatch")
        values = [float(value) for value in row[7:14]]
        if not all(math.isfinite(value) and 0 <= value <= 1 for value in values):
            raise ValueError("invalid percentile fraction")
        return DataMBPlayer(
            name=row[1],
            club=row[2],
            league=row[3],
            age=int(row[4]),
            position=row[5],
            season=season,
            minutes=int(row[14]),
            percentiles=[v * 100 for v in values],
            metric_labels=_labels(scripts),
            fetched_at=fetched_at,
        )
    except (ValueError, TypeError, IndexError, csv.Error, ParserError):
        raise UnexpectedContentError("DataMB returned invalid player data") from None
