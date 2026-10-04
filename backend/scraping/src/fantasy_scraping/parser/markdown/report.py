"""Short hierarchical player report in Spanish."""

import re
from datetime import date, timedelta

from fantasy_scraping.parser.errors import RenderError
from fantasy_scraping.parser.markdown.formatters import (
    fmt_date,
    fmt_decimal,
    fmt_duration,
    fmt_int,
    fmt_minutes,
    fmt_signed,
)
from fantasy_scraping.parser.markdown.sections import fmt_signed_decimal
from fantasy_scraping.parser.markdown.tables import cell, table
from fantasy_scraping.parser.models.common import Competition
from fantasy_scraping.parser.models.futbolfantasy import (
    FutbolFantasyPlayer,
    MarketPoint,
    RecentMatch,
)
from fantasy_scraping.parser.models.stats import DaznStats, StatLine
from fantasy_scraping.parser.models.supplement import FantasySupplement, FantasyWeek
from fantasy_scraping.parser.rules.schema import RuleSet

_COMPETITION_LABELS: dict[Competition, str] = {
    Competition.LALIGA: "LaLiga",
    Competition.CONFERENCE_LEAGUE: "Conference League",
    Competition.EUROPA_LEAGUE: "Europa League",
    Competition.CHAMPIONS_LEAGUE: "Champions League",
    Competition.COPA_DEL_REY: "Copa del Rey",
    Competition.SUPERCOPA: "Supercopa",
    Competition.OTHER: "Otros",
}

_STAT_ROWS: tuple[tuple[str, str, str | None], ...] = (
    ("Minutos jugados", "minutes_played", "mins_played"),
    ("Goles", "goals", "goals"),
    ("Asistencias de gol", "assists", "goal_assist"),
    ("Ocasiones claras creadas", "big_chances_created", None),
    ("Balones al área", "balls_into_box", "pen_area_entries"),
    ("Penaltis cometidos", "penalties_committed", "penalty_conceded"),
    ("Penaltis parados", "penalties_saved", "penalty_save"),
    ("Paradas", "saves", "saves"),
    ("Despejes efectivos", "clearances", "effective_clearance"),
    ("Penaltis fallados", "penalties_missed", "penalty_failed"),
    ("Goles en propia meta", "own_goals", "own_goals"),
    ("Goles encajados", "goals_conceded", "goals_conceded"),
    ("Tarjetas amarillas", "yellow_cards", "yellow_card"),
    ("Tarjeta roja", "red_card", "red_card"),
    ("Tiros", "shots", "total_scoring_att"),
    ("Regates con éxito", "successful_dribbles", "won_contest"),
    ("Balones recuperados", "ball_recoveries", "ball_recovery"),
    ("Posesiones perdidas", "balls_lost", "poss_lost_all"),
    ("Puntos DAZN", "dazn_points", None),
)

_MARKET_PRESETS: tuple[tuple[str, str, int | None], ...] = (
    ("Temporada", "season", None),
    ("30 días atrás", "days", 30),
    ("14 días atrás", "days", 14),
    ("10 días atrás", "days", 10),
    ("5 días atrás", "days", 5),
)

_SEASON_SLUG = re.compile(r"(\d{2})-(\d{2})")


def render_player_report(
    model: FutbolFantasyPlayer,
    rules: RuleSet,
    supplement: FantasySupplement | None = None,
) -> str:
    """Render the short player report with optional Fantasy supplement data."""
    _ = rules
    if not model.profile.identity.display_name:
        raise RenderError("display_name_missing", "display name missing", section="identity")
    extra = supplement or FantasySupplement()
    blocks = [
        _render_title(model),
        _render_matches(model, extra),
        _render_profile(model),
        _render_fantasy(model, extra),
    ]
    present = ["\n".join(block).rstrip() for block in blocks if block]
    text = "\n\n".join(present)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    if not text.endswith("\n"):
        text += "\n"
    return text


def _render_title(model: FutbolFantasyPlayer) -> list[str]:
    return [f"# {model.profile.identity.display_name}", ""]


