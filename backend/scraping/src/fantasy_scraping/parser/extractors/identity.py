"""Header identity."""

from fantasy_scraping.parser.extractors.base import ExtractionContext, apply_rules
from fantasy_scraping.parser.models.futbolfantasy import Identity


def extract_identity(ctx: ExtractionContext) -> Identity:
    """Read the shirt number, name, position tag and badge.

    Args:
        ctx: Extraction context.

    Returns:
        The identity block.

    Raises:
        ParseError: The display name is missing.
    """
    values = apply_rules(ctx, "profile.identity")
    code = values.get("profile.identity.position_code")
    if "profile.identity.position_code" in values and code is None:
        ctx.warn(
            code="position_unmapped",
            section="identity",
            path="profile.identity.position_code",
            rule_id="profile.identity.position_code",
            message="position code is not mapped",
        )
    return Identity(
        shirt_number=values.get("profile.identity.shirt_number"),
        display_name=values["profile.identity.display_name"],
        position_code=code,
        club_badge=values.get("profile.identity.club_badge"),
    )
