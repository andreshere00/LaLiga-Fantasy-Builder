"""Page meta taken from the request and a few head elements."""

from urllib.parse import urlparse

from fantasy_scraping.parser.extractors.base import ExtractionContext, apply_rules, http_url
from fantasy_scraping.parser.hashing import input_hash
from fantasy_scraping.parser.models.common import PageMeta
from fantasy_scraping.parser.normalise.dates import madrid_date
from fantasy_scraping.parser.normalise.numbers import es_int
from fantasy_scraping.parser.settings import ParserSettings


def extract_meta(ctx: ExtractionContext, settings: ParserSettings) -> PageMeta:
    """Build page meta from the scraped page and the head of the document.

    Args:
        ctx: Extraction context.
        settings: Version stamps.

    Returns:
        Page meta. The Madrid date comes from ``fetched_at``.
    """
    values = apply_rules(ctx, "meta")
    season_url = ctx.page.season_slug or _last_segment(ctx.page.url)
    widget = ctx.document.first(ctx.selector("widget_link"))
    widget_url = http_url(ctx.page.url, widget.get("href") if widget is not None else None)
    widget_id = _widget_id(widget_url)
    label = values.get("meta.season_label")
    if isinstance(label, str) and " - " in label and ctx.document.first(".season-label") is None:
        label = label.split(" - ")[-1].strip()
    return PageMeta(
        source="futbolfantasy",
        url=ctx.page.url,
        slug=ctx.page.player_slug,
        season_url=season_url or None,
        season_label=label if isinstance(label, str) else None,
        club=values.get("meta.club") if isinstance(values.get("meta.club"), str) else None,
        market_widget_url=widget_url,
        market_widget_id=widget_id,
        extracted_on=madrid_date(ctx.page.fetched_at),
        fetched_at=ctx.page.fetched_at,
        parser_version=settings.parser_version,
        rules_version=ctx.rules.version,
        layout=settings.layout,
        input_sha256=input_hash(ctx.page.html),
        static_blocks_version=ctx.rules.static_blocks.version,
        json_ld=ctx.json_ld,
    )


def _last_segment(url: str) -> str:
    parts = [part for part in urlparse(url).path.split("/") if part]
    return parts[-1] if parts else ""


def _widget_id(url: str | None) -> int | None:
    if not url:
        return None
    segment = _last_segment(url.split("?", 1)[0])
    if not segment.isdigit():
        return None
    return es_int(segment)
