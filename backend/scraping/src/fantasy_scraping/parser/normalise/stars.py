"""Star widgets."""

from fantasy_scraping.parser.normalise.text import clean_text


def stars(value: str) -> int | None:
    """Count ``★`` characters. An empty cell is ``None``.

    Args:
        value: Cell text or a repetition of star characters.

    Returns:
        The star count, or ``None`` when the cell is empty.
    """
    text = clean_text(value)
    if not text:
        return None
    return text.count("★")
