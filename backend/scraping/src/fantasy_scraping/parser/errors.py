"""Parser failures. Details are constant strings and never include page text."""


class ParserError(Exception):
    """Base parser error.

    Attributes:
        code: Stable machine-readable code.
        detail: Constant explanation. Must not quote the HTML.
        section: Section id when the failure is local to one block.
    """

    def __init__(self, code: str, detail: str, section: str | None = None) -> None:
        self.code = code
        self.detail = detail
        self.section = section
        super().__init__(detail)


class ParseError(ParserError):
    """The input is not a usable player sheet."""


class UnsupportedLayoutError(ParserError):
    """The page looks like a player sheet but the markup drifted."""


class ParserSectionError(ParserError):
    """One section failed and may be isolated from the rest of the page."""


class RenderError(ParserError):
    """The model cannot be rendered to Markdown."""


class NormaliseError(ParserError):
    """A text value does not match the normaliser's grammar."""
