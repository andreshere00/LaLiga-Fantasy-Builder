# Parser discovery

Status: selector contract from `futbolfantasy.toml`, validated against **trimmed
fixtures** and **live** FutbolFantasy player pages (2026-10). Rules use primary
locators plus fallbacks where production markup differs.

Save a raw page under `tmp/ff-fixtures/` (git-ignored) and run
`backend/scraping/scripts/sanitise_fixture.py` if you need a committed fixture.

## Fixture layout (tests)

Used by `tests/parser/fixtures/futbolfantasy/*.html`.

| Section | Locator |
|---------|---------|
| Canonical, title, club, widget link | `link[rel=canonical]`, `a.club`, `a.widget-mercado` |
| Identity | `h1 .name`, `h1 .shirt`, `h1 .pos`, `img.badge` |
| Availability, form, start odds, risk, hierarchy | Legacy classes in `futbolfantasy.toml`; live fallbacks include `span.lesion`, sibling disponible text, `strong` with `Titular Jn`, `span.prob-2`, `img[alt^='Riesgo de lesión']`, `span.jerarquia-value` |
| Personal data | `dl.personal` (`dt` / `dd` pairs) |
| JSON-LD | `script[type=application/ld+json]` when present |
| Injuries | `section.lesiones`, `table.historial`; live list `li.noticiaJugador.lesionJugador` under `.historial-lesiones` |
| News | `ul.noticias` |
| Last five / next five | `ul.ultimos`, `ul.proximos` |
| Upcoming competition hints | `a.partido` (`data-date`, `data-time`, logo `alt`) |
| Market numbers | `section.mercado` on profile or companion widget HTML |
| Market series | `script.market-series` (read before scripts are stripped) |
| Season totals | `#profile-stats-puntos .statsglobales` |
| Per-match cells | `table.partidos tbody tr.plegado`, `span.stat-val`, `div.estadistica`, `.poligono-wrapper[data-indices]` |
| Official fantasy points | `section.puntos-oficial[data-modo="LaLiga Fantasy Oficial"]` |
| Match table | `table.partidos` |

## Live layout (production pages)

Same data, different DOM. Fallbacks are in `futbolfantasy.toml` and calendar/
`tablestats` extractors.

| Section | Live anchor (fallback) |
|---------|-------------------------|
| Identity | `h1.jugador-nombre` (`11. Name`), `section.jugador_principal .position-box` |
| Personal | `#profile-datos-personales` (`.info-left` / `.info-right` pairs); label **Pie preferido** |
| Last five | `#profile-partidos` calendar `.day` (not `ul.ultimos`); `data-tooltip`, rival `alt`, competition logo `alt` |
| Next five | Header “Próximos 5 partidos” + following `.calendar .day`; kickoff `HH:MM` (no trailing `h`) |
| Season totals | `#profile-stats-puntos .statsglobales` (often `d-none`; still in HTML) |
| Per-match table | `#profile-stats-puntos table.tablestats tbody tr.plegado[data-local]` (`fixtures_live` spec) |
| Per-match stat layers | Same hidden cells as fixtures when present (`span.stat-val`, poligono JSON) |
| Club / widget on live profile | Team links under `.jugador_principal`; market widget id often **only in JS** (scraper `probes.widget_id` regex) |
| Max profitable bid (`p.puja`) | Absent on the 2026-10-05 Raphinha profile HTML (server response); expect `null` + `field_missing` |

JSON-LD is optional on live pages. The DOM wins; JSON-LD fills gaps and emits
`jsonld_mismatch` when both sides disagree.

Scoring mode read: `data-modo` must be `LaLiga Fantasy Oficial`. Other modes
are listed and their numbers are ignored.

No section is classified as XHR in this contract. A block that is absent from
the delivered HTML becomes `null` plus `missing`. It is not guessed. More than
two of the four core sections failing raises `UnsupportedLayoutError` (see
[parser.md](parser.md)).
