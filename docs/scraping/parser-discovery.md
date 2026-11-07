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
| Availability, form, start odds, risk, hierarchy | Legacy classes in `futbolfantasy.toml`; live fallbacks include `span.lesion`, sibling disponible text, `strong` with `Titular Jn`, percentage scoped to the same `.cuadro`, `img[alt^='Riesgo de lesión']`, `span.jerarquia-value` |
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

The status parser maps FutbolFantasy form arrows (`arrow-1` to `arrow-4`) to
categorical ratings when no numeric form is published. For starter likelihood,
it reads the `Titular Jn` label and percentage from the same lineup box so
adjacent player cards cannot supply the wrong percentage.

Scoring mode read: `data-modo` must be `LaLiga Fantasy Oficial`. Other modes
are listed and their numbers are ignored.

No section is classified as XHR in this contract. A block that is absent from
the delivered HTML becomes `null` plus `missing`. It is not guessed. More than
two of the four core sections failing raises `UnsupportedLayoutError` (see
[parser.md](parser.md)).

## Club dossier (captured 2026-11-07)

Saved contract pages, trimmed to the nodes below:

`tests/parser/fixtures/futbolfantasy/clubs/villarreal.html`,
`getafe.html`, and the matching `*-ultimos-cambios.html` files.
Source URLs are the canonical club page and
`/laliga/equipos/{slug}/ultimos-cambios`. The capture is Villarreal–Getafe,
matchday 12. Tests read these files and do not fetch the site.

| Section | Locator |
| --- | --- |
| Matchday | `h2.lineup-title span.jornada` (the number beside `span.jornada_label`) |
| Coach | `.entrenador-widget`. Name: `.nombre-entrenador` and the coach `img[alt]` |
| Rotations | `.coach-metric--rotations` (`Rotaciones J12`, then the published label) |
| Matchday predictability | the next `.coach-metric` (`Previsib. J12`) |
| Season predictability | `.coach-metric--season .coach-ring` (the percentage text) |
| Starters | `.jugadores-titulares-* > .camiseta-wrapper[data-onceff="titular"]` |
| Alternatives | `.jugadores-suplentes-* > .camiseta-wrapper[data-onceff="suplente"]` |
| Short name | `.truncate-name` inside `a.juggador` |
| Profile URL | `a.camiseta[href]` and `a.juggador[href]` |
| Photo | `img` inside `.fotocontainer` (`data-src`, then `src`) |
| Starter probability | `.probabilidad-widget` |
| Form arrow | `span.forma.probabilidad` with `arrow-1` … `arrow-5` |
| Pitch slot | `data-onceff-x`, `data-onceff-y`, and the inline `left` / `top` |
| XI summary | `.alineacion-totales .view.probability`: average form arrow, `Probabilidad media`, `Riesgo suplencias` |
| Played matches | `section.lista.partidos.ultimos a.partido` |
| Upcoming matches | `section.lista.partidos.proximos a.partido` |
| Competition | `.logo img[alt]` (`LaLiga`, `Champions League`, `Copa del Rey`, `Conference League` on this capture) |
| Clubs and badges | `.equipo.local img[alt]` and `.equipo.visitante img[alt]` |
| Score | `.resultado .widget-score` (home, then away) when the match is played |
| Kickoff | `.date` on an upcoming `a.partido`; `.fase` is the round label |
| Result class | `a.partido` also has `won` or `lost` for the club page's team |
| Injuries | `.lesionados_wrapper .elemento.lesionado` |
| Diagnosis | `span.lesion` |
| Injury start | `span.rounded-card__date` (`Desde 30/10`) |
| Expected return | `span.rounded-card__status` when that node exists |
| Recovery phase | `li.v3-recovery-phase-strip__step`. The active step also has `is-current` |
| News item | `.changelog-days h2.changelog-day` followed by `.event-row a.event-link` |
| Headline | `span.event-title` |
| News time | `time.event-time[datetime]` |
| Article URL | `a.event-link[href]` |

The saved pages do publish the six recovery labels: Pendiente pruebas,
Postoperatorio, Rehabilitación, Trabajo de campo, Parcial con el grupo, and
Grupo sin el alta. Injury rows are part of the dossier. Individual cards can
replace Postoperatorio with `Tratamiento` (a completed step on Villarreal, the
current step for Borja Mayoral and Zaid Romero on Getafe). Read the current
step text. Do not collapse `Tratamiento` into one of the six labels.

These eight injury cards all publish `span.rounded-card__status`. A card
without that node has no expected return.

Neither saved page contains `amistoso` or a named formation such as `4-3-3`.
Do not add a friendly competition value from this capture. Pitch coordinates
are published, and a formation name is not. Played matches publish one
`.widget-score` pair. This capture has no parenthetical score after 90 minutes,
including the Copa del Rey rows (Manacor 0-5, Lebrijana 2-3). Store a second
score only when the page publishes a second score node.

Villarreal alternatives include published `0%` rows (Diatta, Gerard, Foyth,
Akhomach). The five newest news items are the first five `a.event-link` nodes.
The first Villarreal headlines are lineup updates and status changes such as
`Foyth pasa de duda a baja`, each with a FutbolFantasy article href.
