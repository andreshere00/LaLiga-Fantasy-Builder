"""Strip session and CSRF artefacts before a page is cached."""

import re

_META = re.compile(r'(<meta[^>]+name=["\']csrf-token["\'][^>]*content=["\'])[^"\']*', re.IGNORECASE)
_META_REV = re.compile(
    r'(<meta[^>]+content=["\'])[^"\']*(["\'][^>]+name=["\']csrf-token["\'])', re.IGNORECASE
)
_INPUT = re.compile(r'(<input[^>]+name=["\']_token["\'][^>]*value=["\'])[^"\']*', re.IGNORECASE)
_INPUT_REV = re.compile(
    r'(<input[^>]+value=["\'])[^"\']*(["\'][^>]+name=["\']_token["\'])', re.IGNORECASE
)


def sanitise_html(html: str) -> str:
    """Blank CSRF token values.

    Args:
        html: Response body.

    Returns:
        The body with token values emptied. Idempotent.
    """
    html = _META.sub(r"\1", html)
    html = _META_REV.sub(r"\1\2", html)
    html = _INPUT.sub(r"\1", html)
    return _INPUT_REV.sub(r"\1\2", html)
