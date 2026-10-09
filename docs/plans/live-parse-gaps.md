# Plan: live FutbolFantasy parse gaps (Raphinha capture)

Status: **implemented**

Follow-ups that change D7 (`expected_return`), D12 (`competition_label`),
away travel, and the venue non-goal are in
[detail-remaining-gaps.md](detail-remaining-gaps.md).

Date: **2026-10-05**

Owner: make `GET /players/{id}/stats/detail` return the fields the
FutbolFantasy profile page already publishes. The capture under study is
catalog id **2522** (Raphinha), season **2026/27**, generated
`2026-10-05T12:04:28Z`.

Evidence:

| Artifact | Role |
|----------|------|
| `backend/api/raphinha_data.json` | Detail response with the nulls below. Untracked capture; do not commit. |
| `backend/scraping/response_raphinha.json` | Raw profile HTML, one page, `https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27`. Untracked; do not commit. |
| `docs/scraping/parser-discovery.md` | Current fixture vs live DOM contract. Live profile widgets below are newer than that table. |
| Golden `raphinha_laliga_26_27.html` | Older `ul.ultimos` / `p.disponibilidad` markup. Tests stay green on it and miss this layout. |

`response_raphinha.json` is a profile-only scrape (`pages.length == 1`). The
cited nulls are already on that page. Fetching competition companions does not
fill them.

Related: [player-detail-endpoint.md](player-detail-endpoint.md),
[recent-match-window.md](recent-match-window.md),
[player-stats-parser.md](player-stats-parser.md) (A6: do not leave a recent row
as `other` while a same-page match can identify it).

---

## 1. What the page publishes

### 1.1 Identity

| API field | Capture | On the page |
|-----------|---------|-------------|
| `player.name` | `null` | Personal block `#profile-datos-personales`: **Nombre** `Raphael Dias Belloli`. Shirt heading is `11. Raphinha`. |
| `player.nickname` | `Raphinha` | Already set from the catalog. |
| `player.team_id` | `4` | Catalog id. Venue table `fantasy_id` 4 is **FC Barcelona**. |
| `player.team_name` | `null` | Catalog omitted `team.name`. Stadium weather already resolved Barcelona from `team_id`. |

FutbolFantasy `jugador_id` on the same page is **4288**. That id is the site's
widget id. Stats routes keep using catalog id 2522.

### 1.2 Recent matches (widget “Últimos 5 partidos”)

The calendar is duplicated (mobile `#profile-partidos` and a desktop copy).
Read **one** copy. Each `.day` has `data-tooltip="Home N-N Away"`, a
competition logo `alt`, a rival crest `alt`, a matchweek, a score, and a
minutes cell. The slug is `{id}-{home}-{away}`.

| Date | J | Competition | Tooltip | Side | Minutes cell | Capture today |
|------|---|-------------|---------|------|--------------|---------------|
| 2026-09-19 | 7 | LaLiga | Sevilla 1-3 Barcelona | away | `76'` (sub icon) | `other`, teams null, `is_home` false, minutes 76, `started` null, stats null |
| 2026-09-16 | 6 | LaLiga | Barcelona 7-2 Racing | home | `68'` | `is_home` false and **`result` `L`** |
| 2026-09-13 | 5 | LaLiga | Levante 2-4 Barcelona | away | `⏱️ 90'` | minutes **null**, note `⏱️ 90'` |
| 2026-09-09 | 1 | Champions League | Barcelona 5-1 Feyenoord | home | `70'` | `competition` `other`, `is_home` false |
| 2026-09-06 | 4 | LaLiga | Valencia 0-5 Barcelona | away | `⏱️ 90'` | minutes **null** (the row at lines 1618–1638) |

Scores on these rows are already filled. `home_team`, `away_team`, `opponent`,
and `competition_label` are empty because the calendar extractor never reads
the tooltip, the crest, or the logo. `competition` falls through to `other`.

`started` is null on every row. `MinutesPlayed.started` is never assigned in
`PlayerStatsService.recent_matches`.

### 1.3 Upcoming matches (widget “Próximos 5 partidos”)

