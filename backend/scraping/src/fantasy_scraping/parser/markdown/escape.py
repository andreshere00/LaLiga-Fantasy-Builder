"""Markdown escaping for page-derived text."""

_FREE = "*_[]<>`"


def escape_cell(value: str, *, free_text: bool = False) -> str:
    """Escape a table cell.

    Args:
        value: Cell text.
        free_text: When true, also escape Markdown punctuation from the page.

    Returns:
        A single-line cell safe to place between pipes.
    """
    text = value.replace("\\", "\\\\").replace("\n", " ").replace("\t", " ").replace("\r", " ")
    text = " ".join(text.split())
    text = text.replace("|", "\\|")
    if free_text:
        for char in _FREE:
            text = text.replace(char, f"\\{char}")
    return text
