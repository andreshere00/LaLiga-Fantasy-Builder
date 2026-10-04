"""Pure market-value window maths."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from fantasy_api.domain.errors import UpstreamError

if TYPE_CHECKING:
    from fantasy_api.schemas.player_stats import MarketPreset

MADRID = ZoneInfo("Europe/Madrid")
MAX_WINDOW_DAYS = 400


@dataclass(frozen=True, slots=True)
class WindowRequest:
    """Resolved window bounds for market maths."""

    preset: MarketPreset | None
    from_: date
    to: date


def normalise_history(
    raw: Sequence[object],
) -> tuple[list[tuple[date, int]], int]:
    """Parse and sort daily market samples."""
    parsed: dict[date, tuple[int, datetime | None]] = {}
    dropped = 0
    for entry in raw:
        if not isinstance(entry, dict):
            dropped += 1
            continue
        raw_date = entry.get("date")
        value_raw = entry.get("marketValue")
        if value_raw is None:
            dropped += 1
            continue
        try:
            if isinstance(value_raw, float) and value_raw.is_integer():
                value = int(value_raw)
            else:
                value = int(value_raw)
        except (TypeError, ValueError):
            dropped += 1
            continue
        if value < 0:
            dropped += 1
            continue
        parsed_dt: datetime | None = None
        if isinstance(raw_date, datetime):
            parsed_dt = raw_date
            if parsed_dt.tzinfo is None:
                day = parsed_dt.replace(tzinfo=MADRID).date()
            else:
                day = parsed_dt.astimezone(MADRID).date()
        elif isinstance(raw_date, str):
            text = raw_date.strip()
            try:
                if "T" in text:
                    parsed_dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
                    if parsed_dt.tzinfo is None:
                        day = parsed_dt.replace(tzinfo=MADRID).date()
                    else:
                        day = parsed_dt.astimezone(MADRID).date()
                else:
                    day = date.fromisoformat(text[:10])
            except ValueError:
                dropped += 1
                continue
        elif isinstance(raw_date, date):
            day = raw_date
        else:
            dropped += 1
            continue
        existing = parsed.get(day)
        if existing is None:
            parsed[day] = (value, parsed_dt)
        elif parsed_dt is not None and (existing[1] is None or parsed_dt > existing[1]):
            parsed[day] = (value, parsed_dt)
        elif existing[1] is None:
            parsed[day] = (value, parsed_dt)
    if raw and dropped == len(raw):
        raise UpstreamError("unexpected market history", category="fantasy_error")
    history = sorted((day, value) for day, (value, _) in parsed.items())
    return history, dropped


def build_market_window(
    history: Sequence[tuple[date, int]],
    *,
    request: WindowRequest,
    today: date,
    season_start: date,
    include_series: bool = True,
):
    """Build a market window from normalised history."""
    from fantasy_api.schemas.player_stats import (
        MarketExtreme,
        MarketSeriesPoint,
        MarketWindow,
        SegmentWarning,
    )

    warnings: list[SegmentWarning] = []
    if not history:
        empty = MarketWindow(
            preset=request.preset,
            from_=request.from_,
            to=request.to,
            days=max(0, (request.to - request.from_).days),
            start_value=None,
            end_value=None,
            delta_abs=None,
            delta_rel=None,
            min=None,
            max=None,
            series=[],
        )
        warnings.append(SegmentWarning(code="no_market_data", source="fantasy", detail=None))
        return empty, warnings

    first = history[0][0]
    last = history[-1][0]
    from_ = request.from_
    to = request.to
    if to > today:
        to = today
        warnings.append(SegmentWarning(code="to_clamped_to_today", source="fantasy", detail=None))
    if to > last:
        to = last
        warnings.append(
            SegmentWarning(
                code="to_clamped_to_last_sample",
                source="fantasy",
                detail=None,
            )
        )
    if from_ < first:
        from_ = first
        warnings.append(
            SegmentWarning(
                code="from_clamped_to_first_sample",
                source="fantasy",
                detail=None,
            )
        )
    if from_ > to:
        window = MarketWindow(
            preset=request.preset,
            from_=from_,
            to=to,
            days=max(0, (to - from_).days),
            start_value=None,
            end_value=None,
            delta_abs=None,
            delta_rel=None,
            min=None,
            max=None,
            series=[],
        )
        warnings.append(
            SegmentWarning(
                code="window_outside_history",
                source="fantasy",
                detail=None,
            )
        )
        return window, warnings

    series: list[MarketSeriesPoint] = []
    if include_series:
        by_day = {day: value for day, value in history}
        cursor = from_
        carry: int | None = None
        for day, value in history:
            if day <= from_:
                carry = value
            else:
                break
        if carry is None:
            carry = history[0][1]
        while cursor <= to:
            if cursor in by_day:
                carry = by_day[cursor]
                filled = False
            else:
                filled = True
            prev_value = series[-1].value if series else None
            delta_abs: int | None = None
            delta_rel: float | None = None
            if prev_value is not None:
                delta_abs = carry - prev_value
                if prev_value != 0:
                    delta_rel = round(delta_abs / prev_value * 100, 4)
            series.append(
                MarketSeriesPoint(
                    date=cursor,
                    value=carry,
                    delta_abs=delta_abs,
                    delta_rel=delta_rel,
                    filled=filled,
                )
            )
            cursor = date.fromordinal(cursor.toordinal() + 1)

    start_value = series[0].value if series else None
    end_value = series[-1].value if series else None
    delta_abs_val: int | None = None
    delta_rel_val: float | None = None
    if start_value is not None and end_value is not None:
        delta_abs_val = end_value - start_value
        if start_value == 0:
            warnings.append(SegmentWarning(code="zero_start_value", source="fantasy", detail=None))
        else:
            delta_rel_val = round(delta_abs_val / start_value * 100, 4)
    if from_ == to and series:
        warnings.append(SegmentWarning(code="single_point_window", source="fantasy", detail=None))

    min_extreme: MarketExtreme | None = None
    max_extreme: MarketExtreme | None = None
    if series:
        min_val = min(point.value for point in series)
        max_val = max(point.value for point in series)
        min_day = min(point.date for point in series if point.value == min_val)
        max_day = min(point.date for point in series if point.value == max_val)
        min_extreme = MarketExtreme(date=min_day, value=min_val)
        max_extreme = MarketExtreme(date=max_day, value=max_val)

    window = MarketWindow(
        preset=request.preset,
        from_=from_,
        to=to,
        days=(to - from_).days,
        start_value=start_value,
        end_value=end_value,
        delta_abs=delta_abs_val,
        delta_rel=delta_rel_val,
        min=min_extreme,
        max=max_extreme,
        series=series if include_series else [],
    )
    return window, warnings


def resolve_window_request(
    *,
    preset,
    from_: date | None,
    to: date | None,
    today: date,
    season_start: date,
    history: Sequence[tuple[date, int]],
) -> WindowRequest:
    """Resolve preset/custom bounds before clamping."""
    from fantasy_api.schemas.player_stats import MarketPreset

    if history:
        anchor = min(today, history[-1][0])
    else:
        anchor = today
    if preset is not None:
        if preset == MarketPreset.SEASON:
            return WindowRequest(preset=preset, from_=season_start, to=anchor)
        days_map = {
            MarketPreset.D5: 5,
            MarketPreset.D10: 10,
            MarketPreset.D14: 14,
            MarketPreset.D30: 30,
        }
        offset = days_map[preset]
        return WindowRequest(
            preset=preset,
            from_=date.fromordinal(anchor.toordinal() - offset),
            to=anchor,
        )
    assert from_ is not None
    resolved_to = to if to is not None else today
    return WindowRequest(preset=None, from_=from_, to=resolved_to)


def build_preset_summaries(
    history: Sequence[tuple[date, int]],
    *,
    today: date,
    season_start: date,
):
    """Compute preset summaries without full series."""
    from fantasy_api.schemas.player_stats import (
        MarketPreset,
        MarketPresetSummary,
        SegmentWarning,
    )

    warnings: list[SegmentWarning] = []
    summaries: list[MarketPresetSummary] = []
    for preset in (
        MarketPreset.SEASON,
        MarketPreset.D30,
        MarketPreset.D14,
        MarketPreset.D10,
        MarketPreset.D5,
    ):
        request = resolve_window_request(
            preset=preset,
            from_=None,
            to=None,
            today=today,
            season_start=season_start,
            history=history,
        )
        window, preset_warnings = build_market_window(
            history,
            request=request,
            today=today,
            season_start=season_start,
            include_series=False,
        )
        for warning in preset_warnings:
            if warning.code == "from_clamped_to_first_sample":
                warnings.append(warning)
        summaries.append(
            MarketPresetSummary(
                preset=preset,
                from_=window.from_,
                to=window.to,
                start_value=window.start_value,
                end_value=window.end_value,
                delta_abs=window.delta_abs,
                delta_rel=window.delta_rel,
            )
        )
    return summaries, warnings
