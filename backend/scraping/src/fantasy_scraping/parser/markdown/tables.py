"""Markdown table rows."""

from fantasy_scraping.parser.markdown.escape import escape_cell


def table(headers: list[str], alignments: list[str], rows: list[list[str]]) -> list[str]:
    """Build one Markdown table.

    Args:
        headers: Column titles.
        alignments: ``---`` or ``---:`` per column.
        rows: Cell text already escaped when it comes from the page.

    Returns:
        Header, alignment and body lines.
    """
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(alignments) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return lines


def cell(value: str, *, free_text: bool = False) -> str:
    """Escape a cell, using an em dash for an empty value."""
    if value == "":
        return "—"
    return escape_cell(value, free_text=free_text)
