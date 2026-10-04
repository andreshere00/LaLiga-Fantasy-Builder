"""Number and date formatting for Markdown. No locale module."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal


def fmt_int(value: int) -> str:
    """Format an integer with ``.`` thousands separators."""
    sign = "−" if value < 0 else ""
    digits = f"{abs(value)}"
    groups: list[str] = []
    while digits:
        groups.append(digits[-3:])
        digits = digits[:-3]
    return sign + ".".join(reversed(groups))


def fmt_signed(value: int) -> str:
    """Format a delta with an explicit plus or a unicode minus."""
    if value > 0:
        return f"+{fmt_int(value)}"
    return fmt_int(value)


def fmt_decimal(value: float, places: int) -> str:
    """Format a float with a comma decimal mark and fixed places."""
    quantum = Decimal("1").scaleb(-places)
    number = Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    sign = "−" if number < 0 else ""
    text = f"{abs(number):.{places}f}".replace(".", ",")
    return sign + text


def fmt_percent(value: float, places: int = 0) -> str:
    """Format a percent with a space before ``%``."""
    if places == 0:
        number = fmt_int(int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)))
    else:
        number = fmt_decimal(value, places)
    return f"{number} %"


def fmt_date(value: date, kind: str) -> str:
    """Format a date as ``dd/mm/yyyy``, ``dd/mm/yy``, ``dd/mm`` or ISO."""
    if kind == "iso":
        return value.isoformat()
    if kind == "short":
        return f"{value.day:02d}/{value.month:02d}"
    if kind == "year2":
        return f"{value.day:02d}/{value.month:02d}/{value.year % 100:02d}"
    return f"{value.day:02d}/{value.month:02d}/{value.year}"


def fmt_minutes(raw: str, minutes: int | None, event: str) -> str:
    """Format a minutes note."""
    if event == "subbed_off" and minutes is not None:
        return f"Sale {minutes}'"
    if event == "subbed_on" and raw:
        return raw
    if event == "full" and minutes is not None:
        return f"{minutes}'"
    return raw or "—"


def fmt_duration(days: int) -> str:
    """Format ``1 día`` or ``N días``."""
    if days == 1:
        return "1 día"
    return f"{days} días"
