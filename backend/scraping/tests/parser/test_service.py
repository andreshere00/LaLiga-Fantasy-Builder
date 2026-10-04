"""Service, merge, markdown and error behaviour."""

from datetime import date, datetime
from pathlib import Path

import pytest
from fantasy_scraping.models.page import PageKind, ScrapedPage
from fantasy_scraping.parser.errors import ParseError, RenderError, UnsupportedLayoutError
from fantasy_scraping.parser.hashing import canonical_json, content_hash
from fantasy_scraping.parser.markdown.options import RenderOptions
from fantasy_scraping.parser.models.futbolfantasy import MarketPoint
from fantasy_scraping.parser.models.supplement import FantasySupplement, FantasyWeek
from fantasy_scraping.parser.service import ParserService
from support import FETCHED_AT, page

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()
GOLDEN = Path(__file__).parent / "golden"


def _codes(player: object) -> set[str]:
    return {item.code for item in player.warnings}  # type: ignore[attr-defined]


# ---- Happy path ---- #


def test_parse_futbolfantasy_raphinha_page_matches_published_totals() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    assert player.profile.identity.display_name == "Raphinha"
    assert player.profile.identity.shirt_number == 11
    assert player.season_stats is not None
    assert player.season_stats.participation is not None
    assert player.season_stats.participation.minutes == 550
    assert sum(row.week_points or 0 for row in player.fixtures) == 117
    assert player.fantasy_points is not None
    assert player.fantasy_points.total.net == 117
    assert player.fantasy_points.total_home.net == 52
    assert player.fantasy_points.total_away.net == 65
    assert player.market is not None
    assert player.market.current_value == 172_907_890
    assert player.meta.market_widget_id == 4288
    assert player.meta.extracted_on.isoformat() == "2026-10-04"
    assert "form_visual_only" in _codes(player)
    assert "market_season_mismatch" in _codes(player)
    assert player.profile.news[0].source == "FutbolFantasy"
    assert "injury_map_total_mismatch" in _codes(player)


def test_parse_competition_companions_merges_recent_stats() -> None:
    merged = SERVICE.parse_futbolfantasy(
        page("raphinha_laliga_26_27.html"),
        companions=[
            page(
                "raphinha_champions_26_27.html",
                season_slug="champions-26-27",
                kind=PageKind.COMPETITION,
            ),
            page(
                "raphinha_copa_25_26.html",
                season="2025-26",
                season_slug="copa-del-rey-25-26",
                kind=PageKind.COMPETITION,
            ),
        ],
    )
    champions = merged.matches.recent[1]
    assert champions.competition.value == "champions_league"
    assert champions.stats is not None
    assert champions.stats.goals.count == 2
    copa = next(row for row in merged.fixtures if row.competition.value == "copa_del_rey")
    assert copa.stats.minutes_played.count == 113
    assert copa.stats.dazn_points.reason == "league_only"
    again = SERVICE.merge_competitions(
        [
            SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html")),
            SERVICE.parse_futbolfantasy(
                page(
                    "raphinha_champions_26_27.html",
                    season_slug="champions-26-27",
                    kind=PageKind.COMPETITION,
                )
            ),
        ]
    )
    assert any(row.competition.value == "champions_league" for row in again.fixtures)
    false_drift = {
        "minutes_sum_mismatch",
        "average_mismatch",
        "season_window_mismatch",
    }
    assert false_drift.isdisjoint(_codes(merged))


def test_parse_goalkeeper_page_reads_saves() -> None:
    player = SERVICE.parse_futbolfantasy(
        page(
            "goalkeeper_champions.html",
            slug="ter-stegen",
            season_slug="champions-26-27",
            kind=PageKind.COMPETITION,
        )
    )
    assert player.profile.identity.position_code == "POR"
    assert player.season_stats is not None
    assert player.season_stats.goalkeeper is not None
    assert player.season_stats.goalkeeper.saves == 4
    assert player.fixtures[0].stats.penalties_saved.count == 1
    assert player.fixtures[0].stats.saves.status == "ok"