| Date | J | Competition | Rival `alt` | Side | Kickoff cell |
|------|---|-------------|-------------|------|--------------|
| 2026-10-10 | 8 | LaLiga | Getafe | `span.home` | `18:30h` |
| 2026-10-13 | 2 | Champions League | Galatasaray | away (`alt="Fuera"`) | `21:00h` |
| 2026-10-17 | 9 | LaLiga | Betis | away | `18:30h` |
| 2026-10-20 | 3 | Champions League | PSG | away | `21:00h` |
| 2026-10-25 | 10 | LaLiga | Real Madrid | home | `21:00h` |

Unplayed `home_score` / `away_score` stay `null`. The nulls to fix on the
2026-10-10 row (lines 1666–1713) are `home_team`, `away_team`, `opponent`,
`competition_label`, `kickoff`, and `travel.distance_km`.

`_calendar_kickoff` returns `18:30h`. `kickoff_datetime` accepts only `HH:MM`,
so every upcoming kickoff becomes `null` and weather is `kickoff_unknown`.
The venue is already Barcelona, so weather can run once kickoff parses.

### 1.4 Profile header

| API field | Capture | On the page |
|-----------|---------|-------------|
| `injury.diagnosis` | `null` | `span.lesion`: **Edema en el bíceps femoral** |
| `injury.availability_text` | `null` | **Disponible para la jornada 8** |
| `injury.since` | `null` | Current history row starts **29/09/26** (`Actualidad`) |
| `injury.expected_return` | `null` | No return date is printed. Leave `null`. |
| `injury.active` | `null` | Current row is open (`Actualidad`) while the sentence says disponible. Store both; do not collapse them. |
| `injury.fantasy_status` | `ok` | Catalog. Keep it. |
| `start_probability` | all `null` | **Titular J8**, `span.prob-2` **50%** |
| `injury_risk` | `unknown`, raw `"None"` | `alt="Riesgo de lesión Bajo"` and text **Bajo** |
| `hierarchy` | label `"None"`, rank `null` | `span.jerarquia-value` **Dios** (rank 1 in `labels.es.toml`) |
| `injury_history` | `[]` | 18 `li.noticiaJugador.lesionJugador` rows, e.g. `29/09/26 - Actualidad` / `Edema en el bíceps femoral (3 días)` |
| `max_profitable_bid` | nulls, raw `"None"` | The strings `puja` and `rentabilidad` are absent from this HTML. |
| `form` warning | `form_visual_only` | `span.forma.fas.fa-location-arrow.arrow-1` has no number. |

`"None"` on risk, bid, and hierarchy is `str(None)` in `PlayerStatsService.profile`
when the parser object is missing. It is an API bug on top of the selector bug.

### 1.5 Warnings (lines 1943–1994)

Parser warnings carry `path` and `ruleId` (`profile.hierarchy`,
`profile.start_probability`, …). `_wire_warnings` copies only `code` and
`message`, and the message is the generic `expected field missing`. The
response therefore repeats the same object. Several of those warnings are
false: the node exists under a new class. `form_visual_only` matches the arrow
icon and should remain, with the path visible.

---

## 2. Why each layer drops the value

```text
Profile HTML
  → calendar extractor (recent omits competition, side, opponent, teams)
  → minutes_note rejects "⏱️ 90'"
  → _calendar_kickoff appends "h"
  → status/injury selectors still target ul.ultimos-era classes
  → _match_fixture joins on date only; live fixtures have date null
  → wire_map treats a missing side as is_home false
  → wire_map drops profile.personal
  → profile() stringifies missing labels to "None"
  → _travel returns null when opponent is missing, including home games
  → kickoff_datetime rejects "18:30h" → weather kickoff_unknown
```

