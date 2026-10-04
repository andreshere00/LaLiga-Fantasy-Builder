"""One pure function per Markdown section."""

from fantasy_scraping.parser.markdown.formatters import (
    fmt_date,
    fmt_decimal,
    fmt_duration,
    fmt_int,
    fmt_minutes,
    fmt_signed,
)
from fantasy_scraping.parser.markdown.options import RenderOptions
from fantasy_scraping.parser.markdown.tables import cell, table
from fantasy_scraping.parser.models.common import CountPercent, Ratio
from fantasy_scraping.parser.models.futbolfantasy import FutbolFantasyPlayer
from fantasy_scraping.parser.rules.schema import RuleSet

_ICON_ORDER = ("goal", "assist", "penalty", "yellow_card", "red_card")


def render_title(model: FutbolFantasyPlayer, rules: RuleSet) -> list[str]:
    """Title and intro sentence."""
    name = model.profile.identity.display_name
    season = model.meta.season_label or model.meta.season_url or ""
    return [
        f"# {name} — Ficha FutbolFantasy ({season})",
        "",
        rules.static_blocks.intro,
    ]


def render_meta(model: FutbolFantasyPlayer, rules: RuleSet) -> list[str]:
    """Meta table. Null rows are omitted."""
    rows = [
        ("Fuente", "futbolfantasy"),
        ("URL", model.meta.url),
        ("Slug", model.meta.slug),
        ("Temporada URL", model.meta.season_url),
        ("Temporada", model.meta.season_label),
        ("Club", model.meta.club),
        ("Ámbito de totales", rules.static_blocks.totals_scope),
        ("Mercado (widget)", model.meta.market_widget_url),
        ("Fecha de extracción", fmt_date(model.meta.extracted_on, "iso")),
    ]
    body = [[cell(label), cell(str(value))] for label, value in rows if value]
    return ["## Meta", "", *table(["Meta", "Valor"], ["---", "---"], body)]


def render_identity(model: FutbolFantasyPlayer) -> list[str]:
    """Identity table."""
    identity = model.profile.identity
    rows = [
        ("Dorsal", fmt_int(identity.shirt_number) if identity.shirt_number is not None else None),
        ("Nombre", identity.display_name),
        ("Posición", identity.position_code),
        ("Escudo", identity.club_badge),
    ]
    body = [[cell(label), cell(str(value))] for label, value in rows if value]
    return ["## Identidad en la ficha", "", *table(["Campo", "Valor"], ["---", "---"], body)]


