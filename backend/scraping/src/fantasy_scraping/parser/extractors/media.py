"""Preserve published badge URLs without fetching images or guessing identities."""

from lxml.html import HtmlElement

from fantasy_scraping.parser.extractors.base import ExtractionContext, http_url


def image_url(ctx: ExtractionContext, node: HtmlElement) -> str | None:
    """Resolve a lazy image before its placeholder, allowing only HTTP URLs."""
    for attribute in ("data-src", "data-lazy-src", "src"):
        raw = node.get(attribute)
        url = http_url(ctx.page.url, raw) if raw else None
        if url and not url.split("?")[0].endswith("/0.png"):
            return url
    return None


def match_media(
    ctx: ExtractionContext,
    root: HtmlElement,
    *,
    is_home: bool | None,
    club_badge: str | None,
) -> dict[str, str | None]:
    """Associate calendar badges with a team only when its side is known."""
    club_badge = (
        club_badge if club_badge and club_badge.startswith(("https://", "http://")) else None
    )
    rivals = root.cssselect("img.m-rival, img.rival-widget")
    competitions = root.cssselect(".widget-partidos-min img")
    rival = image_url(ctx, rivals[0]) if rivals else None
    competition = image_url(ctx, competitions[0]) if competitions else None
    return {
        "home_badge": club_badge if is_home is True else rival if is_home is False else None,
        "away_badge": rival if is_home is True else club_badge if is_home is False else None,
        "opponent_badge": rival,
        "competition_badge": competition,
    }
