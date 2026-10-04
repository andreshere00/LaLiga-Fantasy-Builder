# Scraping (`backend/scraping`)

Private service on port **8002**: polite, cache-first downloads from
[FútbolFantasy](https://www.futbolfantasy.com), plus an offline **parser**
library in the same image. The API (or `fantasy-scraper`) calls the scraper;
browsers never receive raw HTML.

| Piece | CLI | Role |
|-------|-----|------|
| Scraper | `fantasy-scraper` | Resolve names, download pages, private HTTP |
| Parser | `fantasy-parse` | Saved HTML → JSON / Markdown (no network) |

Parser detail: [parser.md](parser.md). Committed OpenAPI (internal):
`backend/scraping/openapi.json` (regenerate with `uv run poe generate-scraping-openapi`).

## Compose networking

| Network | Scraping |
|---------|----------|
| `internal` | Reachable by `api` (`SCRAPING_BASE_URL`) |
| `egress` | Outbound HTTPS to FutbolFantasy |
| `public` | **Not** joined |

The `internal` network is `internal: true` (no internet). Only scraping also
uses `egress`. Uvicorn runs **one worker** per container (in-process rate limit).

## HTTP routes

All `/internal/*` routes require `X-Service-Token` (`SCRAPING_SERVICE_TOKEN`).
Health probes are open.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health/live`, `/health/ready` | None | Docker / Compose health |
| `GET` | `/internal/health` | Token | Breaker, index age, cache stats |
| `GET` | `/internal/scrape/linked-data` | Token | Index counts (`refresh` query) |
| `POST` | `/internal/scrape/linked-data/refresh` | Token | Force sitemap rebuild |
| `GET` | `/internal/scrape/routes` | Token | Resolve nickname → route |
| `POST` | `/internal/scrape/players` | Token | Batch scrape (≤ 25), per-item errors |
| `POST` | `/internal/scrape/probe` | Token + `DEBUG` | CSS fragment probe (dev) |
| `POST` | `/internal/scrape/cache/invalidate` | Token | Drop cache keys |

Errors: `{ "error", "detail" }` (fixed sentences; no upstream bodies).

## Cache TTLs (defaults)

| Kind | Fresh TTL | Notes |
|------|-----------|--------|
| Player profile | 10 min | `SCRAPER_TTL_PROFILE_S` |
| Market widget | 5 min | `SCRAPER_TTL_MARKET_S` |
| Club calendar | 10 min | One page per team slug |
| Competition page | 6 h | Current-season club comps only |
| Sitemap index | 24 h | Player + team slugs |
| Resolved route | 7 d | Negative cache on not-found |

Dev default: in-memory cache (`USE_MEMORY_STORE=true` in Compose). Redis URL
(`SCRAPING_REDIS_URL`, DB `/1`) is wired for a future Redis backend.

## Compliance (enforced in code)

- `robots.txt` checked before every fetch; identifiable User-Agent (`SCRAPER_CONTACT`).
- Allow-listed host and paths only (`www.futbolfantasy.com`).
- Rate limit ~50% of observed site cap; circuit breaker on blocks.
- No CAPTCHA solving, no `--ignore-robots`, no LaLiga tokens in this service.

## Observed vs assumed (2026-10-03/04)

| Item | Observed | Assumed |
|------|----------|---------|
| robots.txt | Allow all | May change |
| Rate limit headers | 30 req / 10 s | 429 behaviour not provoked |
| Profile + widget | Server-rendered HTML | Markup can drift |
| ToS / legal | Not reviewed | Owner accepted automated access for internal cache |

## CLI examples

```bash
cd backend/scraping
export SCRAPER_CONTACT=you@example.com

uv run fantasy-scraper resolve "Oyarzabal" --team "Real Sociedad" --json
uv run fantasy-scraper scrape "Raphinha" --season 2026-27 --include profile,market,club
uv run fantasy-scraper probe "Raphinha" --selector title=h1   # DEBUG=true

# Remote (token from env, not flags)
export SCRAPING_SERVICE_TOKEN=dev-scraping-token
uv run fantasy-scraper scrape Raphinha --service-url http://localhost:8002
```

Run and test: [backend/scraping/README.md](../../backend/scraping/README.md).