| Gap | Layer | Where |
|-----|--------|--------|
| Recent `competition: other`, null teams / opponent | Parser | `_recent_calendar` in `parser/extractors/matches.py` sets date, matchday, score, minutes only. Upcoming already reads logo `alt`. |
| Home result stored as `L` (16 Sep, 7-2) | API | `wire_map._normalise_match`: missing `isHome` becomes `playerSide == "home"`, so unknown is `false`. `_match_result` then treats Barcelona as the away side. |
| `⏱️ 90'` → minutes `null` | Parser | `minutes_note` accepts only `^(\d+)'$`. |
| `started` always `null` | API | `recent_matches` builds `MinutesPlayed` without `started`. |
| `competition_label` always `null` | API | `FixtureRef` has the field. No builder assigns it. |
| Kickoff `null`, `kickoff_unknown` | Parser + API | `matches.py` `_calendar_kickoff` emits `18:30h`. `wire_map.kickoff_datetime` requires `HH:MM`. |
| Home `distance_km` `null` | API | `_travel` returns `venue_unknown` when `opponent` is missing, before the `is_home` branch. |
| Header widgets null | Parser | `futbolfantasy.toml` still points at `p.disponibilidad`, `.titular .prob`, `.riesgo .nivel`, `.jerarquia .valor`, `p.estado-medico`, `section.lesiones`. Live nodes are `span.lesion`, `span.prob-2`, `span.jerarquia-value`, `li.lesionJugador`. |
| `"None"` labels | API | `profile()` lines that call `str(...get("label"))` on an empty dict. |
| Repeated `field_missing` | API | `_wire_warnings` drops `path`. |
| `player.name` null | API | Parser label **Nombre** → `profile.personal.full_name`. `_normalise_profile` omits `personal`. `_player_ref` copies catalog `name` only. |
| `team_name` null | API | Catalog `team` is empty. `VenueDirectory.for_club(fantasy_id=4)` already returns `FC Barcelona`. |

Fixture rows in the same capture have `date: null` and codes `SEV` / `BAR`
(`fixtures_live` looks for `td.fecha`, which this table does not have).
[recent-match-window.md](recent-match-window.md) D4 joins on date + competition,
so it cannot backfill this capture until dates exist or the key includes
matchweek. This plan fills opponent and competition from the calendar widget
itself. Stats copy from the fixtures table stays a separate check (section 4.3):
the Sevilla fixture in this capture reports `goals.count` 3, which needs a
column check before recent rows inherit it.

---

## 3. Locked decisions

| # | Decision |
|---|----------|
| D1 | One sanitised live fixture, produced with `backend/scraping/scripts/sanitise_fixture.py` from the saved profile HTML. Golden assertions use section 1. Keep the existing `ul.ultimos` golden file. |
| D2 | Recent and upcoming calendar rows publish `competition`, `competition_raw`, `home_team`, `away_team`, `opponent`, and `is_home` from that `.day`. Side comes from `span.home` / `alt="Fuera"` when present, otherwise from tooltip order or the `{home}-{away}` slug. The player's club token is the slug token shared across the widget (`barcelona` here). |
| D3 | `minutes_note` accepts an optional icon or emoji prefix before `N'`, `Sale N'`, and `Entra N'`. `⏱️ 90'` is 90 minutes, event `full`. |
| D4 | `started` is `true` for `full` and `subbed_off`, `false` for `subbed_on` and `unused`, `null` for `unknown`. |
| D5 | `_calendar_kickoff` returns `HH:MM`. `kickoff_datetime` also accepts a trailing `h`, so a cached document parsed before the parser deploy still resolves weather. |
| D6 | When `is_home` is `true`, `travel.distance_km` is `0`, `player_team_travels` is `false`, both venues are the player's stadium, and `reason` is `null`. Opponent haversine stays on away matches once the opponent venue resolves. An unknown away opponent stays `venue_unknown`. |
| D7 | Unplayed scores stay `null`. `expected_return` stays `null` when the page prints a duration (`3 días`) and no return date. Form stays visual-only; `arrow-1` is not a number. |
| D8 | Missing profile objects serialise as JSON `null`. Never `str(None)`. |
| D9 | `SegmentWarning.detail` includes the parser `path` (`profile.hierarchy: expected field missing`), still capped at 200 characters. |
| D10 | `PlayerRef.name` uses catalog `name` when set, otherwise `profile.personal.full_name`. `PlayerRef.team_name` uses catalog `team.name` when set, otherwise `VenueEntry.name` for `team_id`. |
| D11 | Unknown side stays `is_home: null`. `_match_result` already returns `null` in that case. A guessed `false` is what marked the 7-2 home win as `L`. |
| D12 | `competition_label` is the page label (`LaLiga`, `Champions League`). `competition` stays the existing enum. |
| D13 | Current injury: `diagnosis` from `span.lesion`, `availability_text` from the disponible sentence, `active` true while the matching history row says `Actualidad`. `fantasy_status` stays the catalog value. |
| D14 | `max_profitable_bid` stays null on this page. One `field_missing` with path is enough. Re-check the live DOM once during implementation; if a bid widget appears only after JavaScript, record it in `parser-discovery.md` as absent from server HTML. |

