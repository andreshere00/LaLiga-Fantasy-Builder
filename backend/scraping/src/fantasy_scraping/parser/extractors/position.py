"""Position, demarcations and platform roles."""

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.extractors.base import ExtractionContext
from fantasy_scraping.parser.models.futbolfantasy import PlatformRole, PositionInfo


def extract_position(ctx: ExtractionContext) -> PositionInfo | None:
    """Read the main position, demarcations and whether a field map exists."""
    main = ctx.document.first(ctx.selector("position_main"))
    items = ctx.document.css(ctx.selector("position_item"))
    field_map = ctx.document.first(ctx.selector("field_map"))
    if main is None and not items:
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
    return PositionInfo(
        main=node_text(main) if main is not None else None,
        demarcations=demarcations,
        field_map_available=field_map is not None,
    )


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