def test_to_markdown_raphinha_is_stable_and_structured() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    text = SERVICE.to_markdown(player)
    assert text.startswith("# Raphinha — Ficha FutbolFantasy (LaLiga 2026/27)\n")
    assert text.endswith("\n") and not text.endswith("\n\n")
    assert "\t" not in text
    assert "## Noticias" in text
    assert "172.907.890" in text
    assert "16,71" in text
    assert "Sí (🏠)" in text
    assert SERVICE.to_markdown(player) == text
    hidden = SERVICE.to_markdown(player, RenderOptions(include_static_blocks=False))
    assert "## Iconografía" not in hidden
    round_trip = player.model_validate_json(canonical_json(player))
    assert SERVICE.to_markdown(round_trip) == text


def test_to_player_report_raphinha_with_and_without_supplement() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    base = SERVICE.to_player_report(player)
    assert base.startswith("# Raphinha\n")
    assert "## Datos de partidos" in base
    assert "### Últimos 5 partidos" in base
    for token in ("03/10", "30/09", "27/09", "23/09", "19/09"):
        assert token in base
    assert "## Datos del jugador" in base
    assert "*Sin lesión en la cabecera.*" in base
    assert "### Próximos 5 partidos" in base
    upcoming = base.split("### Próximos 5 partidos", maxsplit=1)[1]
    assert "| — |" in upcoming
    assert SERVICE.to_player_report(player) == base

    supplement = FantasySupplement(
        weeks=[
            FantasyWeek(
                week_number=7,
                total_points=42,
                stats={"mins_played": [76, 2], "goals": [1, 99], "goal_assist": [1, 9]},
            )
        ],
        market_points=[
            MarketPoint(date=date(2026, 9, 29), value=170_000_000),
            MarketPoint(date=date(2026, 10, 1), value=171_000_000),
            MarketPoint(date=date(2026, 10, 3), value=172_000_000),
            MarketPoint(date=date(2026, 10, 4), value=173_000_000),
        ],
    )
    enriched = SERVICE.to_player_report(player, supplement)
    assert "#### Estadísticas (03/10, jornada 7)" in enriched
    assert "| Goles | 1 | 99 |" in enriched
    assert "## Datos del fantasy" in enriched
    assert "### Estadísticas por jornada" in enriched
    assert "+3.000.000" in enriched
    assert "5 días atrás" in enriched


def test_parse_content_hash_ignores_cache_flag() -> None:
    first = SERVICE.parse(page("raphinha_laliga_26_27.html"))
    second = SERVICE.parse(page("raphinha_laliga_26_27.html"))
    assert first == second
    assert first.content_hash == content_hash(first)
    assert canonical_json(first) == canonical_json(second)


# ---- Error paths ---- #


def test_parse_futbolfantasy_not_a_player_raises() -> None:
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("not_a_player.html"))
    assert caught.value.code == "not_a_player_page"
    assert "FutbolFantasy" not in caught.value.detail


def test_parse_futbolfantasy_layout_drift_raises() -> None:
    with pytest.raises(UnsupportedLayoutError) as caught:
        SERVICE.parse_futbolfantasy(page("layout_drift.html"))
    assert caught.value.code == "layout_drift"


def test_parse_futbolfantasy_upstream_status_raises() -> None:
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("status_404.html", status_code=404))
    assert caught.value.code == "upstream_status"


def test_parse_futbolfantasy_rejects_non_http_url() -> None:
    bad = page(
        "raphinha_laliga_26_27.html", url="ftp://example.com/jugadores/raphinha/laliga-26-27"
    )
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(bad)
    assert caught.value.code == "input_invalid"


def test_parse_futbolfantasy_rejects_bad_input() -> None:
    naive = page("raphinha_laliga_26_27.html").model_copy(
        update={"fetched_at": datetime(2026, 10, 4, 12, 0)}
    )
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(naive)
    assert caught.value.code == "input_invalid"
    huge = page("status_404.html", html="x" * 20, status_code=200)
    with pytest.raises(ParseError) as caught:
        ParserService(settings=_small()).parse_futbolfantasy(huge)
    assert caught.value.code == "html_too_large"
    empty = page("status_404.html", html="   ", status_code=200)
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(empty)
    assert caught.value.code == "html_empty"