---

## 4. Work packages

Ship in this order. Each package keeps the old fixture green and adds the live
fixture assertion from D1.

### 4.1 WP0 — failing live fixture

Save a trimmed profile under
`backend/scraping/tests/parser/fixtures/futbolfantasy/raphinha_laliga_26_27_live.html`
via the existing sanitiser. Strip the inline script that sits inside the first
`li.lesionJugador`.

Parser test `parse_futbolfantasy_live_calendar_publishes_match_and_header`:

- recent[0] competition LaLiga, opponent Sevilla, away, 1-3, 76 minutes
- recent[1] home, result inputs Barcelona 7-2 Racing
- recent[2] minutes 90 from `⏱️ 90'`
- upcoming[0] kickoff `18:30`, home, opponent Getafe, competition LaLiga
- hierarchy `Dios`, start probability matchday 8 / 50, risk label `Bajo`
- personal full name `Raphael Dias Belloli`
- injury diagnosis `Edema en el bíceps femoral`
- injury history length > 0, first diagnosis contains `bíceps femoral`

This test fails on today's parser. That is the point of WP0.

### 4.2 WP1 — calendar rows

`parser/extractors/matches.py`

- Recent calendar reads the same competition logo, rival `alt`, tooltip, and
  slug that upcoming needs.
- Shared helper for one `.day`. Call it from `_recent_calendar` and
  `_upcoming_calendar`.
- Kickoff normalised to `HH:MM` (D5).
- Minutes passed through the updated `minutes_note` (D3).
- Ignore the second copy of the widget (D2).

`parser/normalise/minutes.py`: allow a leading non-digit prefix, then the
existing sale / entra / plain patterns.

### 4.3 WP2 — link recent stats without a date

`_match_fixture` calls `same_fixture` without `matchday`, so a fixture with
`date is None` never matches. Pass `recent.matchday`.

Before copying `fixture.stats` onto the recent row, check one live
`tablestats` cell: the Sevilla row in this capture has `goals.count` 3. If
that cell is the scoring-streak column rather than the player's goals, fix the
`fixtures_live` column map in the same change. Until that check passes, link
competition and side only.

`fixtures_live` date (`td.fecha`) is a follow-up inside this package only if
the column exists under another class. The calendar date remains the date
shown on recent rows.

### 4.4 WP3 — profile selectors

Add fallbacks in `futbolfantasy.toml` and keep the old selectors first so the
golden fixture still matches.

| Field | Live locator |
|-------|----------------|
| Availability sentence | text node `Disponible…` / `No disponible…` beside `span.lesion` |
| Diagnosis | `span.lesion` |
| Start matchday | strong text `Titular J8` |
| Start percent | `span.prob-2` |
| Risk | image `alt` starting `Riesgo de lesión`, else `.rs-cuadros-phone` in that box |
| Hierarchy | `span.jerarquia-value` |
| Injury history | `li.lesionJugador` (date span + link text). `Actualidad` → `ongoing` true, `end` null. |

`extract_injury` today returns `None` when `p.estado-medico` is missing, and
that absence is silent. On the live page the lesion span is the medical line.

### 4.5 WP4 — API mapping

`backend/api`