def render_status(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Fantasy header status."""
    profile = model.profile
    rows: list[tuple[str, str]] = []
    if profile.availability is not None:
        rows.append(("Disponibilidad", profile.availability.label))
    if profile.form is not None:
        if profile.form.visual_only or profile.form.value is None:
            rows.append(("Forma", "Indicador visual"))
        else:
            rows.append(("Forma", fmt_decimal(profile.form.value, 2)))
    if profile.start_probability is not None:
        start = profile.start_probability
        rows.append(("Titular (próx. jornada)", f"J{start.matchday} · {start.percent} %"))
    if profile.injury_risk is not None:
        rows.append(("Riesgo de lesión", profile.injury_risk.label))
    if profile.hierarchy is not None:
        rows.append(("Jerarquía", profile.hierarchy.label))
    if profile.injury is not None:
        rows.append(("Estado médico", profile.injury.diagnosis))
    if not rows and not options.include_empty_sections:
        return []
    body = [[cell(label), cell(value, free_text=True)] for label, value in rows]
    return ["## Estado fantasy (cabecera)", "", *table(["Campo", "Valor"], ["---", "---"], body)]


def render_personal(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Biography table."""
    info = model.profile.personal
    if info is None and not options.include_empty_sections:
        return []
    if info is None:
        return ["## Información personal", ""]
    rows: list[tuple[str, str]] = []
    if info.full_name:
        rows.append(("Nombre", info.full_name))
    if info.age_years is not None:
        rows.append(("Edad", f"{info.age_years} años"))
    if info.birth_date is not None:
        rows.append(("Fecha de nacimiento", fmt_date(info.birth_date, "full")))
    if info.birth_place:
        rows.append(("Lugar de nacimiento", info.birth_place))
    if info.nationalities:
        rows.append(("Nacionalidad", " / ".join(info.nationalities)))
    if info.height_cm is not None:
        rows.append(("Altura", f"{info.height_cm} cm"))
    if info.preferred_foot:
        rows.append(
            (
                "Pierna",
                {"left": "Izquierda", "right": "Derecha", "both": "Ambas"}[info.preferred_foot],
            )
        )
    if info.contract_end is not None:
        rows.append(("Fin de contrato", fmt_date(info.contract_end, "full")))
    for link in info.social:
        rows.append((link.network, link.url))
    if not rows and not options.include_empty_sections:
        return []
    body = [[cell(label), cell(value, free_text=True)] for label, value in rows]
    return ["## Información personal", "", *table(["Campo", "Valor"], ["---", "---"], body)]


def render_position(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Position, field map and platform roles."""
    position = model.profile.position
    lines: list[str] = []
    if position is not None:
        rows = []
        if position.main:
            rows.append(("Posición principal", position.main))
        if position.demarcations:
            rows.append(("Demarcaciones", ", ".join(position.demarcations)))
        rows.append(
            ("Mapa de campo", "Disponible" if position.field_map_available else "No disponible")
        )
        body = [[cell(label), cell(value, free_text=True)] for label, value in rows]
        lines.extend(
            ["## Posición y demarcaciones", "", *table(["Campo", "Valor"], ["---", "---"], body)]
        )
    elif options.include_empty_sections:
        lines.extend(["## Posición y demarcaciones", ""])
    if model.profile.platform_roles:
        role_rows = [
            [cell(item.platform, free_text=True), cell(item.role, free_text=True)]
            for item in model.profile.platform_roles
        ]
        if lines:
            lines.append("")
        lines.extend(
            [
                "### Etiquetas por plataforma",
                "",
                *table(["Plataforma", "Rol"], ["---", "---"], role_rows),
            ]
        )
    return lines


def render_injuries(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Injury map and history."""
    history = model.profile.injury_history
    if history is None and not options.include_empty_sections:
        return []
    lines = ["## Lesiones", ""]
    if history is None:
        return lines
    if history.body_map:
        rows = [
            [cell(item.zone, free_text=True), cell(fmt_int(item.incidents))]
            for item in history.body_map
        ]
        lines.extend(
            ["### Mapa de lesiones", "", *table(["Zona", "Incidencias"], ["---", "---:"], rows), ""]
        )
    if history.body_map_note:
        lines.extend([history.body_map_note, ""])
    lines.append("### Historial (extracto reciente)")
    lines.append("")
    if not history.entries:
        lines.append("*Sin lesiones registradas en la ficha.*")
        return lines
    rows = []
    for entry in history.entries:
        end = "Actualidad" if entry.ongoing or entry.end is None else fmt_date(entry.end, "year2")
        duration = fmt_duration(entry.duration_days) if entry.duration_days is not None else "—"
        rows.append(
            [
                cell(fmt_date(entry.start, "year2")),
                cell(end),
                cell(entry.diagnosis, free_text=True),
                cell(duration),
            ]
        )
    lines.extend(
        table(["Inicio", "Fin", "Diagnóstico", "Duración"], ["---", "---", "---", "---:"], rows)
    )
    return lines


def render_calendar(model: FutbolFantasyPlayer) -> list[str]:
    """Recent and upcoming widgets."""
    lines = ["## Calendario reciente y próximo", "", "### Últimos 5 partidos (widget cabecera)", ""]
    if not model.matches.recent:
        lines.append("*Sin partidos publicados.*")
    else:
        rows = []
        for match in model.matches.recent:
            score = "—"
            if match.score is not None:
                score = f"{match.score.home}-{match.score.away}"
            competition = ""
            if match.competition.value != "laliga":
                competition = f" · {match.competition.value}"
            rows.append(
                [
                    cell(fmt_date(match.date, "short")),
                    cell(fmt_int(match.matchday) if match.matchday is not None else ""),
                    cell(score + competition),
                    cell(
                        fmt_minutes(match.minutes.raw, match.minutes.minutes, match.minutes.event)
                    ),
                ]
            )
        lines.extend(
            table(
                ["Fecha", "J", "Marcador", "Minutos / notas"],
                ["---", "---:", "---", "---"],
                rows,
            )
        )
    lines.extend(["", "### Próximos 5 partidos", ""])
    if not model.matches.upcoming:
        lines.append("*Sin partidos publicados.*")
        return lines
    rows = []
    for match in model.matches.upcoming:
        home = "Sí (🏠)" if match.is_home else "—"
        kick = f"{match.kickoff}h" if match.kickoff else "—"
        rows.append(
            [
                cell(fmt_date(match.date, "short")),
                cell(fmt_int(match.matchday) if match.matchday is not None else ""),
                cell(kick),
                cell(home),
                cell(match.competition.value),
            ]
        )
    lines.extend(
        table(
            ["Fecha", "J", "Hora", "Local", "Competición"],
            ["---", "---:", "---", "---", "---"],
            rows,
        )
    )
    return lines


def render_market(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Market section. Omitted when the widget was absent."""
    market = model.market
    if market is None and not options.include_empty_sections:
        return []
    lines = ["## Mercado LaLiga Fantasy Oficial", ""]
    if market is None:
        return lines
    rows: list[tuple[str, str]] = []
    if market.current_value is not None:
        rows.append(("Valor actual", fmt_int(market.current_value)))
    if market.last_change is not None:
        change = market.last_change
        rows.append(
            (
                "Variación",
                f"{fmt_signed(change.absolute)} ({fmt_signed_decimal(change.percent)} %)",
            )
        )
    if market.max_recent is not None and market.max_recent.date is not None:
        rows.append(
            (
                "Valor máximo reciente",
                f"{fmt_int(market.max_recent.value)} ({fmt_date(market.max_recent.date, 'short')})",
            )
        )
    if market.min_recent is not None and market.min_recent.date is not None:
        rows.append(
            (
                "Valor mínimo reciente",
                f"{fmt_int(market.min_recent.value)} ({fmt_date(market.min_recent.date, 'short')})",
            )
        )
    if market.window_days is not None:
        rows.append(("Ventana gráfico", f"{market.window_days} días"))
    if market.widget_season:
        rows.append(("Temporada mercado en widget", market.widget_season))
    bid = model.profile.max_profitable_bid
    if bid is not None:
        rows.append(("Puja máxima rentable", bid.label))
    body = [[cell(label), cell(value)] for label, value in rows]
    lines.extend(table(["Campo", "Valor"], ["---", "---"], body))
    if market.daily_moves:
        move_rows = [
            [
                cell(fmt_date(item.date, "short")),
                cell(fmt_signed(item.change)),
                cell(fmt_int(item.value)),
            ]
            for item in market.daily_moves
        ]
        lines.extend(
            [
                "",
                "### Últimos movimientos diarios (extracto)",
                "",
                *table(["Fecha", "Cambio", "Valor"], ["---", "---:", "---:"], move_rows),
            ]
        )
    return lines


def render_news(model: FutbolFantasyPlayer) -> list[str]:
    """News section. Omitted when there are no items."""
    if not model.profile.news:
        return []
    rows = []
    for item in model.profile.news:
        when = fmt_date(item.published_on, "full") if item.published_on else "—"
        rows.append([cell(item.title, free_text=True), cell(item.url), cell(when)])
    return [
        "## Noticias",
        "",
        *table(["Título", "URL", "Fecha"], ["---", "---", "---"], rows),
    ]


def render_season(model: FutbolFantasyPlayer, options: RenderOptions) -> list[str]:
    """Season stat groups."""
    stats = model.season_stats
    if stats is None and not options.include_empty_sections:
        return []
    lines = ["## Estadísticas de temporada (LaLiga)", ""]
    if stats is None:
        return lines
    if stats.participation is not None:
        part = stats.participation
        rows = [
            ["Partidos jugados", _num(part.matches_played)],
            ["Titular", _count(part.starter)],
            ["Suplente", _count(part.substitute)],
            ["Minutos", _num(part.minutes)],
        ]
        lines.extend(["### Participación", "", *_stat_table(rows), ""])
    if stats.attack is not None:
        attack = stats.attack
        rows = [
            ["Goles", _num(attack.goals)],
            ["Asistencias", _num(attack.assists)],
            ["Ocasiones claras creadas", _num(attack.clear_chances_created)],
            ["Tiros a puerta", _ratio(attack.shots_on_target)],
            ["Regates con éxito", _num(attack.successful_dribbles)],
        ]
        lines.extend(["### Ataque y creación", "", *_stat_table(rows), ""])
    if stats.discipline is not None:
        item = stats.discipline
        rows = [
            ["Faltas recibidas", _num(item.fouls_received)],
            ["Faltas cometidas", _num(item.fouls_committed)],
            ["Tarjetas amarillas", _num(item.yellow_cards)],
            ["Tarjetas rojas", _num(item.red_cards)],
        ]
        lines.extend(["### Disciplina y duelos", "", *_stat_table(rows), ""])
    if stats.defense is not None:
        item = stats.defense
        rows = [
            ["Posesiones perdidas", _num(item.possessions_lost)],
            ["Despejes", _num(item.effective_clearances)],
            ["Penaltis cometidos", _num(item.penalties_committed)],
            ["Penaltis fallados", _num(item.penalties_missed)],
        ]
        lines.extend(["### Defensa pérdidas y penaltis", "", *_stat_table(rows), ""])
    if stats.goalkeeper is not None:
        item = stats.goalkeeper
        rows = [
            ["Paradas", _num(item.saves)],
            ["Penaltis parados", _num(item.penalties_saved)],
            ["Goles encajados", _num(item.goals_conceded)],
        ]
        lines.extend(["### Portero", "", *_stat_table(rows), ""])
    if stats.selector_catalog:
        rows = [
            [cell(group.group), cell(", ".join(group.stats))] for group in stats.selector_catalog
        ]
        lines.extend(
            [
                "### Métricas disponibles en selector",
                "",
                *table(["Grupo", "Métricas"], ["---", "---"], rows),
            ]
        )
    return lines


def render_points(model: FutbolFantasyPlayer, rules: RuleSet, options: RenderOptions) -> list[str]:
    """Official fantasy points."""
    points = model.fantasy_points
    if points is None and not options.include_empty_sections:
        return []
    lines = ["## Puntos fantasy — LaLiga Fantasy Oficial", ""]
    if points is None:
        return lines
    lines.append(f"Modo seleccionado: **{points.mode}**")
    lines.append("")
    rows = [
        ["Total", _gross(points.total.gross), _gross(points.total.net)],
        ["Local", _gross(points.total_home.gross), _gross(points.total_home.net)],
        ["Visitante", _gross(points.total_away.gross), _gross(points.total_away.net)],
        ["Media", _gross(points.average.gross), _gross(points.average.net)],
        ["Media local", _gross(points.average_home.gross), _gross(points.average_home.net)],
        ["Media visitante", _gross(points.average_away.gross), _gross(points.average_away.net)],
        ["Media últimos 3", _gross(points.average_last_3.gross), _gross(points.average_last_3.net)],
    ]
    lines.extend(
        table(
            ["", "Brutos", "Netos"],
            ["---", "---:", "---:"],
            [[cell(a), cell(b), cell(c)] for a, b, c in rows],
        )
    )
    if points.scoring_modes:
        mode_rows = [
            [cell(item.platform), cell(", ".join(item.variants) if item.variants else "—")]
            for item in points.scoring_modes
        ]
        lines.extend(["", *table(["Plataforma", "Variantes"], ["---", "---"], mode_rows)])
    lines.extend(["", rules.static_blocks.other_modes])
    return lines


def render_fixtures(
    model: FutbolFantasyPlayer,
    rules: RuleSet,
    options: RenderOptions,
) -> list[str]:
    """Main match table."""
    if not model.fixtures and not options.include_empty_sections:
        return []
    lines = ["## Partidos LaLiga — tabla principal", ""]
    if not model.fixtures:
        return lines
    rows = []
    for fixture in model.fixtures:
        home = fixture.match.home_code
        away = fixture.match.away_code
        match = f"{home} {fixture.match.home_goals}-{fixture.match.away_goals} {away}"
        stars = "★" * fixture.stars if fixture.stars else "—"
        grade = fmt_decimal(fixture.grade, 1) if fixture.grade is not None else "—"
        rows.append(
            [
                cell(fmt_int(fixture.matchday)),
                cell(match),
                cell(
                    fmt_minutes(
                        fixture.minutes_out.raw,
                        fixture.minutes_out.minutes,
                        fixture.minutes_out.event,
                    )
                ),
                cell(stars),
                cell(grade),
                cell(fmt_int(fixture.dazn_points) if fixture.dazn_points is not None else ""),
                cell(fmt_int(fixture.week_points) if fixture.week_points is not None else ""),
                cell(_icons(fixture, rules)),
                cell(_crude(fixture)),
            ]
        )
    lines.extend(
        table(
            [
                "J",
                "Partido",
                "Salida",
                "Estrellas",
                "Nota",
                "DAZN",
                "Puntos",
                "Eventos (iconos)",
                "Estadísticas crudas",
            ],
            ["---:", "---", "---", "---", "---:", "---:", "---:", "---", "---"],
            rows,
        )
    )
    return lines


def render_static(model: FutbolFantasyPlayer, rules: RuleSet, options: RenderOptions) -> list[str]:
    """Static explanation blocks."""
    if not options.include_static_blocks:
        return []
    lines = [
        "## Desglose por partido (al expandir ficha)",
        "",
        rules.static_blocks.layers_heading,
        "",
        *table(
            ["Capa", "Contenido"],
            ["---", "---"],
            [
                [cell("Puntos estadísticos"), cell("Conteo y puntos fantasy")],
                [cell("Relevo"), cell("Puntos DAZN")],
                [cell("Eventos"), cell("Conteo publicado")],
                [cell("Otros modos"), cell(rules.static_blocks.other_modes)],
            ],
        ),
        "",
        "### Eventos usados en puntuación",
        "",
    ]
    current = ""
    for event in rules.events:
        if event.category != current:
            current = event.category
            lines.extend([f"#### {current}", ""])
        lines.append(f"- {event.label} (`{event.md_label}`)")
    lines.extend(
        [
            "",
            "## Iconografía en columna «Eventos»",
            "",
            rules.static_blocks.iconography_intro,
            "",
        ]
    )
    icon_rows = [
        [cell(event.icon), cell(event.singular or event.label)]
        for event in rules.events
        if event.icon
    ]
    lines.extend(table(["Icono", "Significado"], ["---", "---"], icon_rows))
    lines.extend(
        [
            "",
            "## Alcance y limitaciones",
            "",
            rules.static_blocks.scope_limits,
            "",
            rules.static_blocks.tools,
            "",
            "## Referencia cruzada (concepto DAZN ↔ campo en ficha)",
            "",
        ]
    )
    cross = [[cell(item.concept), cell(item.field)] for item in rules.static_blocks.cross_reference]
    lines.extend(table(["Concepto", "Campo"], ["---", "---"], cross))
    _ = model
    return lines


def _stat_table(rows: list[list[str]]) -> list[str]:
    return table(
        ["Métrica", "Valor"], ["---", "---:"], [[cell(label), cell(value)] for label, value in rows]
    )


def _num(value: int | None) -> str:
    return fmt_int(value) if value is not None else "—"


def _count(value: CountPercent | None) -> str:
    if value is None:
        return "—"
    if value.percent is None:
        return fmt_int(value.count)
    return f"{value.count} ({value.percent} %)"


def _ratio(value: Ratio | None) -> str:
    if value is None:
        return "—"
    if value.denominator is None:
        return fmt_int(value.numerator)
    if value.percent is None:
        return f"{value.numerator} / {value.denominator}"
    return f"{value.numerator} / {value.denominator} ({value.percent} %)"


def _gross(value: float | None) -> str:
    if value is None:
        return "—"
    if float(value).is_integer():
        return fmt_int(int(value))
    return fmt_decimal(value, 2)


def fmt_signed_decimal(value: float) -> str:
    """Format a signed decimal percent change."""
    if value > 0:
        return f"+{fmt_decimal(value, 2)}"
    return fmt_decimal(value, 2)


def _icons(fixture: object, rules: RuleSet) -> str:
    from fantasy_scraping.parser.models.futbolfantasy import FixtureRow

    if not isinstance(fixture, FixtureRow) or not fixture.icon_events:
        return "—"
    labels = {event.key: event for event in rules.events}
    parts: list[str] = []
    counts = {item.kind: item.count for item in fixture.icon_events}
    for kind in _ICON_ORDER:
        count = counts.get(kind)
        if not count:
            continue
        event = labels.get(kind)
        if event is None:
            continue
        if count == 1:
            parts.append(event.singular or event.md_label)
        else:
            parts.append(f"{count} {event.plural or event.md_label}")
    return ", ".join(parts) if parts else "—"


def _crude(fixture: object) -> str:
    from fantasy_scraping.parser.models.futbolfantasy import FixtureRow

    if not isinstance(fixture, FixtureRow) or fixture.layers is None or not fixture.layers.events:
        return "—"
    parts = []
    for event in fixture.layers.events:
        parts.append(f"{event.label} ({event.count})")
    return ", ".join(parts) if parts else "—"
