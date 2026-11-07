# ---- Mocks, fixtures & helpers ---- #

from __future__ import annotations

from pathlib import Path

from lxml.html import fromstring

FIXTURES = Path(__file__).parent / "fixtures" / "futbolfantasy" / "clubs"
INJURY_STATUSES = (
    "Pendiente pruebas",
    "Postoperatorio",
    "Rehabilitación",
    "Trabajo de campo",
    "Parcial con el grupo",
    "Grupo sin el alta",
)


def _text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


# ---- Happy path ---- #


def test_saved_club_pages_publish_injury_statuses_and_no_friendly() -> None:
    for name in ("villarreal.html", "getafe.html"):
        html = _text(name)
        for status in INJURY_STATUSES:
            assert status in html
        assert "amistoso" not in html.casefold()


def test_saved_villarreal_page_publishes_matchday_and_zero_alternative() -> None:
    root = fromstring(_text("villarreal.html"))
    matchday = "".join(
        root.xpath(
            "//h2[contains(@class,'lineup-title')]"
            "//span[contains(@class,'jornada') and not(contains(@class,'jornada_label'))]//text()"
        )
    )
    assert "".join(matchday.split()) == "12"
    starters = root.xpath(
        "//*[contains(@class,'jugadores-titulares-')]"
        "/*[contains(@class,'camiseta-wrapper') and @data-onceff='titular']"
    )
    assert len(starters) == 11
    zeroes = [
        node
        for node in root.xpath(
            "//*[contains(@class,'jugadores-suplentes-')]"
            "//*[contains(@class,'probabilidad-widget')]"
        )
        if "0%" in "".join(node.itertext())
    ]
    assert zeroes


def test_saved_club_news_publishes_five_headlines() -> None:
    root = fromstring(_text("villarreal-ultimos-cambios.html"))
    titles = [
        " ".join(node.itertext()).strip()
        for node in root.xpath(
            "//a[contains(@class,'event-link')]//span[contains(@class,'event-title')]"
        )
    ]
    assert len(titles) >= 5
    assert titles[2] == "Foyth pasa de duda a baja"
    assert root.xpath("//a[contains(@class,'event-link')]/time[@datetime]")


# ---- Edge cases ---- #


def test_saved_getafe_page_publishes_treatment_phase() -> None:
    root = fromstring(_text("getafe.html"))
    current = [
        " ".join(node.itertext()).strip()
        for node in root.xpath("//li[contains(@class,'is-current')]")
    ]
    assert "Tratamiento" in current
    assert "Trabajo de campo" in current
