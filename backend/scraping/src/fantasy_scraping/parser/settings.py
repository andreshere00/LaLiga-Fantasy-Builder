"""Injected parser settings. Nothing is read from the environment."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ParserSettings:
    """Limits and version stamps for one parse.

    Attributes:
        max_html_bytes: Reject larger bodies before the HTML parser runs.
        max_rows: Stop pathological tables.
        max_failed_core_sections: Drift threshold for the four core sections.
        parser_version: Stamped into ``meta`` and therefore into the content hash.
        layout: Layout id stamped into ``meta``.
    """

    max_html_bytes: int = 6 * 1024 * 1024
    max_rows: int = 500
    max_failed_core_sections: int = 2
    parser_version: str = "1"
    layout: str = "futbolfantasy-player-v1"


CORE_SECTIONS: tuple[str, ...] = (
    "matches.recent",
    "fixtures",
    "season_stats",
    "profile.personal",
)
