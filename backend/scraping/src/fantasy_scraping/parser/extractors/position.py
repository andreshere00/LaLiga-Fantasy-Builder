"""Position, demarcations and platform roles."""

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.extractors.base import ExtractionContext, label_pairs
from fantasy_scraping.parser.models.futbolfantasy import PlatformRole, PositionInfo
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text


def extract_position(ctx: ExtractionContext) -> PositionInfo | None:
    """Read the main position, demarcations and whether a field map exists."""
    main_node = ctx.document.first(ctx.selector("position_main"))
    main_text = _main_from_personal(ctx) if main_node is None else None
    items = ctx.document.css(ctx.selector("position_item"))
    field_map = ctx.document.first(ctx.selector("field_map"))
    if main_node is None and main_text is None and not items:
        ctx.miss("profile.position")
        ctx.warn(
            code="field_missing",
            section="position",
            path="profile.position",
            rule_id="profile.position",
            message="expected field missing",
        )
        return None
    demarcations = [node_text(item) for item in items if node_text(item)]
    main = node_text(main_node) if main_node is not None else main_text
    return PositionInfo(
        main=main,
        demarcations=demarcations,
        field_map_available=field_map is not None,
    )


def _main_from_personal(ctx: ExtractionContext) -> object:
    for root in ctx.document.css("#profile-datos-personales, #profile-datos-personales-2"):
        for label, raw in label_pairs(root):
            if casefold_key(label).startswith("posicion"):
                text = clean_text(raw)
                if text:
                    return text
    return None


def extract_platforms(ctx: ExtractionContext) -> list[PlatformRole]:
    """Read platform role rows. A missing list is recorded in ``missing``."""
    rows = ctx.document.css(ctx.selector("platform_row"))
    if not rows and ctx.document.first(ctx.selector("platform_row").rsplit(" ", 1)[0]) is None:
        ctx.miss("profile.platform_roles")
        return []
    roles: list[PlatformRole] = []
    for row in rows:
        platform = row.cssselect(ctx.selector("platform_name"))
        role = row.cssselect(ctx.selector("platform_role"))
        if not platform or not role:
            continue
        roles.append(PlatformRole(platform=node_text(platform[0]), role=node_text(role[0])))
    return roles
