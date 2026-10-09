# Plan: remaining detail nulls (Raphinha capture)

Status: **implemented**

Date: **2026-10-05**

Owner: finish the fields that are still null or misleading on
`GET /players/{id}/stats/detail` after
[live-parse-gaps.md](live-parse-gaps.md). The capture is catalog id **2522**
(Raphinha), season **2026/27**, file `backend/api/raphinha_v2.json`, generated
`2026-10-05T14:02:42Z`.

This plan supersedes, for the items below only:

| Previous decision | Change |
|-------------------|--------|
| live-parse-gaps D7 | `expected_return` is the date of the jornada named in “Disponible para la jornada N” when that fixture is on the page. |
| live-parse-gaps D12 | `competition_label` is a short code (`LEAGUE`, `CHAMPIONS`, …), not the page sentence. |
| live-parse-gaps D6, unknown-away clause | An away match sets `player_team_travels` true even when the opponent stadium is missing. |
| live-parse-gaps non-goal “do not guess Galatasaray or PSG” | Those two clubs, plus the 2026/27 LaLiga clubs missing from the table, get reviewed `venues.json` rows. Runtime code still does not invent coordinates. |

Unplayed `home_score` / `away_score` stay `null`. That part of D7 stands.

Evidence:

| Artifact | Role |
|----------|------|
| `backend/api/raphinha_v2.json` | Detail response. Untracked; do not commit. |
| `backend/scraping/response_raphinha.json` | Profile HTML for the same player. Untracked; do not commit. |
| Screenshot “Noticias relacionadas con Raphinha” | Player news box. Dates `02/10` … `27/09`, titles about Raphinha. |

Related: [live-parse-gaps.md](live-parse-gaps.md),
[player-stats-endpoint.md](player-stats-endpoint.md) §4.4 venues,
[player-stats-parser.md](player-stats-parser.md).

---

## 1. What is wrong, and where

### 1.1 Recent rows have no stats (`recent.matches`, lines 1589–1593)

The fixtures segment already has the Sevilla row: 76 minutes, 21 fantasy
points, 3 goals. The matching recent row has `fantasy_points_total: null` and
`stats: null`.

`ParserService._link_recent` finds that fixture (matchday + score, because
`fixture.date` is null) and then copies `stats` only when `fixture.date` is
not null. Every live `tablestats` row has `date: null`, so the copy never
runs. `recent_matches` would attach the block: detail calls it with
`include_stats` true, and it copies `row.stats` when that value is a dict.

### 1.2 `competition_label` (`recent` line 1621, and the same field everywhere)

`competition` is already `laliga` or `champions_league`. The label the API
should publish:

| `competition` | `competition_label` |
|---------------|---------------------|
| `laliga` | `LEAGUE` |
| `champions_league` | `CHAMPIONS` |
| `europa_league` | `EUROPA` |
| `conference_league` | `CONFERENCE` |
| `copa_del_rey` | `COPA` |
| `supercopa` | `SUPERCOPA` |
| `other` | `OTHER` |

`_competition_label` returns the raw page string, then drops it when that
string casefolds to the enum value. `LaLiga` casefolds to `laliga`, so every
LaLiga row gets `null`. `Champions League` does not casefold to
`champions_league`, so that one label survives as the page sentence. Both
are the wrong shape.

### 1.3 Upcoming `home_team` / `away_team` (lines 1671–1672)

The 10 Oct row already has `is_home: true` and `opponent: "Getafe"`. The
calendar cell only prints the rival crest, so the parser leaves both club
fields null. With the player’s club known, the row is Barcelona at home to
Getafe.

Use the same short names the recent widget already prints (`Barcelona`,
`Getafe`), not `FC Barcelona` and not `BAR`.

| `is_home` | `home_team` | `away_team` |
|-----------|-------------|-------------|
| `true` | player club | `opponent` |
| `false` | `opponent` | player club |
| `null` | leave both null | leave both null |

### 1.4 Unplayed scores (lines 1675–1676)

`home_score` and `away_score` null on a future match is correct. No change.

### 1.5 Weather `provider_unavailable` (lines 1681–1682)

