# Calendar API

Matchday calendar and stats proxied by `backend/api`. Controllers validate an
internal JWT, then call public Fantasy paths **without** a LaLiga bearer (no
`/internal/laliga/bearer`, no pairing requirement for these reads).

Upstream paths:

```text
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/week/current
{LALIGA_FANTASY_ORIGIN}/api/v1/competition/{LALIGA_COMPETITION_ID}/calendar?weekNumber={week}
{LALIGA_FANTASY_ORIGIN}/stats/v1/competition/{LALIGA_COMPETITION_ID}/stats/week/{week}
```

## Guides

- [Adding calendar endpoints](adding-calendar-endpoints.md) — extend the CRS
  stack and regenerate OpenAPI
- [OpenAPI / Swagger](../openapi.md) — schema and Swagger sync
- [Developing authenticated endpoints](../../authentication/developing-authenticated-endpoints.md)
  — internal JWT gate (calendar skips the LaLiga bearer hop)

## Routes

| Method | Path | Upstream | Response model |
|--------|------|----------|----------------|
| `GET` | `/calendar/current` | `{CMP}/week/current` | `CurrentWeek` |
| `GET` | `/calendar/weeks/{week}` | `{CMP}/calendar?weekNumber={week}` | `list[Fixture]` |
| `GET` | `/calendar/weeks/{week}/stats` | `{ORIGIN}/stats/v1/.../stats/week/{week}` | `list[MatchStats]` |

All require `Authorization: Bearer <internal JWT>`. Models live in
`fantasy_api.schemas.calendar` (`extra="allow"` for unknown upstream fields).

## Identifiers

| Id | Notes |
|----|--------|
| `week` | Matchweek number (`>= 1`). Upstream rejects `weekNumber=0` with `500`. |
| Fixture `id` | String in calendar fixtures. |
| Stats match `id` | Integer in stats payloads; not the same as fixture `id`. |
| `localId` / `visitorId` | Real club ids in fixtures, not fantasy manager `teamId`. |
| Stats player `id` | Master `playerId`; not `playerTeamId`. |

## Local try-out

```bash
curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/calendar/current

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/calendar/weeks/8

curl -sS -H "Authorization: Bearer ${INTERNAL_JWT}" \
  http://localhost:8001/calendar/weeks/8/stats
```

CLI:

```bash
cd backend/api
uv run fantasy-calendar --jwt "$INTERNAL_JWT"
uv run fantasy-calendar --week 5 --json
```

## Architecture

```text
api/calendar.py
  → services/calendar.py
    → repositories/calendar.py
      → clients/laliga_fantasy.py  # get_public_json (no Authorization)
```

Shared path helpers: `repositories/paths.py` (`competition_path`, `stats_week_path`).
