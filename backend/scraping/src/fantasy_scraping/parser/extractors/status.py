"""Header status widgets."""

import re

from fantasy_scraping.parser.dom.locators import node_text
from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.extractors.base import ExtractionContext
from fantasy_scraping.parser.models.futbolfantasy import (
    Availability,
    CurrentInjury,
    Form,
    Hierarchy,
    InjuryRisk,
    MaxProfitableBid,
    StartProbability,
)
from fantasy_scraping.parser.normalise.dates import date_dmy
from fantasy_scraping.parser.normalise.enums import (
    availability,
    bid_amount,
    hierarchy_rank,
    risk_level,
)
from fantasy_scraping.parser.normalise.numbers import es_int, es_percent
from fantasy_scraping.parser.normalise.text import casefold_key, clean_text

_DATE = re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}")
_MATCHDAY = re.compile(r"(\d+)")


def extract_injury(ctx: ExtractionContext) -> CurrentInjury | None:
    """Read the header medical line. Absence is an empty injury, not a warning."""
    node = ctx.document.first(ctx.selector("medical"))
    if node is None:
        return None
    text = node_text(node)
    if not text:
        return None
    found = _DATE.search(text)
    since = date_dmy(found.group(0)) if found else None
    return CurrentInjury(diagnosis=text, since=since, ongoing=True)


def extract_availability(ctx: ExtractionContext) -> Availability | None:
    """Read the availability sentence."""
    node = ctx.document.first(ctx.selector("availability"))
    if node is not None:
        label = node_text(node)
        if "disponible" not in label.casefold() and "no disponible" not in label.casefold():
            label = _availability_near_lesion(ctx) or label
    else:
        label = _availability_near_lesion(ctx)
    if label is None:
        ctx.miss("profile.availability")
        ctx.warn(
            code="field_missing",
            section="status",
            path="profile.availability",
            rule_id="profile.availability",
            message="expected field missing",
        )
        return None
    status, matchday = availability(label)
    if status == "unknown":
        ctx.warn(
            code="availability_unmapped",
            section="status",
            path="profile.availability.status",
            rule_id="profile.availability",
            message="availability label is not mapped",
            preview=label,
        )
    return Availability(status=status, matchday=matchday, label=label)


def extract_form(ctx: ExtractionContext) -> Form | None:
    """Read a numeric form value, or mark the widget as visual-only."""
    node = ctx.document.first(ctx.selector("form"))
    if node is None:
        ctx.miss("profile.form")
        return None
    raw = node.get("data-value") or ""
    if raw.strip():
        try:
            return Form(value=es_percent(raw), visual_only=False)
        except NormaliseError:
            ctx.warn(
                code="field_invalid",
                section="status",
                path="profile.form.value",
                rule_id="profile.form",
                message="field could not be parsed",
                preview=raw,
            )
    ctx.warn(
        code="form_visual_only",
        section="status",
        path="profile.form.value",
        rule_id="profile.form",
        message="form widget has no number",
    )
    return Form(value=None, visual_only=True)


def _availability_near_lesion(ctx: ExtractionContext) -> str | None:
    lesion = ctx.document.first("span.lesion")
    if lesion is None:
        return None
    parent = lesion.getparent()
    if parent is None:
        return None
    for child in parent:
        text = clean_text(node_text(child))
        lowered = text.casefold()
        if "disponible" in lowered or "no disponible" in lowered:
            return text
    return None


def extract_start_probability(ctx: ExtractionContext) -> StartProbability | None:
    """Read the next-matchday start probability."""
    matchday_node = ctx.document.first(ctx.selector("start_matchday"))
    percent_node = ctx.document.first(ctx.selector("start_percent"))
    if matchday_node is None:
        for candidate in ctx.document.css("strong"):
            if "titular" in node_text(candidate).casefold():
                matchday_node = candidate
                break
    if matchday_node is None or percent_node is None:
        ctx.miss("profile.start_probability")
        ctx.warn(
            code="field_missing",
            section="status",
            path="profile.start_probability",
            rule_id="profile.start_probability",
            message="expected field missing",
        )
        return None
    matchday_raw = node_text(matchday_node)
    matchday_text = _MATCHDAY.search(matchday_raw) or re.search(
        r"J\s*(\d+)",
        matchday_raw,
        re.IGNORECASE,
    )
    try:
        percent = int(es_percent(node_text(percent_node)))
        matchday = int(matchday_text.group(1)) if matchday_text else es_int(matchday_raw)
    except NormaliseError:
        ctx.miss("profile.start_probability")
        return None
    return StartProbability(matchday=matchday, percent=percent)


def extract_injury_risk(ctx: ExtractionContext) -> InjuryRisk | None:
    """Read the injury-risk label."""
    node = ctx.document.first(ctx.selector("risk_value"))
    if node is None:
        ctx.miss("profile.injury_risk")
        ctx.warn(
            code="field_missing",
            section="status",
            path="profile.injury_risk",
            rule_id="profile.injury_risk",
            message="expected field missing",
        )
        return None
    label = _risk_label(node)
    level = risk_level(label)
    if level is None:
        ctx.warn(
            code="risk_unmapped",
            section="status",
            path="profile.injury_risk.level",
            rule_id="profile.injury_risk",
            message="risk label is not mapped",
            preview=label,
        )
    return InjuryRisk(level=level, label=label)  # type: ignore[arg-type]


def _risk_label(node: object) -> str:
    from lxml.html import HtmlElement

    if isinstance(node, HtmlElement) and node.tag == "img":
        raw = node.get("alt") or ""
        prefix = "Riesgo de lesión "
        if raw.casefold().startswith(prefix.casefold()):
            return raw[len(prefix) :].strip()
        return clean_text(raw)
    return node_text(node)  # type: ignore[arg-type]


def extract_hierarchy(ctx: ExtractionContext) -> Hierarchy | None:
    """Read the hierarchy label and the rank table."""
    node = ctx.document.first(ctx.selector("hierarchy_value"))
    if node is None:
        ctx.miss("profile.hierarchy")
        ctx.warn(
            code="field_missing",
            section="status",
            path="profile.hierarchy",
            rule_id="profile.hierarchy",
            message="expected field missing",
        )
        return None
    label = node_text(node)
    rank = hierarchy_rank(label, ctx.rules.hierarchy)
    if rank is None:
        ctx.warn(
            code="hierarchy_unmapped",
            section="status",
            path="profile.hierarchy.rank",
            rule_id="profile.hierarchy",
            message="hierarchy label is not mapped",
            preview=label,
        )
    return Hierarchy(label=label, rank=rank)


def extract_bid(ctx: ExtractionContext) -> MaxProfitableBid | None:
    """Read the maximum profitable bid."""
    node = ctx.document.first(ctx.selector("market_bid"))
    if node is None:
        ctx.miss("profile.max_profitable_bid")
        return None
    label = node_text(node)
    try:
        amount, profitable = bid_amount(label)
    except NormaliseError:
        ctx.miss("profile.max_profitable_bid.amount")
        return MaxProfitableBid(label=label, amount=None, profitable=None)
    if casefold_key(label) not in {"sin rentabilidad", "no rentable"} and amount is None:
        ctx.miss("profile.max_profitable_bid.amount")
    return MaxProfitableBid(label=clean_text(label), amount=amount, profitable=profitable)