This is not a missing HTML field. `upcoming_matches` calls OpenWeather when
`OPENWEATHER_API_KEY` is set. `_weather_for_match` maps any `UpstreamError`
from that call (timeout, 401, 429, 5xx, non-JSON) to
`provider_unavailable`. A missing key would have left `disabled`. The
capture therefore means the running API had a key and the HTTP call failed.
The client logs the exception type and does not put the status on the
response, so the JSON cannot say which failure it was.

Separately, the free forecast horizon is 120 hours
(`domain/weather.py`). This document was generated at
`2026-10-05T14:02:42Z`. Kickoff `2026-10-10T18:30:00+02:00` is
`2026-10-10T16:30:00Z`, about 122 hours later. A successful call would still
return `beyond_forecast_horizon` and `snapshot: null` for that match, and
for every later row (13, 17, 20, 25 Oct). Do not invent a forecast.

### 1.6 Away travel (lines 1813–1814) and the stadium (lines 1781–1793)

Two different bugs show up as one Barcelona stadium on every row.

`venues.json` still records Barcelona as **Estadi Olímpic Lluís Companys**
(41.3648, 2.155), the ground used during the Camp Nou works. For 2026/27 the
row should be **Camp Nou** (41.3809, 2.1228), the coordinates already used
as the haversine fixture in player-stats-endpoint.md.

`_match_venue` does `opponent_venue or player_home`. When the opponent does
not resolve, weather is stamped with Barcelona’s ground even for an away
match. The 17 Oct row is away at Betis and still shows Lluís Companys.

`_travel` returns before it sets `player_team_travels` when
`for_club(name=opponent)` misses. The flag stays null. An away match is a
trip whether or not the table has the stadium: `player_team_travels` is
`true`, `distance_km` stays null, `reason` stays `venue_unknown`, and
`to_venue` stays null. Do not copy the home ground into `to_venue`.

Betis is already in the table as `Real Betis` with alias `BET`. The calendar
says `Betis`, and `for_club` matches the full name or the alias only, so
the lookup misses. The same gap hits `Sevilla`, `Levante`, `Valencia`,
`Racing`, `Rayo` against `Sevilla FC` / `VAL` / `RAY`. Levante and Racing
are not in the file at all (the table predates their 2026/27 return).
Galatasaray and PSG are the two European opponents on this page.

### 1.7 News (lines 2149–2211)

The response lists José Luis Morales, Lookman, Racing, Valencia, Tchouaméni.
Those links sit in the site footer `ul.noticias` near the end of the HTML.
The player box is earlier:

```text
div#noticiasBox
  header "Noticias relacionadas con Raphinha"
  div.noticias
    div.noticiaJugador
      div.date          "02/10"
      a.link            title + href
```

`futbolfantasy.toml` points `news_root` / `news_item` at `ul.noticias`, so
the extractor reads the footer. The saved test HTML
`raphinha_laliga_26_27_live.html` is cut before `#noticiasBox` and a stub
`ul.noticias` is appended, so tests cannot see this widget.

The first page of that box, in the screenshot and in
`response_raphinha.json`, is:

| Date | Title |
|------|--------|
| 02/10 | Luis García pasa por El Larguero: … |
| 02/10 | Las pruebas del Barça a Raphinha descartan lesión… |
| 01/10 | Marca cree que Flick no forzará a Raphinha contra el Getafe |
| 30/09 | Brasil desconvoca a Raphinha tras descartarse lesión de gravedad |
| 29/09 | Ancelotti tambien despega a Raphinha de la banda |
| 29/09 | La CBF informa que Raphinha ha sido sustituido al descanso por molestias |
| 29/09 | Raphinha tranquiliza al barcelonismo con una palabra: 'bien' |
| 29/09 | La resonancia a Raphinha será este miércoles en Australia |
| 27/09 | Raphinha, el nacimiento del Superdelantero |
| 27/09 | Los internacionales de Brasil volverán con una semana de margen… |

Read the first page only. The “Siguiente” control is client-side; do not
fetch the next page.

### 1.8 DAZN points (lines 722–727)

Every `StatValue` has `dazn_points: 0` except the key named `dazn_points`,
which holds the match total (`dazn_points: 4`, `count: null`). The live
table publishes one DAZN total per match, not a DAZN score per event. The
schema default `dazn_points: int = 0` then reads as “this event scored 0
DAZN”.

The same default makes every other stat `fantasy_points: 0` while
`fantasy_points_total` is 21, which is why each fixture row warns
`points_total_mismatch` (`0!=21`). Those per-stat official points are not
in the cells the parser currently sums.

