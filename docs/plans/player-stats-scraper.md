# Plan: player stats scraper (`backend/scraping` — scraper service)

Status: **proposed** (scraper not implemented in-tree yet).

Scope of this document: the **scraper** half of the new `backend/scraping`
project. The public Players API endpoint is planned separately; section 3.3
fixes the contract this plan owns and the other two consume.

**Implementation note (2026-10-04).** The **parser** half is implemented as a
library under `fantasy_scraping/parser`: `ParserService.parse` → `ParsedPlayer`,
`to_markdown` (full FutbolFantasy ficha), and `to_player_report` (short report;
optional `FantasySupplement` for LaLiga Fantasy weeks, market-value series, and
upcoming weather/km — never fetched by the parser). CLI `fantasy-parse` and
`docs/scraping/parser.md` document it. `fantasy_scraping.main` exposes
**health only**; the downloader, cache, and `/internal/*` routes in this plan
are still todo.

**Fantasy API data in reports.** Published OpenAPI does not offer per-match
stats or market deltas. `FantasySupplement.weeks` and `.market_points` must be
filled by the **API** (or a host script) from `lastStats` and
`GET /players/{id}/market-value` as described in
[`player-stats-endpoint.md`](player-stats-endpoint.md) sections **1.5.0**, **1.5.4**,
and **CC-11**. This scraper plan only delivers FutbolFantasy HTML → parsed JSON.

Source brief: `PROMPT 3.md` (Players tab). Grounding date for every
"observed" claim below: **2026-10-03**, plus competition-page checks on
**2026-10-04**.

**Decision (2026-10-04).** Only `www.futbolfantasy.com` is scraped. Stats for
Champions, Copa del Rey, Europa League, Conference League, Supercopa and
friendlies come from extra player pages
(`/jugadores/{slug}/{competition-season}`).

---

## 1. Goal, scope, non-goals, assumptions

### 1.1 Goal

Give the Fantasy Builder a private, polite, cache-first service that turns a
LaLiga Fantasy player (catalog `nickname`/`name` plus team) into the raw
third-party page(s) that hold data LaLiga Fantasy does not expose:

| Need (from the brief) | Source | Scraper deliverable |
|-----------------------|--------|---------------------|
| Last / next 5 matches, injuries, lineup probability, injury risk, hierarchy, news, profile | futbolfantasy.com player page | `ScrapedPage(kind=profile)` |
| Maximum profitable bid, market history widget | futbolfantasy.com market widget | `ScrapedPage(kind=market_widget)` |
| Non-LaLiga per-match stats | FutbolFantasy competition pages (`champions-26-27`, `copa-del-rey-25-26`, `europa-league-…`, `supercopa-espana-…`, `amistoso-…`) | `ScrapedPage(kind=competition)` — same host as the profile, §2.4 |

The scraper never parses statistics. It resolves, downloads, sanitises, caches
and returns bytes-as-text; the parser owns extraction.

### 1.2 In scope

1. The four methods required by the brief: `get_linked_data`,
   `resolve_player_route`, `download_player_page`, `scrape_player`.
2. The configurable parameters of the brief (§4), with a realistic subset
   implemented and the rest explicitly deferred or pass-through.
3. Concurrency, rate limiting, caching, error model, security (§5–§8).
4. A private HTTP surface, a read-only CLI, Docker/Compose wiring, docs (§9).
5. Tests and delivery milestones (§10–§11).

### 1.3 Non-goals

- Parsing, scoring, or interpreting page content (parser plan).
- The public `/players/...` route, JWT handling, merging with LaLiga data (API plan).
- Weather (OpenWeatherMap) and travel distance (brief: computed programmatically).
  Not scraped; they belong to the API/calendar side.
- Bypassing anti-bot protection (Cloudflare challenges, CAPTCHAs, fingerprint
  spoofing, rotating proxies to dodge rate limits). Explicitly forbidden, §2.5.
- Bulk mirroring of the site. The unit of work is "one player, on demand",
  plus the competition pages linked from that player's season selector.
- Scheduled pre-fetch jobs (possible follow-up; the cache API makes them easy).
- Any LaLiga token handling. The service has no LaLiga configuration at all.

### 1.4 Assumptions

- `backend/scraping` is one uv project and one deployable image in v1.
  `scraper/` and `parser/` are sub-packages mounted on the same private
  FastAPI app; they can be split into two containers later without code moves.
- Python 3.14, uv, ruff, black (line length 100), pytest + pytest-asyncio,
  coverage gate ≥ 80 % (target 90 %, matching auth/API pre-commit).
- Callers are only `backend/api` and developers' CLI, both on the private network.
- futbolfantasy.com serves every section we need (profile and market widget) as
  server-rendered HTML (verified in §2.1), so a plain `httpx` client is enough for v1.

### 1.5 Ambiguities and resolutions

| # | Ambiguity in the brief | Resolution |
|---|------------------------|------------|
| A1 | "**Linked data**" of the player | Observed: the profile page has **no** `application/ld+json` block (0 found) and no `rel="alternate"`. It does carry `<link rel="canonical">`, `og:*` meta, season tabs, and `equipos/{team}` links. The site publishes `sitemap.xml` → `sitemap-jugadores.xml` (**16 498** `<loc>` entries, 3.4 MB) and `sitemap-equipos.xml`. Resolution: *linked data* = (L1) the **sitemap player index + team index**, cached for the whole fleet, and (L2) the **page-level links** (canonical, season routes, team slug, widget id) extracted from a downloaded profile page. If JSON-LD appears later, L2 reads it first. |
| A2 | Hamming distance "between the scraped route and the player name" | Hamming is only defined for equal-length strings and is positional. Resolution in §1.6: normalise both sides to slug form, use **padded Hamming** (length difference counts as mismatches), score both the full slug and each slug token, apply an absolute+relative threshold and a gap rule, then fall back to **banded Levenshtein** when Hamming fails. Hamming stays the primary metric as the brief requires. |
| A3 | Which "name" | Observed on the live public catalog (853 players): `name` and `slug` are `null` for the entries sampled, `team` is `null`, `nickname` and `teamId` are filled (e.g. `Raphinha`, `Vini Jr.`, `Camavinga`, `Gueye`, `Kevin`). Resolution: the resolver accepts `nickname` (primary) and optional `full_name` (secondary); it never assumes `name`/`slug` exist. The API must send a **team name**, not only `teamId` (it can map via the public `/v3/teams-master`; API plan). |
| A4 | "Threads" | The workload is network-bound and rate-limited by the sites, not by CPU. Resolution: asyncio with bounded concurrency; a tiny thread pool only for CPU-bound index work (§5). |
| A5 | `selector`, `extract_rules`, `multiple` | The parser owns extraction and uses **lxml** (CSS and XPath). The scraper may pre-filter with the same library. `extract_rules` stays on the dev `probe` path. |
| A6 | `proxyType`, `proxyCountry/city/state`, `asn` | Provider-only concepts. Off by default, pass-through via `ProxyConfig` (§4.2). Not needed for either target (futbolfantasy returned 200 from a plain request). |
| A7 | "Season" | Route uses `laliga-26-27`; the contract uses `"2026-27"`. One converter in `urls.py`. Always request the explicit season route, never the bare canonical (the bare route silently follows "current"). |
| A8 | `playerId` vs `playerTeamId` | The scraper only ever sees the master `playerId` (optional alias/cache key). `playerTeamId` is never accepted (AGENTS.md identifier rules). |

### 1.6 Name → route resolution (exact algorithm)

**Inputs:** `name` (catalog nickname), optional `full_name`, optional `team`
(free text), optional `player_id`, `season`.

**Step 0 — normalise (`normalise.py`)**, applied identically to the query and to
every sitemap slug before comparison:

1. Unicode NFKD, drop combining marks (`í→i`, `ñ→n`, `ü→u`).
2. Map non-decomposable letters: `ø→o`, `ß→ss`, `đ→d`, `ł→l`, `æ→ae`, `œ→oe`,
   `ı→i`, `þ→th`.
3. Casefold to lowercase; drop apostrophes/dots (`N'Golo → ngolo`, `Jr. → jr`).
4. Replace every run of non `[a-z0-9]` with a single `-`; strip leading/trailing `-`.
5. For slugs only: remove a trailing numeric disambiguator (`lamine-gueye-1` →
   base `lamine-gueye`); keep the original string as the route. (297 of the 16 498
   observed slugs carry such a suffix.)

**Step 1 — overrides.** `aliases.json` (package data, committed) maps
`player_id` or normalised nickname to a slug (e.g. `"3102" → "vinicius-junior"`
for catalog nickname `Vini Jr.`). An alias hit short-circuits scoring
(`metric="alias"`, `distance=0`) but still passes team verification.

**Step 2 — padded Hamming distance.**

```python
def padded_hamming(a: str, b: str) -> int:
    """Mismatched positions after right-padding the shorter string (length gap counts)."""
```

For every slug `s` with tokens `t₁…tₙ` (split on `-`), the score is:

```text
d_full = H(q, base(s))
d_tok  = min over tokens t of H(q, t) + (n - 1)      # one point per extra name part
d      = min(d_full, d_tok)
```

