"""Render options."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RenderOptions:
    """Switches that are part of the golden Markdown matrix.

    Attributes:
        include_static_blocks: Append the shared explanation sections.
        include_empty_sections: Keep sections that have no rows.
    """

    include_static_blocks: bool = True
    include_empty_sections: bool = False