### 1.9 Fixture `opponent` (lines 325–326)

`fixtures()` builds `FixtureRef` without `opponent`. The Levante row already
has `is_home: false`, `home_team: "LEV"`, `away_team: "BAR"`. The opponent
is the side that is not the player’s club. Resolve `LEV` through the venue
table to the short name **Levante**. Keep `LEV` / `BAR` on `home_team` /
`away_team`; those are what the stats table prints.

### 1.10 `expected_return` (lines 1995–1999)

The injury is still open (`Actualidad`, diagnosis edema, `since`
2026-09-29). The page does not print a discharge date. It does print
`Disponible para la jornada 8`, and the upcoming list has jornada 8 on
**2026-10-10**. `expected_return: null` next to that sentence looks like
the API does not know the player is cleared. Set `expected_return` to that
fixture’s date. Leave it null when the sentence is not “Disponible…” or
when that jornada is not on the page.

### 1.11 Profile warnings (lines 1943–1994)

| Warning | On the live page | Action |
|---------|------------------|--------|
| `meta.club` | No `a.club`. The crest and the shirt heading identify Barcelona. | Point the rule at the live crest link, or stop warning when `team_id` already resolved the club. |
| `profile.identity.club_badge` | No `img.badge`. Crests are `img.escudo`. | Read the player crest `alt`. |
| `profile.position` | No `.posicion .principal`. The personal block prints `Posición` / `Delantero`. | Read that pair into `profile.position`. |
| `form_visual_only` | Arrow icon, no number. | Keep. |
| `profile.max_profitable_bid` | `p.puja` is not in the server HTML. | Mark the rule optional. The bid stays null. Drop the warning. |
| `season_stats.defense` / `discipline` / `goalkeeper` | Those boxes are not separate nodes. The flat “Estadísticas de Raphinha en LaLiga” list has the outfield numbers, and they land in `other`. | Map the Spanish labels onto the existing season fields. Do not warn `field_missing` for `goalkeeper` on an outfield player. |
| `stat_label_unmapped` (shown twice) | The parser emits one warning per unmapped label, then `_wire_warnings` keeps 10. Only two survive in the response. | After the label map, an unmapped warning must include the label text. A clean Raphinha page should not emit these for the stats in section 1 of the live fixture. |

`form_visual_only` is the warning that should remain on this capture, plus
any `field_missing` whose node is genuinely absent after the selector pass.

---

## 2. Locked decisions

| # | Decision |
|---|----------|
| E1 | When a recent row matches a fixture by matchday and score, copy `stats`, `stats_source`, and the fixture’s fantasy-point total onto that recent row even if `fixture.date` is null. The calendar date stays the recent row’s date. |
| E2 | `competition_label` is the short code in section 1.2 on recent, upcoming, and fixtures. `competition` stays the enum. |
| E3 | Fill a null `home_team` / `away_team` from `is_home`, `opponent`, and the player’s short club name (`Barcelona` on this page). Do not overwrite a name the table or the tooltip already set. |
| E4 | Unplayed scores stay null. |
| E5 | Weather failures stay `provider_unavailable` with `snapshot` null. Add the HTTP status or `timeout` to the match warning `detail`, never the API key. A kickoff more than 120 hours ahead stays `beyond_forecast_horizon`. No synthetic forecast. |
| E6 | Barcelona’s venue row is Camp Nou, 41.3809, 2.1228. Home weather and home travel use that ground. |
| E7 | Away `player_team_travels` is `true`. `distance_km` is the haversine only when the opponent venue resolves; otherwise null, `reason` `venue_unknown`, `to_venue` null. Weather uses the opponent ground, or `venue_unknown` with `venue` null. Never the player’s ground for an away match. |
| E8 | `for_club` matches a calendar label that is a whole word inside the club name (`Betis` → Real Betis, `Sevilla` → Sevilla FC, `Valencia` → Valencia CF, `Rayo` → Rayo Vallecano) as well as the existing exact alias (`BET`, `SEV`, `LEV`). Add reviewed rows for clubs on this page that are missing: Levante, Racing, Galatasaray, PSG. |
| E9 | Player news comes from `#noticiasBox .noticiaJugador` only. `published_at` is the `div.date` `DD/MM`, year taken from the season (Sep–Dec → first year, Jan–Jun → second year). Footer `ul.noticias` is ignored when the box exists. The old golden file keeps `ul.noticias` as the fallback. |
| E10 | `StatValue.dazn_points` is `int \| None`. `null` means the page did not publish a DAZN figure for that stat. `0` means the page published zero. The match DAZN total stays on the `dazn_points` stat and is not copied onto the other keys. |
| E11 | `StatValue.fantasy_points` is `int \| None` on the same rule. `points_total_mismatch` compares the row total with the sum of stats that actually have a fantasy figure. A row whose only published total is `fantasy_points_total` does not warn. |
| E12 | Fixture `opponent` is the other side from `is_home`, expanded through the venue table to the short club name (`LEV` → `Levante`). Codes stay on `home_team` / `away_team`. |
| E13 | `expected_return` is the date of upcoming matchweek N when `availability_text` matches `Disponible para la jornada N`. Otherwise it stays null. |
| E14 | Profile warnings in section 1.11 are either fixed by a selector or downgraded when the node is absent by design (`max_profitable_bid`, goalkeeper for an outfield player, `form_visual_only` kept). |

