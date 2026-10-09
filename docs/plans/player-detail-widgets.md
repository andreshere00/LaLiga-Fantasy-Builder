# Player detail: match cards and Fantasy widgets

## Objective and references

Replace the Matches and Fantasy data sections of `/players/:playerId` with responsive
React widgets based on these files in
`/Users/aherencia/Documents/Images/Assets/Fantasy Builder/`:

- `previous_and_upcoming_matches.svg`: red title strip, two groups of five match cards.
- `structure_previous_match_example.svg`: competition/matchweek, two crest tiles,
  score badges, club names and date; reference size 260 × 200.
- `next_match_structure_example.svg`: the same fixture structure with weather below;
  reference size 260 × 350.
- `fantasy_data_screen.svg`: red title strip and three columns for Fantasy profile,
  latest news and injury history.

Rebuild the layouts with semantic HTML and CSS. The SVG layouts contain outlined text
and example data; use their composition and decorative assets with live API values.
All 44 supplied weather assets exist: 11 conditions in black, gray, red and white.

## Current implementation and data

`frontend/src/features/players/PlayerDetailPage.tsx` currently renders match data as
text lists and Fantasy data as a single vertical section. Its aggregate query already
uses `limit: 5`, `include_weather: true` and `include_stats: true`.

The existing `GET /players/{id}/stats/detail` contract supplies the required data:

| Widget | Source |
| --- | --- |
| Matchweek, competition, teams, scores, date | `recent.matches[].fixture` / `upcoming.matches[].fixture` |
| Weather values and icon selection | `upcoming.matches[].weather.snapshot` |
| Reason a forecast is unavailable | `upcoming.matches[].weather.reason` |
| Hierarchy, starter probability, injury risk | `profile.hierarchy`, `profile.start_probability`, `profile.injury_risk` |
| News, publication date and article URL | `profile.news[]` (already capped at ten by the API) |
| Injury dates, duration and ongoing state | `profile.injury_history[]` |
| Club crests | Existing `assets/teams_master.json`, resolved from fixture club codes/names |

Fixtures contain team names rather than crest URLs or team IDs. Add a frontend club
resolver using the existing teams master records and explicit aliases, reusing
`clubNames.ts`. Resolve known short codes, full names and slugs without fuzzy matching.
Use a neutral crest fallback for unmatched clubs, including international opponents.

## Implementation sequence

### 1. Prepare assets and presentation models

- Copy the weather SVGs into `frontend/src/assets/weather/` and add a typed registry
  for condition and color. Reuse existing football, Fantasy, hierarchy, starter,
  injury and information icons. Add a small newspaper SVG matching the reference.
- Add `playerDetailModels.ts` to normalize the existing JSON into typed match,
  weather, news and injury display models. Preserve zero scores, zero temperatures
  and 0% values; use null checks rather than truthiness.
- Add local match outcome colors: loss `#FF4B44`, win `#10BD00`, draw `#FFC413`.
  Existing global score green/yellow tokens use different colors, so these widgets
  need dedicated tokens.
- Reuse and extend `playerDetailFormat.ts` for date, competition, weather units and
  injury formatting. Preserve date-only fixture values without timezone shifts.

### 2. Build the match section

- Add `PlayerMatchesSection.tsx`, `MatchCard.tsx` and `MatchWeather.tsx`, with styles
  scoped to these components.
- Render the red “Previous & Upcoming matches” title strip, then centered football
  icons and “Previous 5 matches” / “Upcoming 5 matches” headings.
- Each card shows `F{matchweek} · {competition}`, home team on the left, away team
  on the right, dark square crest tiles, club names and an ISO date below.
- Overlay each available score in the top-right of its team tile. Compare home and
  away scores independently of the player's club: winner green, loser red, both
  yellow on a draw. Missing or unplayed scores use neutral placeholders. Upcoming
  fixtures display actual available scores only; the reference's 1–3 is example data.
- Show at most five actual fixtures per group, recent fixtures newest first and
  upcoming fixtures earliest first. Do not pad short lists with invented matches.
- Put “Weather”, the white icon on a red square, condition text, temperature with
  feels-like temperature in parentheses, humidity and wind underneath upcoming cards.
  Convert wind from m/s to km/h with the existing helper.
- Keep minutes, Fantasy points and travel distance available as compact supplementary
  details, without displacing the reference's primary card structure.

### 3. Implement deterministic weather mapping

Use `condition_code` to select the asset. The API's `condition` is descriptive text,
such as “light rain”; it is not an asset filename. Use that text for the visible
condition label and accessibility description.