def _render_matches(model: FutbolFantasyPlayer, supplement: FantasySupplement) -> list[str]:
    weeks = {item.week_number: item for item in supplement.weeks}
    upcoming_ctx = {item.date: item for item in supplement.upcoming}
    lines = ["## Datos de partidos", "", "### Últimos 5 partidos", ""]
    recent = model.matches.recent[:5]
    if not recent:
        lines.append("*Sin partidos publicados.*")
    else:
        rows = []
        for match in recent:
            rows.append(
                [
                    cell(fmt_date(match.date, "short")),
                    cell(fmt_int(match.matchday) if match.matchday is not None else ""),
                    cell(_match_result(match)),
                    cell(
                        fmt_minutes(match.minutes.raw, match.minutes.minutes, match.minutes.event)
                    ),
                    cell(_competition_label(match.competition)),
                ]
            )
        lines.extend(
            table(
                ["Fecha", "Jornada", "Resultado", "Minutos", "Competición"],
                ["---", "---:", "---", "---", "---"],
                rows,
            )
        )
        for match in recent:
            heading = f"#### Estadísticas ({fmt_date(match.date, 'short')}"
            if match.matchday is not None:
                heading += f", jornada {match.matchday}"
            heading += ")"
            lines.extend(["", heading, ""])
            week = weeks.get(match.matchday) if match.matchday is not None else None
            if match.competition == Competition.LALIGA and week is not None:
                lines.extend(_fantasy_stats_table(week))
            else:
                lines.extend(_dazn_stats_table(match.stats))
    lines.extend(["", "### Próximos 5 partidos", ""])
    upcoming = model.matches.upcoming[:5]
    if not upcoming:
        lines.append("*Sin partidos publicados.*")
        return lines
    rows = []
    for match in upcoming:
        ctx = upcoming_ctx.get(match.date)
        weather = ctx.weather if ctx and ctx.weather else "—"
        distance = fmt_int(ctx.distance_km) if ctx and ctx.distance_km is not None else "—"
        rows.append(
            [
                cell(fmt_date(match.date, "short")),
                cell(fmt_int(match.matchday) if match.matchday is not None else ""),
                cell("Sí (🏠)" if match.is_home else "—"),
                cell(_competition_label(match.competition)),
                cell(weather, free_text=True),
                cell(distance),
            ]
        )
    lines.extend(
        table(
            ["Fecha", "Jornada", "Local", "Competición", "Tiempo", "Kilómetros"],
            ["---", "---:", "---", "---", "---", "---:"],
            rows,
        )
    )
    return lines


def _render_profile(model: FutbolFantasyPlayer) -> list[str]:
    profile = model.profile
    lines = ["## Datos del jugador", ""]
    if profile.injury is None:
        lines.append("*Sin lesión en la cabecera.*")
    else:
        since = fmt_date(profile.injury.since, "year2") if profile.injury.since is not None else "—"
        lines.append(f"**Lesión:** {profile.injury.diagnosis} (desde {since})")
    lines.append("")
    rows: list[tuple[str, str]] = []
    if profile.start_probability is not None:
        start = profile.start_probability
        rows.append(
            (
                "Probabilidad de titularidad",
                f"J{start.matchday} · {start.percent} %",
            )
        )
    if profile.injury_risk is not None:
        rows.append(("Riesgo de lesión", profile.injury_risk.label))
    if profile.max_profitable_bid is not None:
        rows.append(("Puja máxima rentable", profile.max_profitable_bid.label))
    if profile.hierarchy is not None:
        rows.append(("Jerarquía", profile.hierarchy.label))
    if rows:
        body = [[cell(label), cell(value, free_text=True)] for label, value in rows]
        lines.extend(table(["Campo", "Valor"], ["---", "---"], body))
    history = profile.injury_history
    if history is not None and history.entries:
        lines.extend(["", "### Historial de lesiones", ""])
        injury_rows = []
        for entry in history.entries:
            end = (
                "Actualidad" if entry.ongoing or entry.end is None else fmt_date(entry.end, "year2")
            )
            duration = fmt_duration(entry.duration_days) if entry.duration_days is not None else "—"
            injury_rows.append(
                [
                    cell(fmt_date(entry.start, "year2")),
                    cell(end),
                    cell(entry.diagnosis, free_text=True),
                    cell(duration),
                ]
            )
        lines.extend(
            table(
                ["Inicio", "Fin", "Diagnóstico", "Duración"],
                ["---", "---", "---", "---:"],
                injury_rows,
            )
        )
    if profile.news:
        lines.extend(["", "### Noticias", ""])
        news_rows = []
        for item in profile.news:
            when = fmt_date(item.published_on, "full") if item.published_on else "—"
            news_rows.append([cell(item.title, free_text=True), cell(item.url), cell(when)])
        lines.extend(table(["Título", "URL", "Fecha"], ["---", "---", "---"], news_rows))
    return lines


