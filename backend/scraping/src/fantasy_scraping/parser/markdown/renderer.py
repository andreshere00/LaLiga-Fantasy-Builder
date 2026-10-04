"""Join Markdown sections in a fixed order."""

from fantasy_scraping.parser.errors import RenderError
from fantasy_scraping.parser.markdown.options import RenderOptions
from fantasy_scraping.parser.markdown.sections import (
    render_calendar,
    render_fixtures,
    render_identity,
    render_injuries,
    render_market,
    render_meta,
    render_news,
    render_personal,
    render_points,
    render_position,
    render_season,
    render_static,
    render_status,
    render_title,
)
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer
from fantasy_scraping.parser.rules.schema import RuleSet


def to_markdown(
    model: FutbolFantasyPlayer,
    rules: RuleSet,
    options: RenderOptions | None = None,
) -> str:
    """Render ``model`` to UTF-8 Markdown with LF endings and one trailing newline.

    Args:
        model: Parsed player.
        rules: Static wording and the event catalog.
        options: Empty-section and static-block switches.

    Returns:
        The Markdown document.

    Raises:
        RenderError: The display name is missing.
    """
    chosen = options or RenderOptions()
    if not model.profile.identity.display_name:
        raise RenderError("display_name_missing", "display name missing", section="identity")
    blocks = [
        render_title(model, rules),
        render_meta(model, rules),
        render_identity(model),
        render_status(model, chosen),
        render_personal(model, chosen),
        render_position(model, chosen),
        render_injuries(model, chosen),
        render_calendar(model),
        render_market(model, chosen),
        render_news(model),
        render_season(model, chosen),
        render_points(model, rules, chosen),
        render_fixtures(model, rules, chosen),
        render_static(model, rules, chosen),
    ]
    present = ["\n".join(block).rstrip() for block in blocks if block]
    text = "\n\n---\n\n".join(present)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    if not text.endswith("\n"):
        text += "\n"
    return text