`d_tok` lets a single-word nickname (`Oyarzabal`, `Camavinga`) match
`mikel-oyarzabal` / `eduardo-camavinga`; it is the only extension to plain
Hamming. Candidates are pre-bucketed by length (`H ≥ |len(q) − len(x)|`), so only
slugs/tokens within `±allowed` characters are scored.

**Step 3 — threshold and gap.**

- `allowed(q) = max(1, floor(0.25 · len(q)))`.
- Reject when `d_best > allowed(q)` → `PlayerNotFoundError` (never a "closest" guess).
- Ambiguous when `d_second − d_best < 2` (`AMBIGUITY_GAP = 2`), where namesake
  twins (`x`, `x-1`, `x-2`) count as one group for the *gap* but all remain
  candidates for verification.

**Step 4 — team disambiguation.** When ambiguous and `team` is known, download
the best `N = 3` candidates in order (these are real downloads of the requested
season, so the winner is **reused as the final page**, no second request) and keep
the first whose `team_slug` probe (§3.2 `probes.py`) matches the normalised team
(token-subset on the 20 team slugs from `sitemap-equipos.xml` plus a small
`TEAM_ALIASES` table: `atletico-de-madrid→atletico`, `athletic-club→athletic`,
`real-betis→betis`, `deportivo-alaves→alaves`…). If none or several match →
`AmbiguousPlayerError(candidates=…)`. Without `team` and ambiguous → the same error.

**Step 5 — Levenshtein fallback.** Only if Step 3 rejected: banded Levenshtein
(`k = max(1, floor(0.2·len(q)))`, early exit) over the same candidate buckets,
same gap rule, `metric="levenshtein"`. Rationale below.

**Tie-break order** (deterministic): lower `d` → fewer extra tokens → no numeric
suffix → smaller length difference → lexicographic slug.

#### Worked examples (computed offline against the live sitemap, 16 498 slugs; full scan ≈ 75 ms in pure Python)

| Query (normalised) | Best slug (d) | Runner-up (d) | `allowed` | Outcome |
|--------------------|---------------|---------------|-----------|---------|
| `Raphinha` → `raphinha` | `raphinha` (0) | `rochinha` (2) | 2 | Accept; gap 2 → no team probe needed |
| `Raphinah` (typo) | `raphinha` (2) | `milot-rashica`/`rochinha` (4) | 2 | Accept (d=2 ≤ 2, gap 2) |
| `Oyarzabal` | `mikel-oyarzabal` (1 = token 0 + 1 extra) | `alain-oyarzun` (5) | 2 | Accept via `d_tok` |
| `Camavinga` | `eduardo-camavinga` (1) | `sam-vines` (4) | 2 | Accept via `d_tok` |
| `Iñaki Williams` → `inaki-williams` | `inaki-williams` (0) | `danny-williams` (5) | 3 | Accept |
| `Vinícius Júnior` → `vinicius-junior` | `vinicius-junior` (0) | `vinicius-tanque` (5) | 3 | Accept |
| `Lamine Yamal` | `lamine-yamal` (0) | `lamine-camara` (3) | 3 | Accept (gap 3) |
| `Gueye` | `gueye` (0) | `idrissa-gueye`, `idrissa-gueye-1`, `lamine-gueye`, `lamine-gueye-1` (all 1) | 1 | **Ambiguous** (gap 1 < 2) → needs `team` probe, else `AmbiguousPlayerError` |
| `Vini Jr.` → `vini-jr` | `vitinha`/`vitinho` (4) | — | 1 | **Reject** by Hamming; accepted only through the `3102` alias |
| `Iñaki Álvarez` → `inaki-alvarez` vs sitemap slug `inaki-lvarez` | Hamming **7** (hand-computed: one dropped letter shifts every following position) | — | 3 | Hamming rejects; **Levenshtein = 1** accepts via fallback |

The last two rows are why the plan keeps (a) an alias table and (b) a
Levenshtein fallback: the sitemap slugifier drops accented capitals
(`inaki-lvarez`), and nicknames like `Vini Jr.` share almost no characters with
the route. This is a deliberate, documented deviation from "Hamming only".

---

## 2. Legal, ethical, ToS and robots.txt compliance

### 2.1 What was actually observed vs assumed