def _render_fantasy(model: FutbolFantasyPlayer, supplement: FantasySupplement) -> list[str]:
    lines = ["## Datos del fantasy", ""]
    if supplement.weeks:
        lines.extend(["### Estadísticas por jornada", ""])
        for week in sorted(supplement.weeks, key=lambda item: item.week_number):
            lines.append(f"#### Jornada {week.week_number} · {fmt_int(week.total_points)} pts")
            lines.append("")
            lines.extend(_fantasy_stats_table(week))
            lines.append("")
    if supplement.market_points:
        lines.extend(["### Valor de mercado", ""])
        rows = []
        for label, kind, days in _MARKET_PRESETS:
            start, end, delta_abs, delta_rel = _market_preset(
                supplement.market_points,
                model.meta.extracted_on,
                model.meta.season_url,
                kind=kind,
                days=days,
            )
            rows.append(
                [
                    cell(label),
                    cell(start),
                    cell(end),
                    cell(delta_abs),
                    cell(delta_rel),
                ]
            )
        lines.extend(
            table(
                ["Ventana", "Desde", "Hasta", "Δ absoluta", "Δ relativa"],
                ["---", "---:", "---:", "---:", "---:"],
                rows,
            )
        )
    return lines


def _match_result(match: RecentMatch) -> str:
    if match.score is None:
        return "—"
    return f"{match.score.home}-{match.score.away}"


def _competition_label(competition: Competition) -> str:
    return _COMPETITION_LABELS.get(competition, "Otros")


def _dazn_stats_table(stats: DaznStats | None) -> list[str]:
    rows = []
    for label, field, _ in _STAT_ROWS:
        line = getattr(stats, field, None) if stats is not None else None
        if not isinstance(line, StatLine):
            line = None
        rows.append([cell(label), cell(_line_count(line)), cell(_line_points(line))])
    return table(["Métrica", "Conteo", "Puntos"], ["---", "---:", "---:"], rows)


def _fantasy_stats_table(week: FantasyWeek) -> list[str]:
    rows = []
    for label, _field, fantasy_key in _STAT_ROWS:
        if fantasy_key is None:
            rows.append([cell(label), cell("—"), cell("—")])
            continue
        count, points = _fantasy_pair(week.stats.get(fantasy_key))
        rows.append([cell(label), cell(count), cell(points)])
    return table(["Métrica", "Conteo", "Puntos"], ["---", "---:", "---:"], rows)


def _line_count(line: StatLine | None) -> str:
    if line is None or line.count is None:
        return "—"
    return fmt_int(line.count)


def _line_points(line: StatLine | None) -> str:
    if line is None:
        return "—"
    if line.status in {"unavailable", "not_applicable"} and line.count is None:
        return "—"
    return _format_points(line.points)


def _format_points(value: float | int) -> str:
    if float(value).is_integer():
        return fmt_int(int(value))
    return fmt_decimal(float(value), 2)


def _fantasy_pair(values: list[int] | None) -> tuple[str, str]:
    if not values:
        return "—", "—"
    count = fmt_int(values[0])
    if len(values) < 2:
        return count, "—"
    return count, _format_points(values[1])


def _market_preset(
    points: list[MarketPoint],
    anchor: date,
    season_url: str | None,
    *,
    kind: str,
    days: int | None,
) -> tuple[str, str, str, str]:
    ordered = sorted(points, key=lambda item: item.date)
    if not ordered:
        return "—", "—", "—", "—"
    last = ordered[-1].date
    window_end = min(anchor, last)
    if kind == "season":
        if _SEASON_SLUG.search(season_url or "") is None:
            window_start = ordered[0].date
        else:
            window_start, season_end = _season_bounds(season_url, window_end)
            window_end = min(window_end, season_end)
    elif days is not None:
        window_start = window_end - timedelta(days=days)
    else:
        window_start = ordered[0].date
    window = [item for item in ordered if window_start <= item.date <= window_end]
    if not window:
        return "—", "—", "—", "—"
    start_value = window[0].value
    end_value = window[-1].value
    delta_abs = end_value - start_value
    delta_rel: float | None = None
    if start_value != 0:
        delta_rel = round((end_value - start_value) / start_value * 100, 4)
    return (
        fmt_int(start_value),
        fmt_int(end_value),
        fmt_signed(delta_abs),
        "—" if delta_rel is None else f"{fmt_signed_decimal(delta_rel)} %",
    )


def _season_bounds(season_url: str | None, anchor: date) -> tuple[date, date]:
    slug = season_url or ""
    found = _SEASON_SLUG.search(slug)
    if found is None:
        return date(anchor.year, 7, 1), date(anchor.year + 1, 6, 30)
    start_yy = int(found.group(1))
    end_yy = int(found.group(2))
    start_year = 2000 + start_yy
    if start_year > anchor.year + 5:
        start_year -= 100
    end_year = start_year + 1 if end_yy == (start_yy + 1) % 100 else 2000 + end_yy
    return date(start_year, 7, 1), date(end_year, 6, 30)