| Change | File |
|--------|------|
| Keep `personal.fullName` on the wire profile | `services/wire_map.py` |
| `name` / `team_name` fallbacks (D10) | `services/player_stats.py` `_player_ref` |
| `is_home` null when both `isHome` and `playerSide` are absent (D11) | `services/wire_map.py` |
| `competition_label` from `competition_raw` when it is a label, not the enum value `other` (D12) | recent, upcoming, and fixtures builders |
| `started` from the minutes event (D4) | `recent_matches` |
| `str` only when the label is a string (D8) | `profile` |
| Warning `detail` prefixed with `path` (D9) | `_wire_warnings` |
| `kickoff_datetime` accepts `HH:MM` and `HH:MMh` (D5) | `wire_map.py` |
| Home travel `0` (D6) | `_travel` |

Regenerate OpenAPI only if `SegmentWarning` or `PlayerRef` gains a field.
D9 fits in the existing `detail` string, so the schema can stay.

### 4.6 WP5 — docs

Update `docs/scraping/parser-discovery.md` live table with the locators in
WP3 and the calendar fields in WP1. Note that `p.puja` is absent on the
2026-10-05 Raphinha profile. Add a pointer from
[player-stats-parser.md](player-stats-parser.md) A6 to this plan.

Adjust [recent-match-window.md](recent-match-window.md) D4: a fixture join key
of date + competition misses rows whose fixture `date` is null. Matchweek +
score is the fallback. Calendar-populated opponent satisfies the players table
without that join.

---

## 5. Tests

Names: `{method}_{state}_{behavior}`. Sections: mocks, happy path, error paths,
edge cases.

| Package | Test |
|---------|------|
| WP1 | `minutes_note_emoji_prefix_parses_full_ninety` |
| WP1 | `extract_matches_live_calendar_sets_opponent_and_competition` |
| WP1 | `calendar_kickoff_strips_trailing_h` |
| WP2 | `match_fixture_null_fixture_date_matches_matchday_and_score` |
| WP3 | `extract_hierarchy_jerarquia_value_returns_dios` |
| WP3 | `extract_start_probability_prob_span_returns_matchday_and_percent` |
| WP3 | `extract_injuries_lesion_jugador_rows_include_open_entry` |
| WP3 | `extract_injury_lesion_span_sets_diagnosis` |
| WP4 | `normalise_match_missing_side_keeps_is_home_null` |
| WP4 | `profile_missing_widgets_uses_null_labels` |
| WP4 | `kickoff_datetime_trailing_h_returns_madrid_datetime` |
| WP4 | `travel_home_without_opponent_returns_zero` |
| WP4 | `player_ref_blank_catalog_name_uses_personal_full_name` |
| WP4 | `wire_warnings_include_parser_path` |
| Golden | Existing Raphinha `ul.ultimos` test stays unchanged |

API route smoke can keep using the old golden scrape. Add one service test
whose wire document is the parsed live fixture, asserting the 16 Sep result is
`W`, the 10 Oct kickoff is set, and home distance is `0`.

---

## 6. Non-goals

- A new detail route, query parameter, or frontend screen.
- Raising the recent-match limit or scraping a sixth match.
- Computing a form number, a bid, or an expected return the HTML does not print.
- Replacing catalog `fantasy_status`.
- Treating FutbolFantasy id 4288 as the stats path id.
- Committing `raphinha_data.json`, `response_raphinha.json`, or `raphinha.json`.
- Guessing venues for Galatasaray or PSG. Away distance stays `venue_unknown`
  until that club exists in `venues.json`.

---

## 7. Done when

For player 2522, detail JSON matches section 1:

- `player.name` is `Raphael Dias Belloli`, `team_name` is `FC Barcelona`.
- The five recent rows name both clubs, the competition label, and the
  opponent. 16 Sep is a home win. Both `⏱️ 90'` rows have `minutes` 90 and
  `started` true.
- 10 Oct is home vs Getafe, kickoff `2026-10-10T18:30:00+02:00`, weather
  attempts a forecast, `travel.distance_km` is `0`.
- Profile shows Dios / 50% / Bajo / the edema diagnosis / a non-empty injury
  history. Risk, bid, and hierarchy raw fields are JSON `null` when the source
  value is missing, and the bid stays missing.
- Warnings that remain name their `path`. `form_visual_only` remains.
