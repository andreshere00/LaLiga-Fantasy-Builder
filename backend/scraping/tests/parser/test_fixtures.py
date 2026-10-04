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


def test_shots_sums_json_components_when_total_missing() -> None:
    payload = {"tiros_puerta": 2, "tiros_palo": 1, "tiros_bloqueados": 1}
    result = _shots({}, {}, {}, payload, layer_present=True)
    assert result.status == "partial"
    assert result.count == 4
    assert result.reason == "no_per_match_total"


def test_json_shot_parts_ignores_non_integers() -> None:
    assert _json_shot_parts({"tiros_puerta": 2, "tiros_palo": "x"}) == [2]


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