| OpenWeather condition code | Asset condition |
| --- | --- |
| 800 | `clear` |
| 801 | `few_clouds` |
| 802 | `scattered_clouds` |
| 803 | `broken_clouds` |
| 804 | `overcast` |
| 2xx | `thunderstorm` |
| 3xx | `drizzle` |
| 500–504, 511 | `rain` |
| 520, 521, 522, 531 | `shower_rain` |
| 6xx | `snow` |
| 7xx | `mist` |

The rain/shower distinction follows
[OpenWeather's condition codes](https://openweathermap.org/api/weather-conditions).
Code 511 is freezing rain: keep the `rain` condition under the supplied 5xx mapping,
although OpenWeather assigns its own snow pictogram to that code.

If the condition code is absent, fall back to the OpenWeather icon prefix, ignoring
the day/night suffix. Prefix `04` cannot distinguish broken clouds from overcast;
use a generic cloud fallback. Prefix `09` cannot distinguish drizzle from showers;
use the shower pictogram fallback. Unknown values show a neutral unavailable state.
Use the supplied color variants for different surfaces; color selection is independent
of weather severity.

When the snapshot is missing, retain the fixture card and display a concise reason
for unavailable weather (forecast horizon, unknown venue/kickoff, disabled provider
or provider failure). Missing individual metrics show a dash without appending
misleading units.

### 4. Build the Fantasy section

- Add `PlayerFantasySection.tsx` with `FantasyProfile`, `PlayerNewsList` and
  `PlayerInjuryHistory` components.
- Match the red “Fantasy data” strip and desktop three-column proportions: profile
  about 30%, news about 40%, injury history about 30%.
- Profile: Fantasy logo and heading, followed by icon/text rows for Hierarchy,
  Starter percentage and Injury risk. Use the existing mappings, but show a neutral
  state when a value is unknown rather than suggesting a positive status.
- News: newspaper heading, up to ten actual articles with information icons, bold
  publication dates, title text and bold “Read more…”. Use existing validated URLs
  and safe external-link attributes. Scope black unvisited and red visited link
  styling to this list. Dates or links absent from the API remain absent.
- Injury history: red injury heading icon; each row shows bold diagnosis, duration
  in days, and labeled start/end dates. Show “Currently” for an ongoing injury.
  History entries have no URLs in the current contract, so represent them as text;
  underline/red in the SVG alone does not define a link destination.
- Render explicit empty states for news and injury history rather than the SVG's
  ellipsis placeholders. Preserve the separate averages section.

### 5. Integrate responsive and accessible behavior

- Replace the two inline sections in `PlayerDetailPage.tsx` with the new components
  and remove their obsolete CSS rules from `PlayerDetailPage.css`.
- Increase the player detail page's maximum width from 1100px to 1420px to accommodate
  the reference's five 260px cards at a roomy desktop size. Check the existing chart
  and stats panels at the wider width. Reflow match grids to fewer columns as space
  narrows, retaining legible crest tiles and weather text without page overflow.
- Stack the three Fantasy columns at smaller widths. Keep news titles wrapping and
  allow injury content to expand rather than using the reference's fixed height.
- Use section headings, semantic lists and keyboard-visible link focus. Provide
  textual match outcomes so score color is not the only result indicator. Decorative
  icons use empty alternative text; meaningful crest/weather images have appropriate
  accessible labels without repeating adjacent text unnecessarily.
- Handle loading, empty data and aggregate `segment_errors` per group so one failed
  segment does not erase successful content elsewhere on the page.

### 6. Validate and document

- Add focused tests for outcome colors (including 0–0), club aliases/fallbacks,
  rain versus showers, missing weather data, ongoing injuries and partial segments.
- Run the frontend build, lint and relevant tests. Compare the rendered widgets with
  the SVG references at desktop, tablet and mobile widths, including long names,
  fewer than five fixtures, negative weather temperatures and absent article dates.
- Update `docs/frontend.md` to describe the new widgets and their fallback behavior.
  The current API contract supports this plan. If an implementation uncovers a
  necessary API/schema change, follow the repository's API guides and regenerate
  OpenAPI plus endpoint schemas as required by `AGENTS.md`.

## Completion criteria

Both sections reproduce the references' visual hierarchy and structure with live
data. Match score badges use the exact requested colors, all eleven weather
conditions resolve to the supplied assets, and Fantasy profile/news/injury history
appear as three desktop columns with usable layouts on smaller screens. Missing
data and partial API failures remain explicit, and external article links work with
keyboard navigation and visited styling.
