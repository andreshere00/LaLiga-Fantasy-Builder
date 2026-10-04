"""Dates, clock times and durations. The only clock is the injected anchor."""

import re
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fantasy_scraping.parser.errors import NormaliseError
from fantasy_scraping.parser.normalise.text import clean_text

MADRID = ZoneInfo("Europe/Madrid")
_DMY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$")
_DM = re.compile(r"^(\d{1,2})/(\d{1,2})$")
_TIME = re.compile(r"^(\d{1,2}):(\d{2})h?$")
_DURATION = re.compile(r"^(\d+)\s+d[ií]as?$", re.IGNORECASE)
_SLUG_SEASON = re.compile(r"(\d{2})-(\d{2})$")


def madrid_date(moment: datetime) -> date:
    """Return the Europe/Madrid calendar date of an aware instant.

    Args:
        moment: Timezone-aware datetime.

    Returns:
        The local date in Madrid.
    """
    return moment.astimezone(MADRID).date()


def date_dmy(value: str) -> date:
    """Parse ``dd/mm/yyyy`` or ``dd/mm/yy``.

    Args:
        value: Date text.

    Returns:
        The calendar date. Two-digit years use a 1970 pivot (``70`` → 1970,
        ``69`` → 2069).

    Raises:
        NormaliseError: The text is not a real date.
    """
    match = _DMY.fullmatch(clean_text(value))
    if match is None:
        raise NormaliseError("invalid_date", "invalid day month year")
    day, month, year_text = (int(part) for part in match.groups())
    year = (
        year_text
        if year_text >= 100
        else (1900 + year_text if year_text >= 70 else 2000 + year_text)
    )
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise NormaliseError("invalid_date", "invalid day month year") from exc


def day_month(value: str) -> tuple[int, int]:
    """Parse ``dd/mm`` without a year.

    Args:
        value: Day and month.

    Returns:
        ``(day, month)``.

    Raises:
        NormaliseError: The text is not a day and month.
    """
    match = _DM.fullmatch(clean_text(value))
    if match is None:
        raise NormaliseError("invalid_date", "invalid day month")
    day, month = int(match.group(1)), int(match.group(2))
    if not 1 <= month <= 12 or not 1 <= day <= 31:
        raise NormaliseError("invalid_date", "invalid day month")
    return day, month


def _valid(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def resolve_day_month(
    day: int,
    month: int,
    anchor: datetime,
    direction: str,
) -> date:
    """Resolve a day and month against an injected instant.

    Args:
        day: Day of month.
        month: Month number.
        anchor: Aware fetch time. Converted to Europe/Madrid.
        direction: ``recent`` walks backward; ``upcoming`` walks forward.

    Returns:
        The nearest valid date on the requested side of the Madrid calendar day.

    Raises:
        NormaliseError: No valid date exists in the searched window.
    """
    today = madrid_date(anchor)
    if direction == "recent":
        years = range(today.year, today.year - 3, -1)
        found: date | None = None
        for year in years:
            candidate = _valid(year, month, day)
            if (
                candidate is not None
                and candidate <= today
                and (found is None or candidate > found)
            ):
                found = candidate
        if found is None:
            raise NormaliseError("invalid_date", "unresolved day month")
        return found
    if direction != "upcoming":
        raise NormaliseError("invalid_date", "unknown date direction")
    for year in range(today.year, today.year + 3):
        candidate = _valid(year, month, day)
        if candidate is not None and candidate >= today:
            return candidate
    raise NormaliseError("invalid_date", "unresolved day month")


def resolve_sequence(
    pairs: list[tuple[int, int]],
    anchor: datetime,
    direction: str,
) -> list[date]:
    """Resolve several day/month pairs so the sequence stays monotonic.

    Args:
        pairs: Day and month values in page order.
        anchor: Fetch time.
        direction: ``recent`` (non-increasing) or ``upcoming`` (non-decreasing).

    Returns:
        One date per pair.

    Raises:
        NormaliseError: A pair cannot be resolved.
    """
    resolved: list[date] = []
    cursor = anchor
    for day, month in pairs:
        found = resolve_day_month(day, month, cursor, direction)
        resolved.append(found)
        if direction == "recent":
            cursor = datetime.combine(found, datetime.min.time(), tzinfo=MADRID).astimezone(UTC)
            cursor = cursor - timedelta(days=1)
        else:
            cursor = datetime.combine(found, datetime.min.time(), tzinfo=MADRID).astimezone(UTC)
            cursor = cursor + timedelta(days=1)
    return resolved


def time_hhmm(value: str) -> str:
    """Parse a kick-off into ``HH:MM``.

    Args:
        value: ``18:30`` or ``18:30h``.

    Returns:
        Zero-padded ``HH:MM``.

    Raises:
        NormaliseError: The text is not a clock time.
    """
    match = _TIME.fullmatch(clean_text(value).replace(" ", ""))
    if match is None:
        raise NormaliseError("invalid_time", "invalid clock time")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        raise NormaliseError("invalid_time", "invalid clock time")
    return f"{hour:02d}:{minute:02d}"


def duration_days(value: str) -> int:
    """Parse ``1 día`` or ``N días``.

    Args:
        value: Duration text.

    Returns:
        The number of days.

    Raises:
        NormaliseError: The text is not a day count.
    """
    match = _DURATION.fullmatch(clean_text(value))
    if match is None:
        raise NormaliseError("invalid_duration", "invalid duration")
    return int(match.group(1))


def season_from_slug(slug: str, anchor: date | None = None) -> str | None:
    """Return ``YYYY-YY`` from a competition slug such as ``laliga-26-27``.

    Args:
        slug: Route suffix. Years must be the last two pairs.
        anchor: When a ``20xx`` start is more than five years after this date,
            the start moves back one century.

    Returns:
        Season key, or ``None`` when the slug has no year suffix.
    """
    found = _SLUG_SEASON.search(slug.strip())
    if found is None:
        return None
    start_year = 2000 + int(found.group(1))
    if anchor is not None and start_year > anchor.year + 5:
        start_year -= 100
    return f"{start_year}-{found.group(2)}"


def season_bounds(slug: str | None, anchor: date) -> tuple[date, date]:
    """Return 1 July–30 June for a slug, or the anchor year when it has none.

    Args:
        slug: Competition route. Missing years use ``anchor`` as the July start.
        anchor: Century check and fallback window.

    Returns:
        Inclusive start and end dates.
    """
    key = season_from_slug(slug or "", anchor)
    window = season_window(key) if key is not None else None
    if window is not None:
        return window
    if key is None:
        return date(anchor.year, 7, 1), date(anchor.year + 1, 6, 30)
    start_year = int(key[:4])
    end_year = (start_year // 100) * 100 + int(key[-2:])
    if end_year <= start_year:
        end_year += 100
    return date(start_year, 7, 1), date(end_year, 6, 30)


def season_window(season: str) -> tuple[date, date] | None:
    """Return 1 July–30 June for a ``YYYY-YY`` season, when the text matches."""
    match = re.fullmatch(r"(\d{4})-(\d{2})", season.strip())
    if match is None:
        return None
    start_year = int(match.group(1))
    end_short = int(match.group(2))
    if (start_year + 1) % 100 != end_short:
        return None
    return date(start_year, 7, 1), date(start_year + 1, 6, 30)