Regenerate OpenAPI if `StatValue.dazn_points` or `fantasy_points` becomes
optional. No new route.

---

## 3. Work packages

### 3.1 WP1 — link recent stats

`backend/scraping` `parser/service.py` `_link_recent`.

Drop the `fixture.date is not None` guard around the stats copy. Keep the
matchday fallback already in `_match_fixture`. Copy `week_points` onto the
recent row’s fantasy total (the wire field `recent` already reads as
`fantasy_points`).

### 3.2 WP2 — labels, clubs, opponent

`backend/api` `services/player_stats.py`.

- Replace `_competition_label` with the E2 map. Call it from `fixtures`,
  `recent_matches`, and `upcoming_matches`.
- After building an upcoming `FixtureRef`, fill `home_team` / `away_team`
  per E3. The short club name is the token shared by recent rows
  (`Barcelona`); fall back to `PlayerRef.team_name` only when recent rows
  have no club token.
- In `fixtures()`, set `opponent` per E12.

Parser upcoming rows can stay without both club names. The API has the
player and the opponent.

### 3.3 WP3 — venues, travel, weather venue

`domain/data/venues.json`, `domain/venues.py`, `services/player_stats.py`
`_travel` and `_match_venue`.

- Camp Nou coordinates on the Barcelona row (E6).
- Aliases and the four missing clubs (E8). Galatasaray: Rams Park
  (41.103, 28.991). PSG: Parc des Princes (48.8414, 2.2530). Levante:
  Ciutat de València (39.4947, -0.3636). Racing: El Sardinero
  (43.4763, -3.7933). `fantasy_id` null until the catalog id is confirmed;
  name lookup does not need it.
- Word-inside-name match in `for_club`, exact alias first so `RAY` cannot
  hit a longer name by accident.
- E7 in `_travel` and `_match_venue`.

### 3.4 WP4 — weather failure detail

`clients/openweather.py` and `_weather_for_match`.

Put `timeout`, `401`, `429`, or the status class on a segment warning
`detail`. Leave `reason` as `provider_unavailable`. Do not log the key or
the query string.

### 3.5 WP5 — player news

`parser/rules/futbolfantasy.toml`, `parser/extractors/news.py`.

Prefer `#noticiasBox`. Parse `div.date`. Fall back to `ul.noticias li` only
when the box is absent, so `raphinha_laliga_26_27.html` still parses.
Rebuild `raphinha_laliga_26_27_live.html` with `sanitise_fixture.py` from
`response_raphinha.json` so `#noticiasBox` is inside the fixture and the
appended stub `ul.noticias` is gone.

### 3.6 WP6 — DAZN and fantasy points

`schemas/player_stats.py` `StatValue`, `services/stat_merge.py`,
`parser/extractors/fixtures.py` (`line(..., points=0)` when the cell was
not read).

E10 and E11. Regenerate `backend/api/openapi.json` and
`docs/api/endpoint-schemas.md`.

### 3.7 WP7 — expected return

`PlayerStatsService.profile`, after upcoming rows exist for the same
document. The profile method does not currently load upcoming matches; read
`wire.matches.upcoming` for matchweek N and copy `row.date`. Do not call
the weather path.

### 3.8 WP8 — warning selectors