| Item | Observed (2026-10-03) | Assumed / not verified |
|------|----------------------|------------------------|
| `futbolfantasy.com/robots.txt` | `User-agent: *`, empty `Disallow:` (everything allowed), `Sitemap: https://www.futbolfantasy.com/sitemap.xml` | No `Crawl-delay`; may change |
| FF sitemap | `sitemap.xml` is an index (news, static, equipos, jugadores, articulos…); `sitemap-jugadores.xml` = 16 498 URLs, 3.4 MB, `changefreq=daily`, `priority=0.7`; no `lastmod` seen on player entries | `lastmod` absence on player URLs; ETag/`Last-Modified` support not tested |
| FF player page | `GET /jugadores/raphinha/laliga-26-27` → 200 `text/html`, ≈ 1.05 MB, server-rendered; contains last/next-5, injuries table, season totals, per-match table with expandable detail, canonical, season tabs `laliga-22-23…26-27`, `equipos/{team}` links | Site editor can change markup at any time |
| FF rate limit | Response headers `X-RateLimit-Limit: 30`, `X-RateLimit-Window: 10s`, `X-RateLimit-Current` incrementing → **30 requests / 10 s per client** | Whether exceeding returns 429 or a ban window (not provoked, on purpose) |
| FF cookies | Every response sets `futbolfantasy_session` (+ one more) cookie, Laravel-style | We never need them → cookieless client |
| FF market widget | `GET /analytics/laliga-fantasy/mercado/detalle/4288?perfil=1` → 200 `text/html` fragment, ≈ 220 KB, **server-rendered**: current value, 30-day/season toggle, full daily history table, "puja máxima rentable" text. Widget id = `data-jugador="4288"` / link in the profile page | Whether the *value* of "puja máxima rentable" is in the fragment or loaded later (the text seen was explanatory; the brief's example shows "Sin rentabilidad") — **verify in M5** |
| FF ToS / legal notice | **Not reviewed** | Whether automated access/reuse is allowed; database-right and copyright position of editorial content (notes, news). **Requires the owner's decision (§12)** |

### 2.2 Compliance rules (enforced in code, not just documented)

1. **robots.txt first.** `RobotsPolicy` fetches `/robots.txt` per host (24 h
   cache) through the same guarded client and parses it with the stdlib
   `urllib.robotparser` (fed with the text; the stdlib `read()` is blocking and
   is not used). Every request calls `can_fetch(user_agent, url)`; a denial
   raises `RobotsDisallowedError` before any socket is opened.
   RFC 9309 semantics for failures: robots `4xx` → allow; `5xx`/timeout →
   treat as *disallow all* for 1 h; challenge/403 → `UpstreamBlockedError`.
2. **Identifiable User-Agent** by default:
   `LaLigaFantasyBuilder-Scraper/{version} (+{SCRAPER_CONTACT})`, `SCRAPER_CONTACT`
   mandatory (URL or email) at startup. The brief's "mimic real browsers" is
   supported as an explicit override, never the default, and the override is
   logged at startup. No header spoofing beyond `Accept`, `Accept-Language`, `Accept-Encoding`.
3. **On-demand only**, cache-first, one request per distinct URL in flight
   (singleflight), no recursive crawling, no link following beyond the two probe
   links (team, widget id).
4. **No circumvention.** On `cf-mitigated: challenge`, CAPTCHA, `403`, or
   repeated `429`, the scraper stops, opens the host circuit breaker and reports
   `upstream_blocked`. It never solves challenges, rotates IPs to dodge limits,
   or randomises fingerprints. Proxies (§4.2) are for egress/geo stability only.
5. **Data minimisation and attribution.** The raw HTML is an internal cache
   artefact with a short TTL, never exposed to browsers by the API. Downstream
   features must cite "FútbolFantasy" as source (frontend plan). Editorial text
   (news bodies) should not be republished verbatim — parser/API concern, flagged here.

### 2.3 Per-host policy (defaults, all env-overridable)

| Host | Allowed paths | Sustained rate | Burst | Max in-flight | Jitter | Breaker |
|------|---------------|----------------|-------|---------------|--------|---------|
| `www.futbolfantasy.com` | `/jugadores/`, `/analytics/laliga-fantasy/mercado/detalle/`, `/sitemap*.xml`, `/robots.txt` | **1.5 req/s** (= 15 / 10 s, 50 % of the observed 30 / 10 s) | 3 | 4 | +200–600 ms | open after 5 failures / 60 s, 60 s |

Backoff on 429/403 and breaker rules: §7.3.

### 2.4 Competition pages

Non-LaLiga stats are other routes on
`www.futbolfantasy.com`, same template as the LaLiga profile. Observed
`200` on 2026-10-04:

| Slug | Example |
|------|---------|
| `champions-26-27` | `/jugadores/raphinha/champions-26-27` |
| `copa-del-rey-25-26` | `/jugadores/raphinha/copa-del-rey-25-26` |
| `europa-league-22-23` | `/jugadores/raphinha/europa-league-22-23` |
| `supercopa-espana-25-26`, `amistoso-26-27` | values of the season `<select>` on the profile |

`scrape_player` downloads the LaLiga profile and the **current season only**.
From that page's `<select>`, it keeps options whose `data-nombre-temporada`
matches the LaLiga season label (for example `2026/27`) and whose `value`
prefix is a club competition: `champions-`, `europa-league-`,
`conference-league-`, `copa-del-rey-`, `supercopa-`. Amistosos, Mundial and
national-team cups are not downloaded. Each kept option is one
`ScrapedPage(kind=competition)`.

The club calendar is separate and shared. `GET /laliga/equipos/{team-slug}`
is about 2.5 MB and already contains `a.partido` with the competition logo
(`alt` on `logos_competiciones`: LaLiga, Champions), the jornada and the date.
Fetch it **once per club**, cache 10 minutes, key `page:ff:club:{team-slug}`.
Do not fetch it per player and do not follow each match link. The parser uses
it only to label a widget row. Past rows are labeled from the competition
pages already downloaded (date + score). The host allow-list stays
`www.futbolfantasy.com` only.

### 2.5 Explicit prohibitions

- No CAPTCHA/Cloudflare solving, `undetected-chromedriver`-style stealth, residential
  rotation to evade limits.
- No scraping of logged-in or paywalled areas; no cookies persisted.
- No `--ignore-robots`/`--no-rate-limit` flags in the CLI or HTTP API.

---

## 3. Module layout, public API and contract

### 3.1 Project tree

```text
backend/scraping/
├── pyproject.toml              # name laliga-fantasy-builder-scraping, package fantasy_scraping
├── uv.lock
├── Dockerfile                  # mirrors backend/api/Dockerfile, port 8002
├── README.md
├── src/fantasy_scraping/
│   ├── __init__.py
│   ├── config.py               # service-level Settings (token, store, logging)
│   ├── main.py                 # create_app(), run(); health today; scraper + facade routers later
│   ├── security.py             # require_service_token (constant-time compare)
│   ├── scraper/
│   │   ├── __init__.py         # exports ScraperService, models, errors
│   │   ├── settings.py         # ScraperSettings, HostPolicy, ProxyConfig
│   │   ├── models.py           # ScrapedPage, PlayerRoute, LinkedData, ScrapeOptions, …
│   │   ├── errors.py           # ScrapingError hierarchy
│   │   ├── normalise.py        # text → slug form
│   │   ├── distance.py         # padded_hamming, banded_levenshtein
│   │   ├── urls.py             # route templates, season converter, host/path allow-list
│   │   ├── clock.py            # Clock protocol (monotonic, sleep) + SystemClock
│   │   ├── limiter.py          # TokenBucket, HostLimiter, CircuitBreaker
│   │   ├── retry.py            # RetryPolicy, backoff with jitter
│   │   ├── robots.py           # RobotsPolicy
│   │   ├── http_client.py      # ScrapingHttpClient (shared httpx.AsyncClient)
│   │   ├── cache.py            # PageCache protocol, MemoryCache, RedisCache, key builders
│   │   ├── link_data.py        # LinkedDataProvider (sitemap index, page links)
│   │   ├── resolver.py         # RouteResolver (Hamming → Levenshtein → team)
│   │   ├── probes.py           # team slug, widget id, season links; lxml only
│   │   ├── sanitise.py         # strip csrf/session artefacts before caching
│   │   ├── downloader.py       # PageDownloader (guard→cache→fetch→sanitise)
│   │   ├── service.py          # ScraperService (orchestrator, batch, singleflight)
│   │   ├── competitions.py     # chooses season-select slugs; PageDownloader performs the GET
│   │   ├── metrics.py          # MetricsSink protocol + logging sink
│   │   ├── routes.py           # FastAPI router: /internal/scrape/*
│   │   ├── cli.py              # fantasy-scraper
│   │   └── data/aliases.json   # player_id / nickname → slug overrides
│   └── parser/                 # implemented (see player-stats-parser.md, docs/scraping/parser.md)
│       ├── service.py          # parse, to_markdown, to_player_report
│       ├── models/supplement.py  # FantasySupplement, FantasyWeek, UpcomingContext
│       └── markdown/report.py  # render_player_report
└── tests/
    ├── conftest.py
    ├── parser/…                # golden HTML + test_service (incl. to_player_report)
    ├── fixtures/futbolfantasy/…   # sanitised snapshots, one file per competition slug
    └── scraper/test_*.py       # todo
```

### 3.2 Controller → service → repository → client mapping

| Repo convention | Scraper equivalent |
|-----------------|--------------------|
| Controller (`api/`) | `scraper/routes.py` — parse request, token dependency, call service, map errors |
| Service | `ScraperService` — orchestration only, no HTTP, no parsing |
| Repository | `LinkedDataProvider`, `PageDownloader`, `PageCache` — what to fetch/cache, key and URL building via `urls.py` (single place for encoding) |
| Client | `ScrapingHttpClient` — the only module that imports `httpx`; also owns guard, robots, limiter, retry, breaker |
| Domain/errors | `errors.py` |

`probes.py` extracts only navigation facts (team slug, widget id, season
links) with **lxml**, never statistics.

### 3.3 Public contract (owned here)

```python
class Source(StrEnum):      FUTBOLFANTASY = "futbolfantasy"
class PageKind(StrEnum):    PROFILE = "profile"; MARKET_WIDGET = "market_widget"; COMPETITION = "competition"

class ScrapedPage(BaseModel):                       # extra="forbid"
    source: Source
    kind: PageKind                                   # additive (parser needs it)
    url: str
    fetched_at: datetime                             # UTC, of the original fetch (not cache read)
    status_code: int
    html: str | None                                 # None when text_only
    text: str | None = None                          # only when text_only
    content_type: str | None = None                  # additive
    body_sha256: str                                 # additive, cache/ETag-like identity
    from_cache: bool
    season: str                                      # "2026-27"
    player_slug: str

class Candidate(BaseModel):  slug: str; distance: int; metric: Literal["exact","alias","hamming","levenshtein"]
class PlayerRoute(BaseModel):
    slug: str; url: str; distance: int; candidates: list[Candidate]
    metric: Literal["exact","alias","hamming","levenshtein"]       # additive
    team_verified: bool | None = None                              # additive; None = not checked

class PlayerRef(BaseModel):  name: str; full_name: str | None = None; team: str | None = None; player_id: str | None = None

class ScraperService:
    async def get_linked_data(self, *, refresh: bool = False) -> LinkedData: ...
    async def resolve_player_route(self, player_name: str, team: str | None = None, *,
                                   season: str | None = None, player_id: str | None = None) -> PlayerRoute: ...
    async def download_player_page(self, route_or_url: PlayerRoute | str, *,
                                   kind: PageKind = PageKind.PROFILE,
                                   options: ScrapeOptions | None = None) -> ScrapedPage: ...
    async def scrape_player(self, player_name: str, season: str | None = None, *,
                            team: str | None = None, player_id: str | None = None,
                            include: frozenset[PageKind] = frozenset({PageKind.PROFILE}),
                            options: ScrapeOptions | None = None) -> list[ScrapedPage]: ...
    async def scrape_players(self, refs: Sequence[PlayerRef], season: str | None = None, *,
                             include: frozenset[PageKind] = ..., options: ScrapeOptions | None = None
                             ) -> list[ScrapeOutcome]: ...        # batch, per-item errors
    async def scrape_competition_pages(self, route: PlayerRoute, season: str) -> list[ScrapedPage]: ...
```

Contract notes for the other two plans:

- `scrape_player` returns a **list** (one page per requested `PageKind`) so the
  parser receives profile + market widget together. With the default
  `include={PROFILE}` the list has one element, so single-page callers just use `[0]`.
- `fetched_at` is the original fetch time; `from_cache` tells the reader whether
  this call hit the network. The parser must not re-derive freshness from the HTML.
- `html` is raw HTML with only **session/CSRF artefacts removed** (§6.5); the
  parser sees the page as served otherwise.
- `text_only=True` is for humans/debugging; it destroys table structure, so the
  parser must be called with `text_only=False` (default). The API must not set it.
- Errors cross the process boundary as `{ "error", "detail" }` (§7.2). The scraper
  HTTP surface returns **partial results** for batches (per-item `error`).
- Large bodies: profile ≈ 1 MB, widget ≈ 220 KB. The HTTP response may set
  `include_body=false` and return `page_ref` (cache key) so an in-process or
  same-network parser reads the body from the shared cache instead of re-serialising
  megabytes through the API. Coordinate with the parser/API plans (§12 Q6).

---

## 4. Configuration parameters

### 4.1 Parameter table

Configuration is `pydantic-settings` (`SCRAPER_` prefix, `.env` file, `extra="ignore"`)
for process defaults, plus a per-request `ScrapeOptions` model (`extra="forbid"`)
that may **only tighten or override a subset** (never disable robots, limits,
allow-list, or size caps).

| Brief param | Field | Type | Default | Env var | Validation | Per-request override | Backend |
|-------------|-------|------|---------|---------|------------|----------------------|---------|
| `url` | `ScrapeTarget` (route templates) | not free text | built from `slug`+`season` | — | scheme `https`, host in allow-list, path prefix allow-list, slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`; CLI `fetch --url` goes through the same guard | No (only slug/season/kind) | httpx |
| `user_agent` | `user_agent` | `str` | `LaLigaFantasyBuilder-Scraper/{ver} (+{contact})` | `SCRAPER_USER_AGENT` | 10–256 chars, no CR/LF; `SCRAPER_CONTACT` required if default is used | No (process-wide) | httpx |
| `timeout` | `timeout_ms` | `int` ms | `15000` | `SCRAPER_TIMEOUT_MS` | 1 000–60 000; applied as read timeout, connect = `min(5 000, timeout)`, pool = 5 000 | Yes, lower only (≤ configured) | httpx (and browser nav timeout) |
| `delay` (request interval) | `delay_ms` | `int` ms | per-host (§2.3): FF `0` base + jitter | `SCRAPER_DELAY_MS_FUTBOLFANTASY` | ≥ site floor (cannot go below host policy) | Yes, raise only | limiter |
| `delay` (page load) | `wait_after_load_ms` | `int` ms | `0` | `SCRAPER_WAIT_AFTER_LOAD_MS` | 0–10 000 | Yes | **browser only**; ignored by httpx |
| `text_only` | `text_only` | `bool` | `False` | `SCRAPER_TEXT_ONLY` | — | Yes | httpx + `selectolax` text extraction |
| `proxyType` | `proxy.type` | `none\|datacenter\|residential` | `none` | `SCRAPER_PROXY_TYPE` | `!= none` requires `SCRAPER_PROXY_URL` | No | provider-dependent |
| `proxyCountry` | `proxy.country` | ISO-3166 alpha-2 | `None` | `SCRAPER_PROXY_COUNTRY` | 2 letters | No | provider-dependent |
| `city`/`state` | `proxy.city`, `proxy.state` | `str` | `None` | `SCRAPER_PROXY_CITY`, `SCRAPER_PROXY_STATE` | `[A-Za-z0-9 _-]{1,64}` | No | provider-dependent |
| `asn` | `proxy.asn` | `int` | `None` | `SCRAPER_PROXY_ASN` | 1–4 294 967 295 | No | provider-dependent |
| `selector` | `selector` | `str \| None` | `None` | — | CSS or XPath, ≤ 512 chars, parsed by **lxml** | Yes | optional pre-filter |
| `extract_rules` | `extract_rules` | `dict[str, str] \| None` (name → CSS) | `None` | — | ≤ 20 rules; **dev `probe` path only** | Only on `/internal/scrape/probe` and `fantasy-scraper probe` | httpx |
| `multiple` | `multiple` | `bool` | `True` | — | meaningful only with `selector` | Yes | httpx |

Additional operational parameters (not in the brief but required): `bypass_cache`
(per-request), `max_body_bytes` (`SCRAPER_MAX_BODY_BYTES`, default 4 MiB profile /
8 MiB sitemap), `max_redirects` (3), `retries` (`SCRAPER_MAX_ATTEMPTS`, 3),
`global_concurrency` (8), per-host concurrency/rate (§2.3), cache TTLs (§6),
`ALLOWED_HOSTS` is **not configurable** (constant in `urls.py`, FutbolFantasy only).

### 4.2 `ProxyConfig`

```python
class ProxyConfig(BaseModel):          # all optional; type="none" short-circuits
    type: Literal["none", "datacenter", "residential"] = "none"
    url: SecretStr | None = None        # e.g. http://user:pass@proxy.example:8000
    country: str | None = None; state: str | None = None
    city: str | None = None;   asn: int | None = None
```

httpx supports one proxy URL per client. Geo/ASN selection is provider-specific
(usually encoded in the proxy username or query), so the plan ships a
`ProxyUrlBuilder` protocol with a single built-in "username-suffix" template
(`SCRAPER_PROXY_URL_TEMPLATE`, e.g. `{user}-country-{country}-asn-{asn}`) and no
vendor SDK. Defaults are off; nothing in CI or local dev needs it; the proxy URL
is a `SecretStr` and never logged. A proxy never exempts a request from robots,
the limiter, or the allow-list.

### 4.3 `selector` / `extract_rules` / `multiple` decision

The deterministic extraction (JSON/MD) is the parser's job and must live in
exactly one place. Duplicating selectors in the scraper would create two sources
of truth for the markup. Decision:

- `selector` (CSS) = **pre-filter**: after download, keep only matching nodes'
  outer HTML (`multiple=True`: all matches concatenated in document order,
  `multiple=False`: first match). Purpose: shrink bodies for the HTTP hop, and
  `wait_for` on the future browser backend. If nothing matches → `UnexpectedContentError`
  (no silent empty page — same fail-closed rule as the proxy pitfalls doc).
  The pipeline sets no selector (the parser needs the full page).
- `extract_rules` = accepted **only** by `probe`, a developer tool that returns
  `fragments: dict[str, list[str]]` to help write parser fixtures. Never used by
  `scrape_player`, never consumed by the parser.
- XPath is supported. The scraper and the parser both use **lxml**.

---

## 5. Concurrency design

### 5.1 Model

- **asyncio + one shared `httpx.AsyncClient`** (same pattern as
  `LaligaFantasyClient`: one client per worker, closed on shutdown). I/O wait
  dominates; threads add no throughput and add locking risk.
- **Three nested limits** (all must pass before a request is sent):
  1. global `asyncio.Semaphore(8)` (`SCRAPER_GLOBAL_CONCURRENCY`);
  2. per-host `Semaphore` (FF 4);
  3. per-host **token bucket** (rate + burst) followed by a jittered sleep.
- Batches use `asyncio.TaskGroup`; each item catches `ScrapingError` and turns
  it into a per-item outcome so one bad player never cancels the batch.

### 5.2 Why these numbers (Little's law)

`concurrency ≈ rate × latency`. Observed one-shot latency for the ~1 MB profile
page ≈ 1–2.5 s including TLS. At the chosen 1.5 req/s: `1.5 × 2.5 ≈ 4` in-flight
requests per host — higher concurrency would only queue behind the token bucket
and raise the chance of tripping the 30 / 10 s limit. The global cap of 8 leaves
room for sitemap refresh and robots fetches without starving profile downloads.

Throughput budget (cold cache, FF): 1 player = 2 requests (profile + widget) ≈
1.4 s of rate budget; 25 players = 50 requests ≈ 34 s; plus one-off index ≈ 3 s.
Batch deadline default 90 s (`SCRAPER_BATCH_TIMEOUT_S`). Warm cache: zero
requests. Batch size is capped at 25 per call.

### 5.3 Threads: when and where

| Work | Where | Why |
|------|-------|-----|
| HTTP, Redis | event loop | I/O |
| Sitemap XML parse (3.4 MB, `defusedxml.iterparse`) and index build (bucket by length, token index) | `ThreadPoolExecutor(max_workers=2)` via `run_in_executor` | ~50–100 ms CPU blocks the loop otherwise; done once per index refresh |
| Route scoring over 16 k slugs (≈ 75 ms) | same executor (or inline if ≤ 3 candidates after bucketing) | Keeps `/health/live` responsive during batches |
| Headless browser (**not in v1**) | async Playwright, `max_pages=2`, own semaphore; no threads needed | Only if a widget turns out to require JS. Observed: widget and profile are server-rendered, so Playwright is *not* a v1 dependency; kept as optional extra `browser` |

Rejected alternatives: `requests` + thread pool (blocking, harder cancellation,
no per-host async limiter); Scrapy (framework weight, its own scheduler/queue
conflicts with on-demand request/response semantics, extra process model).

### 5.4 Request coalescing (singleflight)

`dict[key, asyncio.Future]` keyed by `(method, url)` in `PageDownloader`: the
first caller performs fetch → sanitise → cache write; concurrent callers await
the same future (also covers the sitemap and robots). The future is removed in
`finally`; exceptions propagate to all waiters (negative result cached by the
cache layer, not the singleflight map). Cancelling one waiter must not cancel the
shared task (`asyncio.shield`).

### 5.5 Graceful shutdown

FastAPI `lifespan`: on shutdown set `accepting=False` (new requests → 503
`shutting_down`), wait up to `SCRAPER_SHUTDOWN_GRACE_S=15` for in-flight tasks,
cancel the rest, then close the `httpx.AsyncClient`, Redis pool, and executor.
In-flight HTTP responses already received are still cached before cancellation.

---

## 6. Caching design

### 6.1 What is cached

| Kind | Key (prefix `fantasy:scrape:v1:`) | Value | TTL fresh | Stale-while-revalidate window | Negative TTL |
|------|-----------------------------------|-------|-----------|-------------------------------|--------------|
| Player index (`LinkedData`: slugs, teams, built token/length buckets metadata) | `index:futbolfantasy:players` | compact JSON + source ETag/Last-Modified | **24 h** | up to 7 d if refresh fails | — |
| Team index | `index:futbolfantasy:teams` | JSON | 24 h | 7 d | — |
| Resolved route | `route:{season}:{player_id\|norm_name}:{team_slug\|-}` | `PlayerRoute` JSON | **7 d** | 30 d | `not_found` 1 h; `ambiguous` 10 min |
| Profile page | `page:profile:{season}:{slug}` | `ScrapedPage` JSON (body zlib+base64 in Redis) | **10 min** (injuries/lineup probability change often; `SCRAPER_TTL_PROFILE_S`) | 2 h | `404` 15 min |
| Market widget | `page:market:{ff_id}` | `ScrapedPage` | **5 min** | 1 h | — |
| robots.txt | `robots:{host}` | text | 24 h | 24 h | — |
| Competition page | `page:ff:{season_slug}:{player_slug}` | `ScrapedPage` | 6 h | 24 h | 404 cached 1 h |

Rationale: the index and routes are near-static (new signings appear within
days); one profile page contains fixtures, injuries, lineup probability and news,
so its TTL is the **shortest** of those concerns (injuries/lineups), not the
longest. A matchday-aware TTL (shrink to 2 min on matchday) is a follow-up.

### 6.2 Backend

Mirror the repo convention: `USE_MEMORY_STORE=true` (default for dev/tests) →
`MemoryCache`; `false` → `RedisCache` using `REDIS_URL` with a **dedicated logical
DB** (`/1`; auth uses `/0`) and the key prefix above. `PageCache` is a Protocol
(`get`, `set`, `delete`, `get_stale`), so tests inject a fake and the clock is
injected for TTL tests.

- Memory: LRU by bytes (`SCRAPER_MEMORY_CACHE_MAX_BYTES`, default 64 MiB), per-entry
  expiry; entries are immutable `ScrapedPage` copies.
- Redis: `SET key value EX ttl+swr`, with a `fresh_until` field inside the value
  (so a single key serves fresh/stale); bodies compressed (zlib) → ≈ 150–250 KB per
  profile; `maxmemory-policy allkeys-lru` recommended in Compose.
- The index is also held in-process after build (it is the hot path for resolution).

### 6.3 Freshness behaviours

- **Stale-while-revalidate:** within the SWR window return the stale value with
  `from_cache=True` and trigger one background refresh (singleflight-guarded,
  `asyncio.create_task`, tracked for shutdown).
- **Conditional requests:** store `ETag`/`Last-Modified` when present and send
  `If-None-Match`/`If-Modified-Since`; `304` refreshes `fresh_until` only. Observed:
  FF HTML sends `Cache-Control: no-cache, private` and no validators on the page,
  so this mainly benefits the sitemap; implemented generically.
- **Negative caching:** `PlayerNotFound` and upstream `404` are cached (short) to
  stop repeated lookups for players absent from the site. `5xx`, timeouts, and
  blocks are **not** cached (the breaker handles those).
- **Bypass:** `bypass_cache=True` (request flag; CLI `--no-cache`) skips reads
  but still writes. It does **not** skip the rate limiter, robots, or the breaker.
- **Invalidate:** `POST /internal/scrape/cache/invalidate {slug|season}` (token).

### 6.4 Key hygiene

Slugs are validated against the slug regex before they become part of a key or
URL; the season against `^\d{4}-\d{2}$`. Keys never contain cookies, headers,
bearer tokens, or caller identity (the content is public and user-independent).

### 6.5 Storing HTML without secrets

Observed: FF responds with session cookies and is Laravel-style, so pages can
embed CSRF material. `sanitise.py` runs **before** caching and returns:

- no response headers (only `content_type`, `status_code`, `etag` are kept);
- `<meta name="csrf-token" …>` and `<input name="_token" …>` values blanked;
- inline `<script>` bodies untouched (the parser may need them) but nothing from `Set-Cookie`;
- the cookie jar is disabled in the client (`DefaultCookiePolicy(allowed_domains=[])`).

Fixtures committed to git go through the stricter `tests/tools/sanitise_fixture.py`
(drops scripts, ads, inline SVG, trims to the sections tests need).

---

## 7. Errors, retries, observability

### 7.1 Exceptions (`scraper/errors.py`)

```text
ScrapingError(category, status_code)
├── PlayerNotFoundError           player_not_found        404
├── AmbiguousPlayerError          player_ambiguous        409   (carries candidates)
├── HostNotAllowedError           host_not_allowed        400
├── InvalidRequestError           invalid_request         422   (bad season/selector/slug)
├── RobotsDisallowedError         robots_disallowed       403
├── SourceDisabledError           source_disabled         503   (reserved)
├── UpstreamBlockedError          upstream_blocked        503   (403, challenge, repeated 429)
├── UpstreamRateLimitedError      upstream_rate_limited   503   (Retry-After exposed)
├── UpstreamTimeoutError          upstream_timeout        504
├── UpstreamUnavailableError      upstream_unavailable    502   (5xx, connect errors)
├── UnexpectedContentError        unexpected_content      502   (non-HTML 200, wrong type, oversize, selector miss)
├── LinkDataUnavailableError      linkdata_unavailable    503   (no fresh and no stale index)
└── CircuitOpenError              circuit_open            503
```

### 7.2 HTTP mapping

Global handlers in `main.py` serialise to the repo-wide `{ "error", "detail" }`
body. `detail` is a fixed human sentence (e.g. "upstream blocked the request");
never an upstream body, header, cookie, URL with credentials or proxy string.
Because the API wraps this service the same way it wraps Fantasy
(`fantasy_error`), the API plan should map any scraper non-2xx to its own
`UpstreamError` category (suggested `scraper_error`, status forwarded for 404/409/503).
`GET`-style reads never return `[]`/`{}` for "we did not understand upstream":
non-HTML `200`, empty body, oversize and missing selector are 502 (proxy
pitfalls doc, "fail closed").

### 7.3 Retry and backoff policy

| Condition | Retry | Detail |
|-----------|-------|--------|
| Connect error, read/connect timeout | Yes, max 3 attempts total | Backoff `min(30 s, 1 s · 2ⁿ)` with full jitter |
| `408`, `425`, `500`, `502`, `503`, `504` | Yes | Same; honour `Retry-After` (cap 60 s) |
| `429` | Yes once, after `Retry-After` (or 10 s); second `429` → `UpstreamRateLimitedError`, breaker counts a failure; token bucket rate is halved for 5 min | |
| `403`, Cloudflare challenge (`cf-mitigated`), CAPTCHA markers | **No** | `UpstreamBlockedError`, breaker opens immediately |
| `404` | No | `PlayerNotFoundError` (profile) / negative cache |
| `3xx` | Follow ≤ 3 hops manually; every hop re-validated against the allow-list; cross-host redirect → `HostNotAllowedError` | |
| `200` non-HTML/XML, over `max_body_bytes`, wrong `Content-Type` | No | `UnexpectedContentError` |
| `4xx` other | No | `UpstreamUnavailableError` (status not forwarded) |

Circuit breaker (per host): `closed → open` after 5 failures within 60 s;
open for 60 s; `half_open` lets exactly one probe through.
State is in-process (per worker); acceptable since the scraper runs as one
worker in v1 (`uvicorn --workers 1`) — documented, because multiple workers
would multiply the effective rate.

### 7.4 Observability

- `logging` only (no `print`), structured JSON when `LOG_JSON=true`
  (same switches as API: `LOG_LEVEL`, `LOG_JSON`). Fields: `host`, `kind`,
  `status`, `duration_ms`, `attempt`, `from_cache`, `cache_age_s`, `slug`,
  `error`. Never log bodies, headers, cookies, or proxy URLs.
- `MetricsSink` protocol with counters/histograms — `scrape_requests_total{host,status}`,
  `scrape_cache_total{kind,result}`, `scrape_rate_wait_seconds{host}`,
  `scrape_breaker_state{host}`, `scrape_route_distance`, `scrape_body_bytes`.
  Default sink logs at DEBUG; an optional OpenTelemetry sink reuses the repo's
  `OTEL_EXPORTER_OTLP_ENDPOINT` convention (empty disables).
- `/health/live` (process), `/health/ready` (cache reachable; index present or
  loadable), `GET /internal/health` (token; breaker states, index age, cache stats).

---

## 8. Security

1. **SSRF / allow-list.** Callers never supply URLs on the HTTP surface; they
   supply names, slugs, season and kind. URLs are built from templates in
   `urls.py` only:
   - `https://www.futbolfantasy.com/jugadores/{slug}/laliga-{yy}-{yy}`
   - `https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado/detalle/{id}?perfil=1` (`id` = digits)
   - `https://www.futbolfantasy.com/sitemap.xml`, `sitemap-jugadores.xml`, `sitemap-equipos.xml`
   - `https://www.futbolfantasy.com/jugadores/{slug}/{season-slug}`
   The CLI's `fetch --url` and any redirect target go through `assert_allowed_url`:
   scheme `https`, exact host `www.futbolfantasy.com`, port 443/default,
   no userinfo, path starts with an allowed prefix, no `..`, no encoded slashes.
   Redirects are followed manually (≤ 3) and re-validated. When no proxy is used,
   the resolved IP of each connection is checked to be public (blocks DNS-rebinding
   to RFC 1918/link-local) via a custom `httpx` transport hook.
2. **Private surface.** All `/internal/*` routes require `X-Service-Token`
   (`secrets.compare_digest`, same helper pattern as auth `require_service_token`)
   **and** network isolation (only the `internal` Compose network; no published
   host port outside dev). A **separate** secret `SCRAPING_SERVICE_TOKEN` is used
   (least privilege: leaking it must not open auth's credential route).
   Missing/empty configured token → app refuses to start outside `DEBUG`.
3. **No LaLiga secrets.** No LaLiga settings, no bearer in headers or logs, no
   import of `fantasy_api` or `fantasy_auth`; `backend/auth` must not import
   `fantasy_scraping`. User identity is not needed (public data), so no JWT here;
   authorisation of *who may ask* stays in the API (JWT `sub`).
4. **Path-segment encoding.** Slugs are regex-validated then still passed through
   `repositories`-style `path_segment` encoding in `urls.py`; ids are digits only.
5. **Response hygiene.** Streamed with a hard byte cap (decoded bytes, so
   gzip bombs are bounded); `Content-Type` must be `text/html`, `application/xhtml+xml`
   or (sitemaps) `text/xml`/`application/xml`; sitemap XML parsed with `defusedxml`
   (no entity expansion); HTML is **never executed** (no JS engine in v1; if
   Playwright is ever enabled: JS only for allow-listed hosts, no downloads,
   no file access, fresh context per request).
6. **Secrets in config.** `SCRAPING_SERVICE_TOKEN`, `SCRAPER_PROXY_URL`, `REDIS_URL`
   are secrets: `SecretStr`, never in logs/OpenAPI; `.env.template` carries only dev placeholders.
7. **Automation rules (AGENTS.md).** The scraper has no LaLiga write capability;
   the CLI is read-only and cannot place bids, pay/increase clauses or activate shields.
8. **Abuse bounds.** Batch ≤ 25 refs, name length ≤ 100, `candidates` returned ≤ 5,
   request body ≤ 64 KB, per-caller concurrency is bounded by the global semaphore.

---

## 9. Private HTTP surface, CLI, packaging, docs

### 9.1 Routes (all `X-Service-Token`, except health probes)

| Method | Path | Purpose | Body / query | Response |
|--------|------|---------|--------------|----------|
| `GET` | `/health/live`, `/health/ready` | Docker healthcheck | — | `{status}` |
| `GET` | `/internal/health` | Detailed status | — | breakers, index age/size, cache stats |
| `GET` | `/internal/scrape/linked-data` | `get_linked_data` summary (counts, `fetched_at`, ages; not the 16 k slugs) | `refresh=bool` | `LinkedDataSummary` |
| `POST` | `/internal/scrape/linked-data/refresh` | Force index refresh | — | `LinkedDataSummary` |
| `GET` | `/internal/scrape/routes` | `resolve_player_route` | `name`, `team?`, `full_name?`, `player_id?`, `season?` | `PlayerRoute` |
| `POST` | `/internal/scrape/players` | `scrape_players` (batch ≤ 25) | `ScrapePlayersRequest` (`players: list[PlayerRef]`, `season?`, `include: list[PageKind]`, `options: ScrapeOptions`, `include_body: bool`) | `{"results": [{"ref", "pages": [ScrapedPage]\|null, "route", "error": {"error","detail"}\|null}]}` |
| `POST` | `/internal/scrape/probe` | Dev: `selector`/`extract_rules` on a route | `ProbeRequest` | `{fragments}` (disabled unless `DEBUG`) |
| `POST` | `/internal/scrape/cache/invalidate` | Drop cached entries | `{slug?, season?}` | `{deleted}` |

`POST /internal/scrape/players` returns **200 with per-item outcomes** (a
failed player must not fail the batch); request-level problems are 4xx.
Single-player callers send a one-element list. Pydantic request models use
`extra="forbid"`; response models are the typed ones above. Docs/OpenAPI are
enabled only when `DEBUG=true`; `backend/scraping/openapi.json` is generated
with the same generator pattern as API/auth for review.

### 9.2 CLI `fantasy-scraper` (read-only, `scraper/cli.py`)

```bash
cd backend/scraping
uv run fantasy-scraper resolve "Oyarzabal" --team "Real Sociedad" --json
uv run fantasy-scraper scrape "Raphinha" --season 2026-27 --team "FC Barcelona" --out tmp/scrape/
uv run fantasy-scraper index refresh
uv run fantasy-scraper probe "Raphinha" --selector "h1.jugador-nombre"
uv run fantasy-scraper scrape "Raphinha" --service-url http://localhost:8002   # via HTTP + token
```

- Default mode runs `ScraperService` **in-process** (no token needed; uses
  `.env`), `--service-url` + `SCRAPING_SERVICE_TOKEN` env uses the HTTP surface.
- Flags: `--season`, `--team`, `--player-id`, `--no-cache`, `--include profile,market`,
  `--text-only`, `--timeout-ms`, `--delay-ms` (raise only), `--json`, `--out DIR`
  (writes sanitised HTML + metadata).
- Public data only → no JWT, no `fantasy-browser-session`, nothing to log in to.
  It shares the limiter, robots check and breaker with the service: **no
  `--ignore-robots` or `--no-rate-limit`**. It cannot mutate LaLiga state.
- Registered in `pyproject.toml`: `fantasy-scraper = "fantasy_scraping.scraper.cli:main"`,
  `laliga-fantasy-builder-scraping = "fantasy_scraping.main:run"`.

### 9.3 `pyproject.toml` (sketch)

Dependencies: `fastapi`, `uvicorn[standard]`, `httpx`, `pydantic`, `pydantic-settings`,
`selectolax`, `defusedxml`, `redis` (asyncio client). Dev group: `pytest`,
`pytest-asyncio`, `pytest-cov`, `ruff`, `black`. Optional extra `browser`:
`playwright`. `requires-python = ">=3.14"`, `[tool.pytest.ini_options]`
`asyncio_mode = "auto"`, `pythonpath = ["src"]`, `--cov-fail-under=80`;
`[tool.uv.build-backend] module-name = "fantasy_scraping"`. `uv.lock` committed.

### 9.4 Dockerfile and Compose

`backend/scraping/Dockerfile` copies `backend/api/Dockerfile` (uv builder, `python:3.14-slim-trixie`
runtime, non-root uid 999), `EXPOSE 8002`, healthcheck on `/health/live`, `CMD uvicorn
fantasy_scraping.main:create_app --factory --host 0.0.0.0 --port 8002` (**one worker**, §7.3).

Compose addition. Note: the existing `internal` network is `internal: true`
(**no outbound internet**), so the scraper needs a second, egress-capable network
and must not join `public`:

```yaml
  scraping:
    build: { context: ./backend/scraping, dockerfile: Dockerfile }
    env_file: [./backend/scraping/.env]
    environment:
      SCRAPING_SERVICE_TOKEN: ${SCRAPING_SERVICE_TOKEN}
      USE_MEMORY_STORE: ${USE_MEMORY_STORE:-true}
      REDIS_URL: ${SCRAPING_REDIS_URL:-redis://${REDIS_HOST:-redis}:${REDIS_PORT:-6379}/1}
    depends_on:
      redis: { condition: service_healthy, required: false }
    profiles: [apps, full]
    networks: [internal, egress]      # reachable by api; can fetch public sites; not on public

networks:
  egress: {}                          # outbound internet, no published ports
```

`api` gets `SCRAPING_BASE_URL=http://scraping:8002` and `SCRAPING_SERVICE_TOKEN`
(API plan wires the client). Dev publish port via `SCRAPING_PUBLISH_PORT` only for local runs.

### 9.5 `.env.template` additions

```dotenv
# ---- Scraping (profiles: apps, full) ----
SCRAPING_SERVICE_PORT=8002
SCRAPING_PUBLISH_PORT=8002
SCRAPING_BASE_URL=http://scraping:8002
SCRAPING_SERVICE_TOKEN=dev-scraping-token
SCRAPING_REDIS_URL=redis://redis:6379/1
```

and in `backend/scraping/.env` (documented, template committed as
`backend/scraping/.env.example` if the repo keeps one for api/auth): `SCRAPER_CONTACT`,
`SCRAPER_USER_AGENT`, `SCRAPER_TIMEOUT_MS`, `SCRAPER_GLOBAL_CONCURRENCY`,
`SCRAPER_TTL_*`, `SCRAPER_PROXY_*`, `LOG_LEVEL`, `LOG_JSON`.

### 9.6 Documentation to update (per `docs/api/adding-endpoints.md` §4 and AGENTS.md)

| File | Change |
|------|--------|
| `docs/scraping/parser.md` | **Done** — parse, `to_markdown`, `to_player_report`, `FantasySupplement` |
| `docs/scraping/README.md` (new) | Scraper section: purpose, routes table (method, path, auth, model), parameters, TTLs, CLI, compliance rules, observed-vs-assumed table; link to `parser.md` |
| `docs/README.md` | New "Scraping (`backend/scraping`)" table row |
| `docs/architecture.md` | Repository layout, system-context diagram (`Api → Scraping → FutbolFantasy`), new "Private API-to-scraping boundary" under Trust boundaries (service token + private network + egress network), deployment constraints (`egress` network, single worker) |
| `AGENTS.md` | Layout table row for `backend/scraping` (port 8002); Security: "`backend/auth` must not import `fantasy_scraping`; scraping holds no LaLiga tokens"; rules for scraping CLIs (read-only) |
| `README.md` (root) | Services table, quick start, `fantasy-scraper` |
| `docs/api/players/README.md` | Cross-link to the future Players endpoint (API plan) |
| `docker-compose.yml`, `.env.template` | §9.4–9.5 |
| `.github/workflows/ci.yml` and pre-commit | Add `backend/scraping` ruff + black + pytest with coverage gate; ensure auth/API still do not depend on it |
| `backend/scraping/README.md` | Run, test, CLI, env |
| `backend/scraping/openapi.json` | Generated (internal docs only) |

`uv run poe generate-openapi` / `generate-endpoint-schemas` for `backend/api` are
the API plan's responsibility; this plan adds none to the public API.

---

## 10. Test plan

Conventions: `{method_name}_{state_under_test}_{expected_behavior}`, Arrange-Act-Assert,
sections `# ---- Mocks, fixtures & helpers ---- #`, `# ---- Happy path ---- #`,
`# ---- Error paths ---- #`, `# ---- Edge cases ---- #`. HTTP through
`httpx.MockTransport` injected into `ScrapingHttpClient`; a `FakeClock`
(`monotonic()` + awaitable `sleep()` that advances time) injected everywhere time
matters; an in-memory `PageCache` double.

### 10.1 Fixtures

| File | Content |
|------|---------|
| `fixtures/futbolfantasy/robots.txt` | Observed robots (allow all) + a `Disallow: /jugadores/` variant |
| `fixtures/futbolfantasy/sitemap-index.xml` | Trimmed index |
| `fixtures/futbolfantasy/sitemap-jugadores.xml` | ≈ 60 curated slugs: `raphinha`, `rochinha`, `mikel-oyarzabal`, `eduardo-camavinga`, `inaki-williams`, `danny-williams`, `vinicius-junior`, `vinicius-tanque`, `gueye`, `idrissa-gueye`, `idrissa-gueye-1`, `lamine-gueye`, `lamine-gueye-1`, `lamine-yamal`, `lamine-camara`, `inaki-lvarez`, `vitinha`, `vitinho` |
| `fixtures/futbolfantasy/sitemap-equipos.xml` | 20 team slugs |
| `fixtures/futbolfantasy/raphinha_laliga_26_27.html` | Trimmed profile (team link, canonical, season tabs, widget link, injury table, last/next 5) |
| `fixtures/futbolfantasy/market_widget_4288.html` | Trimmed widget |
| `fixtures/futbolfantasy/challenge.html` | Generic "Just a moment…" body (synthetic) |
| `fixtures/futbolfantasy/champions_*.html`, `copa_*.html` | Competition pages, same template |

Fixtures are produced by `tests/tools/sanitise_fixture.py` (drops scripts, ads,
SVG, CSRF/session values) and stay minimal for copyright and repo-size reasons.

### 10.2 Matrix

| Area | Cases (examples of test names) |
|------|--------------------------------|
| `normalise` | `normalise_accents_folded`, `normalise_apostrophe_and_dot_dropped`, `normalise_non_decomposable_letters_mapped`, `normalise_numeric_suffix_stripped_for_slug_base`, empty/emoji/very long input |
| `distance` | `padded_hamming_equal_strings_returns_zero`, `…_length_gap_counts_as_mismatches`, `…_shift_after_deletion_is_large` (Iñaki Álvarez = 7), `banded_levenshtein_over_band_returns_none` |
| Route resolution (parametrised) | exact (`Raphinha`), accent (`Vinícius Júnior`), typo (`Raphinah`), single-token via `d_tok` (`Oyarzabal`, `Camavinga`), namesake with/without team (`Gueye`), alias (`Vini Jr.`/`3102`), Levenshtein fallback (`Iñaki Álvarez`), no-match (`Zzzz Qqqq`) → `PlayerNotFoundError`, threshold boundary (`d == allowed`, `d == allowed+1`), gap boundary (gap 1 vs 2), deterministic tie-break order, numeric-suffix twin grouping, `AmbiguousPlayerError` carries ≤ 5 candidates |
| Team verification | winner reused (single download), none match → ambiguous, probe selector missing → `UnexpectedContentError`, `TEAM_ALIASES` (`FC Barcelona`→`barcelona`) |
| Link data | parse index→sitemaps→slugs, `defusedxml` rejects entity bomb, bad XML → `UnexpectedContentError`, `304` refresh, SWR serves stale on refresh failure, no index at all → `LinkDataUnavailableError` |
| Robots | allowed; `Disallow: /jugadores/` → `RobotsDisallowedError` with **zero** requests to the player URL; robots 404 → allow; robots 503 → disallow 1 h; challenge on robots → `UpstreamBlockedError` |
| SSRF | other host, `http://`, userinfo `@`, port, `..`, `%2f`, cross-host redirect, 4th redirect, private-IP resolution — all rejected before connect; CLI `--url` same |
| Rate limiter / backoff (FakeClock) | token bucket refill and burst, jitter bounds (seeded RNG), `delay_ms` cannot go below host floor, `Retry-After` honoured and capped, `429` halves rate, exponential backoff sequence |
| Circuit breaker | opens after 5/60 s, rejects while open (`CircuitOpenError`, no request), half-open single probe, closes on success |
| Concurrency | with a gated handler assert max in-flight per host ≤ 4 and global ≤ 8 across 30 tasks; batch continues after a failing item; singleflight issues exactly 1 request for 20 concurrent identical calls; cancelling one waiter keeps the others; shutdown drains in-flight |
| Cache | TTL expiry (FakeClock), SWR returns stale then refreshes once, negative cache TTLs, `bypass_cache` skips read but writes, key format snapshot, LRU eviction by bytes, Redis double (fake) round-trip with zlib, no header/cookie in stored value |
| Sanitiser | CSRF meta/inputs blanked, `Set-Cookie` never stored, idempotent |
| Downloader / content | 200 `application/json` or empty body → `UnexpectedContentError`; oversize (streamed abort); gzip bomb capped; `text_only` → `html is None`, `text` set; `selector` hit/miss; `multiple` first vs all; `from_cache` flag; `fetched_at` preserved across cache reads |
| Status paths | `404` → `PlayerNotFoundError` (+negative cache), `403`/challenge → `UpstreamBlockedError` (no retry), `429`→ retry once then error, `500/502/503/504` retried then `UpstreamUnavailableError`, connect/read timeout → `UpstreamTimeoutError`, retry count asserted |
| HTTP routes (`fastapi.testclient`) | missing/wrong `X-Service-Token` → 401, correct → 200, `extra` body keys → 422, batch > 25 → 422, per-item error inside 200, `{error, detail}` shape with **no** upstream body/header/cookie/proxy string, `include_body=false` returns `page_ref`, `/health/live` works without token, shutting-down → 503 |
| Config | invalid `timeout_ms`, proxy type without URL, missing `SCRAPER_CONTACT` with default UA, `SCRAPING_SERVICE_TOKEN` empty outside debug, secrets not in `repr` |
| CLI | argument parsing, `--json` output, `--out` writes sanitised files, in-process vs `--service-url`, no flag disables robots/limits |
| Live smoke | `@pytest.mark.live`, **skipped by default** (`-m "not live"` in `addopts`; run with `RUN_LIVE_SCRAPER=1 uv run pytest -m live`). One profile + one widget for `raphinha` with real limiter, asserts 200/HTML/`from_cache` toggle and that the team probe still finds `barcelona`. Also the early-warning for markup drift |

Coverage gate: `uv run pytest --cov=src --cov-report=term-missing --cov-fail-under=80`
(target ≥ 90 % like auth/API in pre-commit). The live marker is excluded from CI.

---

## 11. Milestones, risks, open questions

### 11.1 Delivery milestones

Sizes: **S** ≈ ≤ 1 day, **M** ≈ 1–2 days, **L** ≈ 3+ days (one engineer).

| # | Milestone | Acceptance criteria | Size |
|---|-----------|---------------------|------|
| M1 | Project skeleton: `backend/scraping`, config, models, errors, `normalise`, `distance`, token security, `/health`, lint/test CI | `uv sync && uv run pytest` green; `ruff`/`black` clean; models match §3.3; coverage gate wired | S |
| M2 | Guarded HTTP client: `urls.py` allow-list, robots, limiter, breaker, retry, size/content checks, cookieless | All SSRF, robots, rate-limit, breaker, status-path tests green with `FakeClock`; no real network in tests | M |
| M3 | Cache layer: `PageCache`, memory + Redis implementations, keys, TTL/SWR/negative, sanitiser | Cache tests green; Redis double round-trips; no secrets in stored value | M |
| M4 | Linked data + route resolver: sitemap/team index, alias table, Hamming/Levenshtein, thresholds, ambiguity | Parametrised resolution table of §1.6 passes exactly; full scan on the 16 k-slug synthetic index < 150 ms in executor | M |
| M5 | Downloader + probes + orchestrator `ScraperService` (profile + market widget), singleflight, batch, shutdown; verify widget "puja máxima rentable" availability | Orchestrator happy path + cache-hit path (zero requests) pass; concurrency bound tests pass; live smoke manually green; widget finding recorded in §2.1 | M |
| M6 | Private HTTP surface, Dockerfile, Compose (`egress` network), `.env.template`, docs (`docs/scraping`, architecture, AGENTS, READMEs), CI | `docker compose --profile apps up scraping` healthy; route tests green; docs table of §9.6 done; openapi generated | M |
| M7 | CLI `fantasy-scraper` + fixture tooling + `probe` (selector/extract_rules/multiple) | CLI tests green; fixtures reproducible via `sanitise_fixture.py`; probe disabled outside debug | S |
| M8 | Competition pages (`kind=competition`) | Given a profile fixture whose `<select>` lists `champions-26-27`, the orchestrator requests that slug and no other host. Cache key includes the slug | M |
| M9 | Hardening: matchday-aware TTL, OTEL sink, background SWR refresh polish, optional prefetch hook | Metrics emitted in tests via fake sink; no regression in coverage | S |

Critical path: M1 → M2 → M3 → M4 → M5 → M6; M7 can start after M5; M8 is optional.

### 11.2 Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | futbolfantasy markup/URL changes break probes or the parser | High over months | High | Scraper depends on very little markup (probes only); nightly live smoke; fixtures versioned; `UnexpectedContentError` fails closed instead of returning garbage |
| R2 | Anti-bot (rate-limit ban, Cloudflare) added to futbolfantasy | Medium | High | 50 % of observed limit, backoff, breaker, cache-first; no evasion by policy; degrade to stale cache |
| R3 | ToS/legal: automated access or reuse not permitted; database-right exposure | Unknown | **High** | Not reviewed yet; ask the owner (§12 Q1); cache TTLs short; HTML internal only; attribution; feature flag to disable the source |
| R4 | A competition slug 404s or the select omits a competition that appears in "últimos 5" | Medium | That match has minutes and score only | Warning `competition_page_missing`; do not call another site |
| R5 | Hamming misresolves players (namesakes, nicknames, dropped accented letters) | Medium | Medium | Threshold + gap + team verification + alias table + Levenshtein fallback; typed `not_found`/`ambiguous` instead of wrong page; live smoke asserts team |
| R6 | Async widgets need JS (market value, "puja máxima rentable") | Low (widget observed server-rendered) | Medium | Verify in M5; optional Playwright backend behind extra; otherwise API's market-value route already covers values |
| R7 | Large bodies (1 MB × batch) strain memory/JSON hops | Medium | Medium | `include_body=false` + `page_ref`, zlib in Redis, batch ≤ 25, size caps |
| R8 | Multi-worker deployment multiplies the effective rate (in-process limiter) | Medium | Medium | Single worker documented and enforced in Dockerfile; Redis-based limiter as follow-up if scaled |
| R9 | `internal: true` Compose network blocks outbound traffic | Certain if overlooked | High | `egress` network in §9.4, covered by a Compose smoke in M6 |
| R10 | Catalog lacks `name`/`slug`/`team` (observed) so inputs are weak | Medium | Medium | API sends nickname + team name; alias table keyed by `player_id`; unresolved names surface as `not_found`, reviewed via metrics |
| R11 | Stale injury/lineup data shown as fresh | Medium | Medium | Short profile TTL, `fetched_at`/`from_cache` surfaced to the UI |

### 11.3 Orchestrator sequence

```mermaid
sequenceDiagram
    participant Caller as Caller (API / CLI)
    participant Svc as ScraperService
    participant Cache as PageCache
    participant Link as LinkedDataProvider
    participant Res as RouteResolver
    participant Dl as PageDownloader
    participant Http as ScrapingHttpClient
    participant FF as futbolfantasy.com

    Caller->>Svc: scrape_player(name, season, team, include)
    Svc->>Cache: get route:{season}:{id|name}:{team}
    alt route cached
        Cache-->>Svc: PlayerRoute
    else miss
        Svc->>Link: get_linked_data()
        Link->>Cache: get index:futbolfantasy:players
        alt index fresh or stale (SWR)
            Cache-->>Link: LinkedData
        else miss
            Link->>Http: GET sitemap.xml, sitemap-jugadores.xml, sitemap-equipos.xml
            Http->>FF: robots check, limiter, GET
            FF-->>Http: XML
            Link->>Cache: set index (TTL 24h)
        end
        Link-->>Svc: LinkedData
        Svc->>Res: resolve(name, team, linked_data)
        Res-->>Svc: PlayerRoute or PlayerNotFound or Ambiguous
        opt ambiguous and team known
            Res->>Dl: download top candidates (reused as final page)
        end
        Svc->>Cache: set route (TTL 7d, negative if not found)
    end
    Svc->>Cache: get page:profile:{season}:{slug}
    alt fresh or stale-while-revalidate
        Cache-->>Svc: ScrapedPage (from_cache=true)
    else miss
        Svc->>Dl: download_player_page(route)
        Dl->>Http: GET /jugadores/{slug}/laliga-yy-yy
        Http->>FF: robots, host limiter, breaker, singleflight
        FF-->>Http: 200 text/html
        Http-->>Dl: bytes, status
        Dl->>Dl: content-type and size check, sanitise
        Dl->>Cache: set page (TTL 10m)
        Dl-->>Svc: ScrapedPage (from_cache=false)
    end
    opt include market_widget
        Svc->>Dl: download widget by id from page links
    end
    Svc-->>Caller: list of ScrapedPage (parser input)
```

---

## 12. Owner answers (2026-10-04)

| # | Answer |
|---|--------|
| 1 | Automated access and caching of FútbolFantasy HTML is accepted. Editorial news text is still not republished verbatim. |
| 2 | `SCRAPER_CONTACT` comes from the environment. Local value: `andresherencia2000@gmail.com`. Not hardcoded. |
| 3 | Real HTML snapshots live outside git (`tmp/ff-fixtures/`, gitignored). Tests that need them skip when the directory is absent. |
| 4 | Current season only. |
| 5 | Club competitions only: Champions, Europa League, Conference League, Copa del Rey, Supercopa. |
| 6 | Label a widget row from pages already downloaded (date + score). Upcoming rows use one cached club page per team (`a.partido` + competition logo), not one request per player or per match. |
| 7 | Maintain `aliases.json`. After alias and team, an unresolved name is `player_not_found` or `player_ambiguous`, never a guessed page. |
| 20 | One container, one worker, scraper and parser together. |
| 21 | Profile TTL 10 min. Market widget TTL 5 min. |
| 22 | Download the market widget. The extra field is "puja máxima rentable". |
| 25 | Coverage 80 % until the package is on the pre-commit hook, then 90 %. |

`/stats/fixtures` defaults to the last 10 matches. `last` may be set from 1 to 60.

---

## Engineering standards

- **Standards (coding-style skill):** Python 3.14, PEP 8, black + ruff (100 columns), pyright
  `basic` (as `backend/api`), bandit in pre-commit and CI, pytest ≥ 80% coverage, uv only.
- **Typing and docs:** type hints on public APIs, constants and variables; Google docstrings
  (Args, Returns, Raises) on public classes and methods; one-line docstrings on private helpers;
  no comments in code (rationale lives in the plan or PR).
- **Practices:** Pydantic for all data structures; `logging` only (no `print`); context managers
  for HTTP clients, files and locks (`async with`); no mutable default arguments
  (`Field(default_factory=...)`); specific exception types; composition over inheritance; fewer
  lines preferred over abstraction.
- **Naming:** `CamelCase` classes, `snake_case` variables and functions, `UPPER_CASE` constants.
- **Review gate:** findings use the `LFB-NNN` prefix.

### CRS conformance

Already mapped in 3.2. Two rules are added: the private HTTP routes are the **controller** and
contain no `httpx`, URL building or cache access; `ScraperService` is the only caller of the
repositories (`LinkedDataProvider`, `PageDownloader`, `PageCache`) and never imports FastAPI.

---

## Cross-plan reconciliation

The three player-stats plans ([scraper](player-stats-scraper.md),
[parser](player-stats-parser.md), [endpoint](player-stats-endpoint.md)) were
drafted in parallel. Parser v1 (including `to_player_report`) is **done**;
scraper and API facade remain **todo**.

| # | Gap | Decision |
|---|-----|----------|
| R1 | Scraper returns HTML. Parser returns JSON. | `GET /internal/players/futbolfantasy` runs both and returns the merged JSON. The API does not parse HTML. Timeout 30 s. |
| R2 | Several HTML documents per player. | `ScrapedPage.kind` is `player`, `market_widget` or `competition`, with `season_slug`. The facade merges them. |
| R3 | Catalog fields `name`, `slug`, `team` are `null` in the live `GET /players` sample. | The API sends nickname plus team name (resolved from `teams-master`) as `player_name` and `team` query parameters; the scraper never receives a Fantasy `slug`. |
| R4 | Network: Compose `internal` is `internal: true` (no egress). | The scraping service joins `internal` and a new `egress` network; the API stays on `internal` only. |
| R5 | Coverage gate: plans say ≥80%, pre-commit enforces ≥90% for `auth` and `api`. | Use 80% in `backend/scraping` until it is added to pre-commit, then align to 90%. |
| R6 | Stat key names. | `snake_case` (`minutes_played`). Defined in the parser and copied in `fantasy_api/schemas/player_stats.py`. Not imported across packages. |
| R7 | Non-LaLiga stats. | FutbolFantasy competition pages only. |
| R8 | Markdown player summary. | `to_player_report` + `FantasySupplement` in the parser; caller passes Fantasy/OpenWeather/distance payloads (endpoint plan **CC-11**, **§1.5.4**). Scraper and parser never call LaLiga or OpenWeather. |

Implementation order of the three test suites:

1. **Parser tests.** **Largely done** (`backend/scraping/tests/parser/`). Pure functions. No network.
2. **Scraper tests.** `httpx.MockTransport`. Route resolution, competition slug selection, cache, rate limit. No live site in CI.
3. **Endpoint tests.** `MockTransport` for Fantasy and for `GET /internal/players/futbolfantasy`. Market JWT first, then fixtures (`last` 10, max 60).

The facade test (scraper HTML in, parser JSON out) sits between 1 and 2, still inside `backend/scraping`, before any API test calls that endpoint.
