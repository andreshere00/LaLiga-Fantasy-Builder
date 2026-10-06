"""Per-match fixture extraction helpers."""

import re

import pytest
from support import page

from fantasy_scraping.parser.errors import ParseError
from fantasy_scraping.parser.extractors.fixtures import (
    _json_shot_parts,
    _read_layer,
    _shots,
    _side,
)
from fantasy_scraping.parser.rules.loader import RuleRepository
from fantasy_scraping.parser.service import ParserService

# ---- Mocks, fixtures & helpers ---- #

SERVICE = ParserService()
RULES = RuleRepository().load()


def _layer_context():
    from fantasy_scraping.parser.dom.document import parse_html
    from fantasy_scraping.parser.extractors.base import ExtractionContext

    document, _, _ = parse_html("<html><body></body></html>")
    scraped = page("ignored.html", html="<html></html>")
    return ExtractionContext(
        page=scraped,
        document=document,
        rules=RULES,
        settings=SERVICE.settings,
        json_ld=None,
        warnings=[],
    )


# ---- Happy path ---- #


def test_side_maps_live_home_and_away_tokens() -> None:
    assert _side("Sí") == "home"
    assert _side("No") == "away"
    assert _side("1") == "home"
    assert _side("0") == "away"
    assert _side("local") == "home"
    assert _side("visitante") == "away"


def test_shots_prefers_shots_on_target_over_component_sum() -> None:
    payload = {"tiros_puerta": 2, "tiros_palo": 1, "tiros_bloqueados": 1}
    result = _shots({}, {}, {}, payload, layer_present=True)
    assert result.status == "ok"
    assert result.count == 2


def test_shots_sums_json_components_when_on_target_missing() -> None:
    payload = {"tiros_palo": 1, "tiros_bloqueados": 1}
    result = _shots({}, {}, {}, payload, layer_present=True)
    assert result.status == "partial"
    assert result.count == 2
    assert result.reason == "no_per_match_total"


def test_json_shot_parts_ignores_non_integers() -> None:
    assert _json_shot_parts({"tiros_puerta": 2, "tiros_palo": "x"}) == [2]


def test_read_layer_shots_on_target_replaces_total_shots() -> None:
    ctx = _layer_context()
    points: dict[str, float] = {}
    counts: dict[str, int] = {}
    owners: dict[str, str] = {}
    _read_layer(ctx, "6 Tiros totales 1 p", points, counts, [], [], [], owners)
    _read_layer(ctx, "4 Tiros a puerta 2 p", points, counts, [], [], [], owners)
    assert counts["shots"] == 4
    assert points["shots"] == 2


def test_read_layer_assist_without_goal_does_not_fill_big_chances() -> None:
    ctx = _layer_context()
    points: dict[str, float] = {}
    counts: dict[str, int] = {}
    extra: list[object] = []
    _read_layer(ctx, "4 Asistencias sin gol 1 p", points, counts, [], [], extra)
    assert "big_chances_created" not in counts
    assert extra


def test_read_layer_clear_chances_pair_fills_dazn_field() -> None:
    ctx = _layer_context()
    points: dict[str, float] = {}
    counts: dict[str, int] = {}
    statistical = []
    events = []
    extra = []
    _read_layer(
        ctx,
        "oc. creadas/falladas (1/1)",
        points,
        counts,
        statistical,
        events,
        extra,
    )
    assert counts["big_chances_created"] == 1
    assert len(events) == 2


def test_parse_fragment_official_layer_fills_scored_minutes_and_points() -> None:
    html = """
    <html><head>
    <link rel="canonical" href="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27">
    </head><body>
    <h1><span class="name">Raphinha</span><span class="pos">DEL</span></h1>
    <a class="club" href="/equipos/barcelona">FC Barcelona</a>
    <ul class="ultimos"></ul>
    <div id="profile-stats-puntos"><div class="statsglobales">
      <div class="bigstat"><span class="label">Minutos jugados</span><span
          class="value">90</span></div>
    </div></div>
    <table class="partidos"><thead><tr><th>J</th></tr></thead><tbody>
      <tr class="plegado">
        <td class="fecha">06/09</td><td class="jornada">4</td><td class="partido">VAL 0-5 BAR</td>
        <td class="salida"></td><td class="lado">visitante</td><td class="puntos">8</td>
        <td class="dazn">2</td>
        <td><span class="stat-val stat-tiros-totales">3</span></td>
      </tr>
      <tr class="desglose">
        <td colspan="5">
          <div class="desg laliga-fantasy">
            <div class="estadistica">90 Minutos jugados 2 p</div>
            <div class="estadistica">1 Goles 4 p</div>
            <div class="estadistica">0 Goles en contra 1 p</div>
            <div class="estadistica">13 Posesiones perdidas -1 p</div>
            <div class="estadistica">1 Penaltis provocados 2 p</div>
            <div class="estadistica">4 Tiros a puerta 2 p</div>
          </div>
        </td>
      </tr>
    </tbody></table>
    </body></html>
    """
    player = SERVICE.parse_futbolfantasy(page("ignored.html", html=html))
    row = player.fixtures[0]
    assert row.minutes_out.minutes == 90
    assert row.stats.minutes_played.count == 90
    assert row.stats.minutes_played.points == 2
    assert row.stats.goals.points == 4
    assert row.stats.goals_conceded.count == 0
    assert row.stats.goals_conceded.points == 1
    assert row.stats.balls_lost.count == 13
    assert row.stats.balls_lost.points == -1
    assert row.stats.penalties_won.count == 1
    assert row.stats.penalties_won.points == 2
    assert row.stats.shots.count == 4
    assert row.stats.shots.points == 2
    assert row.dazn_points == 2


def test_parse_fragment_big_chances_created_not_zero() -> None:
    html = """
    <html><head>
    <link rel="canonical" href="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27">
    </head><body>
    <h1><span class="name">Raphinha</span><span class="pos">DEL</span></h1>
    <a class="club" href="/equipos/barcelona">FC Barcelona</a>
    <ul class="ultimos"></ul>
    <div id="profile-stats-puntos"><div class="statsglobales">
      <div class="bigstat"><span class="label">Minutos jugados</span><span
          class="value">90</span></div>
    </div></div>
    <table class="partidos"><thead><tr><th>J</th></tr></thead><tbody>
      <tr class="plegado">
        <td class="fecha">03/10</td><td class="jornada">7</td><td class="partido">SEV 1-2 BAR</td>
        <td class="salida">90'</td><td class="lado">local</td><td class="puntos">8</td><td class="dazn">2</td>
        <td>
          <div class="estadistica">oc. creadas/falladas (2/1)</div>
        </td>
      </tr>
    </tbody></table>
    </body></html>
    """
    player = SERVICE.parse_futbolfantasy(page("ignored.html", html=html))
    stat = player.fixtures[0].stats.big_chances_created
    assert stat.count == 2
    assert stat.status == "ok"


# ---- Error paths ---- #


def test_parse_futbolfantasy_canonical_season_mismatch_raises() -> None:
    base = page("raphinha_laliga_26_27.html").html
    html = re.sub(
        r"/jugadores/raphinha/laliga-26-27",
        "/jugadores/raphinha/laliga-25-26",
        base,
        count=1,
    )
    with pytest.raises(ParseError) as caught:
        SERVICE.parse_futbolfantasy(page("ignored.html", html=html))
    assert caught.value.code == "season_mismatch"