`futbolfantasy.toml` plus the identity / season-stats extractors.

- Crest: `img.escudo` whose `alt` is the player’s club, scoped to the
  profile header, not the first crest in the nav (the nav’s first crest in
  this HTML is Alavés).
- Position: the `Posición` label in `#profile-datos-personales`.
- `meta.club`: same crest `alt`, or omit the warning when the badge was read.
- `max_profitable_bid`: `required = optional`.
- Season labels already parsed into `other` (`Tarjetas amarillas`,
  `Despejes efectivos`, `Balones robados`, `Posesiones perdidas`, …) map
  onto `discipline` / `defense` / `attack`. Goalkeeper group: no
  `field_missing` when `profile.position` is not a goalkeeper.
- `stat_label_unmapped` detail includes the label (`season_stats.other:
  stat label is not mapped (Tiros a puerta / Tiros:)`).

---

## 4. Tests

Names: `{method}_{state}_{behavior}`. Sections: mocks, happy path, error
paths, edge cases.

| Package | Test |
|---------|------|
| WP1 | `link_recent_null_fixture_date_copies_stats_and_points` |
| WP2 | `competition_label_laliga_is_league` |
| WP2 | `competition_label_champions_league_is_champions` |
| WP2 | `upcoming_home_opponent_fills_barcelona_and_getafe` |
| WP2 | `fixtures_away_code_sets_opponent_levante` |
| WP3 | `for_club_short_name_betis_returns_real_betis` |
| WP3 | `travel_away_unknown_venue_sets_player_team_travels_true` |
| WP3 | `match_venue_away_does_not_use_player_ground` |
| WP3 | `barcelona_venue_is_camp_nou` |
| WP4 | `weather_http_401_detail_has_status_and_no_key` |
| WP5 | `extract_news_noticias_box_skips_footer_list` |
| WP5 | `extract_news_date_dd_mm_uses_season_year` |
| WP6 | `merge_fixture_stats_unset_dazn_stays_null` |
| WP6 | `merge_fixture_stats_row_total_only_skips_mismatch` |
| WP7 | `profile_disponible_jornada_sets_expected_return` |
| WP8 | `extract_position_personal_block_returns_delantero` |
| WP8 | `season_stats_yellow_cards_label_fills_discipline` |
| Golden | Existing `ul.ultimos` Raphinha file stays green via the news fallback |

Service test on the parsed live wire: recent Sevilla row has goals count 3
and fantasy total 21; 10 Oct is home Barcelona vs Getafe; 17 Oct travel has
`player_team_travels` true and a Betis `to_venue`; profile news titles
include “descartan lesión”; `expected_return` is `2026-10-10`.

---

## 5. Non-goals

- Filling `home_score` / `away_score` on unplayed matches.
- A weather value for a kickoff outside 120 hours.
- Fetching the news “Siguiente” page.
- Scraping a sixth match, or copying Rayo (fixtures matchweek 3) into the
  five-row recent widget. Those lists are different widgets.
- Using FutbolFantasy id 4288 as the stats path id.
- Committing `raphinha_v2.json` or `response_raphinha.json`.

---

## 6. Done when

For player 2522, a fresh detail document has:

- Recent rows with the stats and fantasy total of the linked fixture.
  Sevilla shows goals 3 and total 21.
- `competition_label` `LEAGUE` on LaLiga rows and `CHAMPIONS` on Champions
  League rows, in recent, upcoming, and fixtures.
- 10 Oct: `home_team` Barcelona, `away_team` Getafe, scores still null,
  kickoff unchanged, home `distance_km` 0, stadium Camp Nou.
- 17 Oct: `player_team_travels` true, `to_venue` Benito Villamarín, weather
  venue that ground (or `venue_unknown` only if the forecast call fails
  after the venue resolved).
- Galatasaray and PSG: `player_team_travels` true and a non-null distance.
- News titles are the ten in section 1.7, with `published_at` set.
- Per-stat `dazn_points` null except the `dazn_points` key, which holds the
  match total. No `points_total_mismatch` caused only by unread zeros.
- Fixture opponent `Levante` on the `LEV`–`BAR` row.
- `expected_return` `2026-10-10`.
- Profile warnings no longer list club, badge, position, bid, defense,
  discipline, goalkeeper, or unmapped labels for stats the page prints.
  `form_visual_only` remains.
