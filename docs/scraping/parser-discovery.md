# Parser discovery

Status: selector contract from the parser plan (section 5), checked against
synthetic fixtures. Live FutbolFantasy HTML is not committed. Save a raw page
under `tmp/ff-fixtures/` and run `backend/scraping/scripts/sanitise_fixture.py`
before comparing it with the fixture.

| Section | Class | Locator |
|---------|-------|---------|
| Canonical, title, club, widget link | static | `link[rel=canonical]`, `a.club`, `a.widget-mercado` |
| Identity | static | `h1 .name`, `h1 .shirt`, `h1 .pos`, `img.badge` |
| Availability, form, start odds, risk, hierarchy | static | header classes in `futbolfantasy.toml` |
| Personal data | static | `dl.personal` label/value pairs |
| JSON-LD | static when present | `script[type=application/ld+json]` |
| Injuries | static | `section.lesiones`, `table.historial` |
| News | static | `ul.noticias` |
| Last five / next five | static | `ul.ultimos`, `ul.proximos` |
| Upcoming competition | static | `a.partido` date, time and logo `alt` |
| Market numbers | static in the player page or a companion widget | `section.mercado` |
| Market series | hidden-in-DOM | `script.market-series` JSON, read before scripts are removed |
| Season totals | hidden-in-DOM (`d-none` still in the HTML) | `#profile-stats-puntos .statsglobales` |
| Per-match cells | hidden-in-DOM | `tr.plegado span.stat-val` |
| Per-match points text | hidden-in-DOM | `div.estadistica` |
| Per-match JSON | hidden-in-DOM | `.poligono-wrapper[data-indices]` |
| Official fantasy points | static | `section.puntos-oficial[data-modo="LaLiga Fantasy Oficial"]` |
| Match table | static | `table.partidos` |

JSON-LD is optional. The DOM value wins; JSON-LD only fills gaps and emits
`jsonld_mismatch` when both sides disagree.

Scoring mode read: `data-modo` must be `LaLiga Fantasy Oficial`. Other modes
are listed and their numbers are ignored.

No section is classified as XHR in this contract. A block that is absent from
the delivered HTML becomes `null` plus `missing`. It is not guessed.