def test_parse_wrong_source_raises_input_invalid() -> None:
    broken = ScrapedPage.model_construct(
        source="fbref",
        kind=PageKind.PLAYER,
        url="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27",
        fetched_at=FETCHED_AT,
        status_code=200,
        html="<html></html>",
        from_cache=False,
        season="2026-27",
        player_slug="raphinha",
        season_slug="laliga-26-27",
    )
    with pytest.raises(ParseError) as caught:
        SERVICE.parse(broken)
    assert caught.value.code == "input_invalid"


def test_to_markdown_missing_name_raises() -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    nameless = player.model_copy(
        update={"profile": player.profile.model_copy(update={"identity": _blank_identity(player)})}
    )
    with pytest.raises(RenderError):
        SERVICE.to_markdown(nameless)


# ---- Edge cases ---- #


def test_parse_futbolfantasy_slug_and_season_mismatch_raise() -> None:
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html", slug="otro"))
    assert caught.value.code == "slug_mismatch"
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html", season="2025-26"))
    assert caught.value.code == "season_mismatch"


def test_parse_futbolfantasy_fragment_edges_keep_partial_data() -> None:
    html = """
    <html><head>
    <link rel="canonical" href="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27">
    <script type="application/ld+json">{not json</script>
    <script type="application/ld+json">{"@type":"Person","name":"Other","birthDate":"1990-01-01","height":{"value":180},"sameAs":["javascript:alert(1)","https://example.com/a"]}</script>
    </head><body>
    <h1><span class="name">Raphinha</span><span class="pos">??</span></h1>
    <a class="club" href="/equipos/barcelona">FC Barcelona</a>
    <p class="disponibilidad">En observación</p>
    <div class="forma" data-value="7,5"></div>
    <p class="estado-medico">Lesión muscular desde 01/10/2026</p>
    <dl class="personal"><dt>Nombre</dt><dd>Raphael Dias
        Belloli</dd><dt>Nacionalidad</dt><dd>Brasil / España</dd></dl>
    <ul class="ultimos"></ul>
    <ul class="noticias">
      <li><span class="fuente">Sin enlace</span></li>
      <li>
        <a href="javascript:void(0)">Ignorar</a>
        <time datetime="bad-date">mal</time>
        <span class="resumen">Resumen breve</span>
      </li>
    </ul>
    <section class="lesiones">
      <table class="historial"><thead><tr><th>Inicio</th></tr></thead><tbody>
        <tr><td class="inicio">01/09/26</td><td class="fin">Actualidad</td><td
            class="diagnostico">Molestia</td><td class="duracion">3 días</td></tr>
        <tr><td class="inicio"></td><td class="diagnostico"></td></tr>
      </tbody></table>
    </section>
    <div id="profile-stats-puntos"><div class="statsglobales">
      <div class="bigstat"><span class="label">Minutos jugados</span><span
          class="value">90</span></div>
      <div class="stat info"><span class="cell label">Goles</span><span
          class="cell value">1</span></div>
    </div></div>
    <table class="partidos"><thead><tr><th>J</th></tr></thead><tbody>
      <tr class="plegado">
        <td class="fecha">03/10</td><td class="jornada">7</td><td class="partido">SEV 1-2 BAR</td>
        <td class="salida">Sale
            70'</td><td class="lado">local</td><td class="puntos">8</td><td class="dazn">2</td>
        <td class="iconos"><i class="icon-goal"></i><i class="icon-unknown"></i></td>
        <td>
          <span class="stat-val stat-tiros-puerta">2</span>
          <span class="stat-val stat-tiros-palo">1</span>
          <span class="stat-val stat-balones-robados">3</span>
          <div class="estadistica">2 Doble amarilla → 0 p</div>
          <div class="estadistica">oc. creadas/falladas (1/1)</div>
          <div class="estadistica">70 Minutos jugados → 8 p</div>
        </td>
      </tr>
      <tr class="plegado"><td class="partido">sin jornada</td></tr>
    </tbody></table>
    <section class="mercado">
      <span class="valor-actual">10</span>
      <span class="variacion">no</span>
      <script class="market-series">[{"date":"01/10","value":10}]</script>
    </section>
    </body></html>
    """
    player = SERVICE.parse_futbolfantasy(page("ignored.html", html=html))
    assert player.profile.form is not None and player.profile.form.value == 7.5
    assert player.profile.injury is not None
    assert player.profile.news == []
    assert "profile.news" not in player.missing
    assert player.fixtures[0].stats.shots.status == "partial"
    assert player.fixtures[0].stats.shots.count == 3
    assert player.fixtures[0].stats.yellow_cards.count == 2
    assert player.fixtures[0].stats.yellow_cards.points == 0.0
    assert player.fixtures[0].stats.ball_recoveries.count == 3
    assert player.market is not None
    assert player.market.series is not None
    assert any(item.code == "icon_unmapped" for item in player.warnings)
    assert any(item.code == "jsonld_invalid" for item in player.warnings)
    assert any(item.code == "jsonld_mismatch" for item in player.warnings)
    assert player.profile.injury_history is not None
    assert player.profile.injury_history.entries[0].ongoing is True


