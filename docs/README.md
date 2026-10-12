# LaLiga Fantasy Builder documentation

Start with the [project README](../README.md) for features and quick start.
This folder is the detailed map.

## Core

| Doc | Contents |
|-----|----------|
| [Architecture](architecture.md) | Services, login path, CRS, trust boundaries, errors |
| [Frontend](frontend.md) | Lineup, market, and players UI, data loading, actions, and details |
| [Frontend design-system migration plan](frontend-design-system-migration-plan.md) | Screen-by-screen commits, visual reference, staging boundaries, and acceptance checks |
| [Authentication](authentication/authentication.md) | Sessions, internal JWT, LaLiga vault, CSRF |
| [Scraping service](scraping/README.md) | Private scraper HTTP, player profile parsing, TTLs, Compose `egress`, CLIs |
| [FutbolFantasy parser](scraping/parser.md) | Offline HTML → player JSON and Markdown |
| [Parser selectors](scraping/parser-discovery.md) | Fixture vs live FutbolFantasy DOM contract |

## Authentication (HTTP reference)

| Doc | Contents |
|-----|----------|
| [Auth endpoints](authentication/endpoints.md) | Auth service routes |
| [Auth OpenAPI](authentication/openapi.md) | Swagger and `backend/auth/openapi.json` |
| [Developing authenticated endpoints](authentication/developing-authenticated-endpoints.md) | Auth vs API, CSRF, internal JWT |

## API (`backend/api`)

| Doc | Contents |
|-----|----------|
| [API overview](api/README.md) | Swagger URLs, JWT usage, CLI policy |
| [Adding endpoints](api/adding-endpoints.md) | Availability, auth, tests, OpenAPI |
| [OpenAPI / Swagger](api/openapi.md) | Regenerating `openapi.json` |
| [Endpoint schemas](api/endpoint-schemas.md) | Generated — do not edit by hand |
| [Proxy endpoint pitfalls](api/proxy-endpoint-pitfalls.md) | Fail-closed proxy patterns |
| [Schema validation migration record](api/schema-validation-migration-plan.md) | Pydantic/Zod compliance results, endpoint inventory, and verification |

### Domains

[Leagues](api/leagues/README.md) · [Teams](api/teams/README.md) ·
[Players](api/players/README.md) · [Calendar](api/calendar/README.md) ·
[Market](api/market/README.md) · [Buyout](api/buyout/README.md)

Contributors: [`AGENTS.md`](../AGENTS.md).

**Layout:** `backend/auth` — login and tokens. `backend/api` — Fantasy
features and player-stat aggregation. `backend/scraping` — private
FutbolFantasy downloads and parsing. `frontend` — lineup, market, and player
UI; no LaLiga secrets in the browser.
