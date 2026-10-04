#!/usr/bin/env python3
"""Strip tracking, mail and inline handlers from a saved HTML file.

The script is offline. It does not fetch the page.

Usage:
    python scripts/sanitise_fixture.py raw.html sanitised.html
"""

import re
import sys
from pathlib import Path

from lxml.html import HTMLParser, fromstring, tostring

_PARSER = HTMLParser(encoding="utf-8", remove_comments=False, no_network=True, recover=True)
_EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_KEEP_SCRIPT = {"application/ld+json", "application/json"}


def sanitise(html: str) -> str:
    """Return HTML without tracking scripts, event handlers or email addresses."""
    root = fromstring(html.encode("utf-8"), parser=_PARSER)
    for node in list(root.iter("script")):
        kind = (node.get("type") or "").casefold()
        classes = set((node.get("class") or "").split())
        if kind not in _KEEP_SCRIPT and "market-series" not in classes:
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
    for node in root.iter():
        for attr in list(node.attrib):
            if attr.lower().startswith("on"):
                del node.attrib[attr]
        if node.text:
            node.text = _EMAIL.sub("[redacted]", node.text)
        if node.tail:
            node.tail = _EMAIL.sub("[redacted]", node.tail)
    rendered = tostring(root, encoding="unicode", method="html")
    return rendered if rendered.endswith("\n") else rendered + "\n"


def main(argv: list[str] | None = None) -> int:
    """Read a file and write the sanitised HTML."""
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 2:
        sys.stderr.write("usage: sanitise_fixture.py INPUT OUTPUT\n")
        return 2
    source, target = args
    Path(target).write_text(sanitise(Path(source).read_text(encoding="utf-8")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
