# LaLiga Fantasy Builder documentation

Start with the [project README](../README.md) for features and quick start.
This folder is the detailed map.

See the [v0.3.0 changelog](../CHANGELOG.md#030---2026-11-04) for Spanish and English
localization and the [language guide](frontend-localization-plan.md) for selection,
formatting and optional prose translation. The
[v0.2.1 entry](../CHANGELOG.md#021---2026-11-03) covers weekly radar
refresh fixes and the [v0.2.0 entry](../CHANGELOG.md#020---2026-11-03) for published
2026/27 player performance radars and current age.
The [coverage report](scraping/radar-laliga-2026-27.md#current-result) records the
dated local publication; [operations](scraping/radar-operations.md) covers durable
storage, weekly discovery deployment and rollback.

The [product gallery](frontend.md#product-captures) contains ten captures from
the signed-in application, covering lineup, market, players, player details,
and the lineup builder in light and dark themes.

Favorites, per-league scouting alerts and the deployment/storage upgrade are in
[v0.3.0](../CHANGELOG.md#030---2026-11-04). Existing installations need a third
logical database and new runtime values; follow the
[upgrade checklist](../infra/gcp/README.md#upgrading-an-existing-installation-for-scouting).

## Core

| Doc | Contents |
|-----|----------|
| [Architecture](architecture.md) | Services, login path, CRS, trust boundaries, errors |
| [System architecture](../ARCHITECTURE.md) | Backend, frontend, and Google Cloud topology |
| [Terraform deployment](../infra/gcp/README.md) | Provision the GCP VM, network, private backups, registry, secrets, and runtime |
| [Google Cloud deployment assessment](deployment/google-cloud-cost-architecture.md) | Cost comparison and architecture for four concurrent users; trial, sizing, and production preparation |
| [Frontend](frontend.md) | Lineup, market, players, and Teams UI, data loading, actions, details, and product screenshot gallery |
| [Spanish and English localization](frontend-localization-plan.md) | Deterministic UI/data translations, selective GTranslate for scraped injury/news prose, and Options language control |
| [Favorites and scouting](api/scouting/README.md) | Global bookmarks, per-league alerts, worker delegation, storage and recovery |
| [Lineup builder](api/lineup-builder.md) | Read-only recommendations, scoring, and source contracts |
| [LALIGA standings](api/standings/README.md) | Completed-match table and provider limitations |
| [Authentication](authentication/authentication.md) | Sessions, internal JWT, LaLiga vault, CSRF |
| [LaLiga helper capability record](authentication/laliga-sso-capability.md) | Guided macOS helper trial, supported behavior and remaining release checks |
| [Manual desktop LaLiga pairing](authentication/manual-browser-pairing.md) | DevTools callback copy/paste, server-held PKCE, security contract and release gate |
| [Scraping service](scraping/README.md) | Private scraper HTTP, player profile parsing, TTLs, Compose `egress`, CLIs |
| [Radar operations](scraping/radar-operations.md) | Reviewed ingestion, publication, monitoring and rollback |
| [LaLiga radar coverage](scraping/radar-laliga-2026-27.md) | Current season selection, coverage and weekly discovery |
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

### Domains

[Leagues](api/leagues/README.md) · [Teams](api/teams/README.md) ·
[Clubs](api/clubs/README.md) · [Players](api/players/README.md) · [Calendar](api/calendar/README.md) ·
[Market](api/market/README.md) · [Buyout](api/buyout/README.md)

[Real LALIGA club standings](api/standings/README.md) uses a separate provider API;
completed-match mode is implemented and live mode remains unavailable.

Contributors: [`AGENTS.md`](../AGENTS.md).

**Layout:** `backend/auth` — login and tokens. `backend/api` — Fantasy
features and player-stat aggregation. `backend/scraping` — private
FutbolFantasy downloads and parsing. `frontend` — lineup, market, and player
UI; no LaLiga secrets in the browser.

Current runtime: [Identity setup](../backend/identity/README.md).
Production release checks: [runbook](authentication/release-checks.md).