def test_error_detail_does_not_echo_input() -> None:
    token = "TOKENVALUE1234567890TOKENVALUE"
    html = f"<html><body><h1>{token}</h1><p>{token}</p></body></html>"
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("ignored.html", html=html))
    detail = caught.value.detail
    for index in range(0, len(html) - 19):
        assert html[index : index + 20] not in detail


def test_merge_competitions_empty_input_raises() -> None:
    with pytest.raises(ParseError):
        SERVICE.merge_competitions([])


def test_parse_futbolfantasy_market_widget_companion_overlays_market() -> None:
    import re

    base_html = re.sub(
        r"<section class=\"mercado\">[\s\S]*?</section>",
        "",
        page("raphinha_laliga_26_27.html").html,
        count=1,
    )
    widget_html = """
    <html><body><section class="mercado">
      <span class="valor-actual">99.999</span>
      <span class="variacion">+1 (0,5 %)</span>
    </section></body></html>
    """
    player = SERVICE.parse_futbolfantasy(
        page("raphinha_laliga_26_27.html", html=base_html),
        companions=[
            page(
                "widget.html",
                html=widget_html,
                kind=PageKind.MARKET_WIDGET,
                url="https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado/detalle/4288",
            )
        ],
    )
    assert player.market is not None
    assert player.market.current_value == 99_999


def test_parse_futbolfantasy_market_widget_without_market_block_is_noop() -> None:
    import re

    base_html = re.sub(
        r"<section class=\"mercado\">[\s\S]*?</section>",
        "",
        page("raphinha_laliga_26_27.html").html,
        count=1,
    )
    player = SERVICE.parse_futbolfantasy(
        page("raphinha_laliga_26_27.html", html=base_html),
        companions=[
            page(
                "empty.html",
                html="<html><body></body></html>",
                kind=PageKind.MARKET_WIDGET,
                url="https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado/detalle/1",
            )
        ],
    )
    assert player.market is None


def test_markdown_golden_snapshot_matches_file(request: pytest.FixtureRequest) -> None:
    player = SERVICE.parse_futbolfantasy(page("raphinha_laliga_26_27.html"))
    text = SERVICE.to_markdown(player)
    target = GOLDEN / "raphinha_laliga_26_27.expected.md"
    reference = GOLDEN / "raphinha_laliga_26_27.reference.md"
    json_target = GOLDEN / "raphinha_laliga_26_27.json"
    payload = canonical_json(player)
    if request.config.getoption("--update-golden"):
        target.write_text(text, encoding="utf-8")
        reference.write_text(text, encoding="utf-8")
        json_target.write_text(payload, encoding="utf-8")
    assert target.read_text(encoding="utf-8") == text
    assert reference.read_text(encoding="utf-8") == text
    assert json_target.read_text(encoding="utf-8") == payload


def _small() -> object:
    from fantasy_scraping.parser.settings import ParserSettings

    return ParserSettings(max_html_bytes=8)


def _blank_identity(player: object) -> object:
    identity = player.profile.identity  # type: ignore[attr-defined]
    return identity.model_copy(update={"display_name": ""})
