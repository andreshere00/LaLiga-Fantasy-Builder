"""Personal information and JSON-LD cross-check."""

import re
from datetime import date

from fantasy_scraping.parser.extractors.base import (
    ExtractionContext,
    group_present,
    http_url,
    label_pairs,
    values_for_group,
)
from fantasy_scraping.parser.models.common import SocialLink
from fantasy_scraping.parser.models.futbolfantasy import PersonalInfo
from fantasy_scraping.parser.normalise.dates import date_dmy
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

_BIRTH_IN_AGE = re.compile(r"\((\d{2}/\d{2}/\d{4})\)")


def extract_personal(ctx: ExtractionContext) -> PersonalInfo | None:
    """Read the biography list. JSON-LD fills empty fields and is cross-checked.

    Args:
        ctx: Extraction context.

    Returns:
        The personal block, or ``None`` when the container is missing.

    Raises:
        ParserSectionError: The biography container is missing.
    """
    from fantasy_scraping.parser.errors import ParserSectionError

    root = ctx.document.first(ctx.selector("personal_root"))
    if root is None:
        raise ParserSectionError(
            "required_anchor_missing",
            "personal block missing",
            section="profile.personal",
        )
    pairs = label_pairs(root)
    if not group_present(ctx, pairs, "personal"):
        ctx.warn(
            code="field_missing",
            section="personal",
            path="profile.personal",
            rule_id="profile.personal",
            message="expected field missing",
        )
    values = values_for_group(ctx, pairs, "personal")
    info = PersonalInfo(
        full_name=values.get("profile.personal.full_name"),
        age_years=values.get("profile.personal.age_years"),
        birth_date=values.get("profile.personal.birth_date"),
        birth_place=values.get("profile.personal.birth_place"),
        nationalities=list(values.get("profile.personal.nationalities") or []),
        height_cm=values.get("profile.personal.height_cm"),
        preferred_foot=values.get("profile.personal.preferred_foot"),
        contract_end=values.get("profile.personal.contract_end"),
        social=_social(ctx),
    )
    info = _birth_from_age_line(pairs, info)
    return _fill_jsonld(ctx, info)


def _birth_from_age_line(pairs: list[tuple[str, str]], info: PersonalInfo) -> PersonalInfo:
    if info.birth_date is not None:
        return info
    for label, raw in pairs:
        if casefold_key(label) != "edad":
            continue
        found = _BIRTH_IN_AGE.search(raw)
        if found is None:
            return info
        from fantasy_scraping.parser.errors import NormaliseError

        try:
            birth = date_dmy(found.group(1))
        except NormaliseError:
            return info
        return info.model_copy(update={"birth_date": birth})
    return info


def _social(ctx: ExtractionContext) -> list[SocialLink]:
    links: list[SocialLink] = []
    for node in ctx.document.css(ctx.selector("personal_social")):
        href = http_url(ctx.page.url, node.get("href"))
        if href is None:
            continue
        links.append(
            SocialLink(network=clean_text(node.text or node.get("data-network") or "web"), url=href)
        )
    return links


def _fill_jsonld(ctx: ExtractionContext, info: PersonalInfo) -> PersonalInfo:
    person = ctx.json_ld
    if person is None:
        return info
    updates: dict[str, object] = {}
    _cross(ctx, "profile.personal.full_name", info.full_name, person.name, updates, "full_name")
    _cross(
        ctx,
        "profile.personal.birth_date",
        info.birth_date,
        person.birth_date,
        updates,
        "birth_date",
    )
    _cross(
        ctx,
        "profile.personal.birth_place",
        info.birth_place,
        person.birth_place,
        updates,
        "birth_place",
    )
    _cross(
        ctx, "profile.personal.height_cm", info.height_cm, person.height_cm, updates, "height_cm"
    )
    if info.nationalities and person.nationalities and info.nationalities != person.nationalities:
        ctx.warn(
            code="jsonld_mismatch",
            section="personal",
            path="profile.personal.nationalities",
            rule_id="profile.personal.nationalities",
            message="json-ld does not match the page",
        )
    elif not info.nationalities and person.nationalities:
        updates["nationalities"] = list(person.nationalities)
    if not updates:
        return info
    return info.model_copy(update=updates)


def _cross(
    ctx: ExtractionContext,
    path: str,
    current: object,
    proposed: object,
    updates: dict[str, object],
    field_name: str,
) -> None:
    if proposed is None:
        return
    if current is None:
        updates[field_name] = proposed
        return
    if current != proposed and not _same_date(current, proposed):
        ctx.warn(
            code="jsonld_mismatch",
            section="personal",
            path=path,
            rule_id=path,
            message="json-ld does not match the page",
        )


def _same_date(current: object, proposed: object) -> bool:
    return isinstance(current, date) and isinstance(proposed, date) and current == proposed
