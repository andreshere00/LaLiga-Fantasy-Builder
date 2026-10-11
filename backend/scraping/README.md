# Scraping

Private Compose service (port **8002**): FutbolFantasy **scraper** + offline
**parser** in one image. The API uses `SCRAPING_BASE_URL` and
`SCRAPING_SERVICE_TOKEN`; the browser never talks to this process.

## Run locally

```bash
cd backend/scraping
cp .env.example .env   # set SCRAPER_CONTACT
uv run laliga-fantasy-builder-scraping
# or: uv run uvicorn fantasy_scraping.main:create_app --factory --host 0.0.0.0 --port 8002
```

Compose (from repo root): `uv run poe up` — scraping joins `internal` and
`egress`, publishes `${SCRAPING_PUBLISH_PORT:-8002}`.

## Test and lint

```bash
uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80
uv run ruff check src tests
uv run black src tests
```

## CLIs

| Command | Purpose |
|---------|---------|
| `fantasy-scraper` | Resolve / scrape / probe (read-only; `--service-url` optional) |
| `fantasy-parse` | Parse a saved HTML file to JSON or Markdown |

```bash
uv run fantasy-scraper resolve Raphinha --season 2026-27 --json
uv run fantasy-parse page.html --url URL --slug SLUG --season 2026-27 \
  --fetched-at 2026-10-04T12:00:00+00:00 --json
```

The profile parser extracts numeric form when available, otherwise preserves
the FutbolFantasy form arrow as a categorical rating. It also scopes starter
likelihood to the lineup box containing the player's matchweek label. See the
[parser guide](../../docs/scraping/parser.md) and
[selector contract](../../docs/scraping/parser-discovery.md).

## Player name aliases

The reviewed public catalog snapshot contains **829 footballers** (25 coaches
excluded). `scraper/data/player_names.json` records their Fantasy master IDs,
published names and source URLs. The scraper derives full-name, source-slug,
team-id, team-name and generated-alias records by master player ID at startup. It contains
**826 confirmed profile routes**, plus explicit unavailable routes (`slug: null`)
for Nájera (`2970`), Albert García (`3278`), and Kinareikin (`3280`). A profile route
does not guarantee that FutbolFantasy publishes statistics for every season.

Aliases cover nicknames, given names, surnames, full names, initials before and
after surnames, and two-surname forms where those names are published. Periods,
accents and spacing are normalized. The loader validates the records and builds
the ID/name lookup index once at startup. Shared aliases retain all candidates; a
master player ID takes precedence. Missing routes are not guessed from similar
names. Stored teams are catalog snapshots; live club verification remains in
place. See the [alias maintenance guide](../../docs/scraping/player-aliases.md).

After reviewing identity changes, normalize the inventory offline:

```bash
cd backend/scraping
uv run python scripts/generate_player_aliases.py
```

Restart the scraping service after updating its bundled alias inventory.

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `SCRAPING_SERVICE_TOKEN` | Yes (except `DEBUG`) | `X-Service-Token` for `/internal/*` |
| `SCRAPER_CONTACT` | Yes* | User-Agent contact (*or `SCRAPER_USER_AGENT`) |
| `SCRAPING_SERVICE_PORT` | No | Default `8002` |
| `SCRAPING_EXPOSE_DOCS` | No | `true` → Swagger at `/docs` (default in Compose) |
| `DEBUG` | No | `true` → same docs plus empty token allowed, `/internal/scrape/probe` |
| `SCRAPER_*` | No | Timeouts, TTLs, limits — see `.env.example` |

Root `.env.template` lists Compose URLs; service-specific vars live in
`.env.example`.

## OpenAPI

Internal review only (not a public product API):

```bash
SCRAPER_CONTACT=you@example.com uv run generate-openapi
# or from repo root: uv run poe generate-scraping-openapi
```

Committed: `openapi.json`. Interactive docs when `SCRAPING_EXPOSE_DOCS=true`.

Docs: [docs/scraping/README.md](../../docs/scraping/README.md),
[parser.md](../../docs/scraping/parser.md).
