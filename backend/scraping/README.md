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

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `SCRAPING_SERVICE_TOKEN` | Yes (except `DEBUG`) | `X-Service-Token` for `/internal/*` |
| `SCRAPER_CONTACT` | Yes* | User-Agent contact (*or `SCRAPER_USER_AGENT`) |
| `SCRAPING_SERVICE_PORT` | No | Default `8002` |
| `DEBUG` | No | `true` → Swagger at `/docs`, enables `/internal/scrape/probe` |
| `SCRAPER_*` | No | Timeouts, TTLs, limits — see `.env.example` |

Root `.env.template` lists Compose URLs; service-specific vars live in
`.env.example`.

## OpenAPI

Internal review only (not a public product API):

```bash
SCRAPER_CONTACT=you@example.com uv run generate-openapi
# or from repo root: uv run poe generate-scraping-openapi
```

Committed: `openapi.json`. Interactive docs when `DEBUG=true`.

Docs: [docs/scraping/README.md](../../docs/scraping/README.md),
[parser.md](../../docs/scraping/parser.md).
