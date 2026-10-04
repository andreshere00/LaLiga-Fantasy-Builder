# FutbolFantasy parser

The parser turns one saved HTML page into a frozen Pydantic player and into
Markdown. It does not download, cache, or call a clock. The only time input is
`ScrapedPage.fetched_at`.

Only FutbolFantasy HTML is parsed. Other competitions use the same template,
one page per slug, then `merge_competitions`.

## Call

```python
from datetime import UTC, datetime

from fantasy_scraping.models.page import PageKind, ScrapedPage, Source
from fantasy_scraping.parser import ParserService

page = ScrapedPage(
    source=Source.FUTBOLFANTASY,
    kind=PageKind.PLAYER,
    url="https://www.futbolfantasy.com/jugadores/raphinha/laliga-26-27",
    fetched_at=datetime(2026, 10, 4, 12, 0, tzinfo=UTC),
    status_code=200,
    html=open("page.html", encoding="utf-8").read(),
    season="2026-27",
    player_slug="raphinha",
    season_slug="laliga-26-27",
)
service = ParserService()
parsed = service.parse(page, companions=[])
markdown = service.to_markdown(parsed.futbolfantasy)
```

`to_player_report(player, supplement=None)` renders a shorter Spanish report
from an already parsed `FutbolFantasyPlayer` or `ParsedPlayer`. It never reads
HTML or calls LaLiga, OpenWeather, or the clock. Market windows use
`meta.extracted_on` as the anchor day.

Pass optional `FantasySupplement` when you have LaLiga Fantasy `lastStats` weeks,
`GET /players/{id}/market-value` samples, or upcoming-match weather and distance.
Without a supplement, LaLiga recent rows use FutbolFantasy stats, upcoming weather
and kilometres render as `—`, and the fantasy section omits jornada and market
blocks.

```python
from datetime import date

from fantasy_scraping.parser import FantasySupplement, FantasyWeek, ParserService
from fantasy_scraping.parser.models.futbolfantasy import MarketPoint

report = service.to_player_report(
    parsed,
    FantasySupplement(
        weeks=[FantasyWeek(week_number=7, total_points=42, stats={"goals": [1, 10]})],
        market_points=[MarketPoint(date=date(2026, 10, 4), value=172_907_890)],
    ),
)
```

`ParsedPlayer.content_hash` is the SHA-256 of the canonical JSON without that
field. `meta.input_sha256` is the SHA-256 of the HTML bytes. A suggested API
cache key is `(parser_version, rules_version, input_sha256)`.

## Layers

| Piece | Role |
|-------|------|
| `RuleRepository` | Reads and validates the TOML locators. The only file IO. |
| `ParserService` | Guards the page, runs extractors, merges competitions. |
| Extractors | Pure functions over the lxml tree and the rule set. |
| `to_markdown` | Pure function of the model, the rules and `RenderOptions`. |
| `to_player_report` | Short report from the model plus optional `FantasySupplement`. |

Selectors live in `src/fantasy_scraping/parser/rules/*.toml`. A missing required
anchor raises. A missing expected field becomes `null`, a warning and a
`missing` path. More than two of the four core sections
(`matches.recent`, `fixtures`, `season_stats`, `profile.personal`) failing
raises `UnsupportedLayoutError`.

## Stats

Season totals come from `#profile-stats-puntos .statsglobales`. Per-match
integers come from `span.stat-val.stat-{slug}`, then from `div.estadistica`,
then from `.poligono-wrapper[data-indices]` (`partidos_info`). A season total
that is absent is the sum of the match cells and is listed in
`derived_fields`. When both exist and disagree, the total is kept and the
warning is `total_mismatch`.

Each of the 19 DAZN fields is a `StatLine`. A missing points figure is `0`.
Outside LaLiga, `dazn_points` is `0` with reason `league_only`. Goalkeeper
metrics on an outfield player are `not_applicable`. Two yellows stay two
yellows; they are not a red card.

The API should copy these field names into `fantasy_api`. It should not import
this package.

## Errors

| Parser | Suggested API `error` | HTTP |
|--------|------------------------|------|
| `ParseError` `upstream_status` and the page was 404 | `player_not_found` | 404 |
| `not_a_player_page`, `slug_mismatch`, `season_mismatch`, `html_too_large`, `html_empty` | `scrape_unusable` | 502 |
| `input_invalid` | `scrape_invalid_input` | 500 |
| `UnsupportedLayoutError` | `scrape_layout_changed` | 502 |

Details are constant strings. Do not forward `preview`.

## Tests

```bash
cd backend/scraping
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
```

Fixtures under `tests/parser/fixtures` are synthetic HTML that follows the
selector contract. Real pages stay in git-ignored `tmp/ff-fixtures/`.
`--update-golden` rewrites the Markdown snapshot and is refused when `CI=true`.

## Compose

`docker compose --profile apps up` starts a scraping container on port 8002.
The API receives `SCRAPING_BASE_URL=http://scraping:8002` and
`SCRAPING_SERVICE_TOKEN`. Check the process with `GET /health/live`.

That container does not download pages. Parse a saved file with `fantasy-parse`
on the host, as shown above.
