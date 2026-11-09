# Clubs API

Read-only dossiers for the 20 current LaLiga clubs. Manager squads stay on
[Teams](../teams/README.md). This domain does not bid, pay a clause, or save a
lineup.

## Routes

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/clubs` | Internal JWT | `ClubIndex` |
| `GET` | `/clubs/{club_id}` | Internal JWT | `ClubDossier` |
| `GET` | `/clubs/{club_id}/roster-stats` | Internal JWT | `RosterStats` |

`club_id` is the public teams-master id. No LaLiga bearer is exchanged.
Catalog, calendar, and teams-master reads stay public upstream. Predicted XI,
injuries, and news come from the scraping service.

A failed section is omitted and named in `segmentErrors`. Authentication
failures stay 401. An unknown club stays 404. Unexpected JSON stays 502.
Responses do not include HTML, tokens, or upstream bodies.

## Sections

| Segment | Source |
|---------|--------|
| `roster` | Public player catalog grouped by real `teamId`. Coaches (`positionId` 5) are excluded. MVPs are the top three footballers by published season points, then name, then id. |
| `performance` | Finalized LaLiga fixtures (`matchState` 7), plus other competitions from the parsed club page. The next match is the soonest unfinished LaLiga kickoff and stays out of the record. |
| `prediction` | Scraped coach, starters, and alternatives. |
| `injuries` | Scraped injury cards. `published` is false when the page has no injury block. |
| `news` | Five newest scraped headlines and article links. |

## Roster season totals

The public Fantasy catalog carries no `lastStats`, so the dossier's own
`roster.players[].stats` is blank in practice. `GET /clubs/{club_id}/roster-stats`
fills the squad table instead: for each non-coach squad member it reads the
FutbolFantasy profile through the shared `ScrapedPlayerProvider` (single-flight
cache, bounded concurrency, 15-minute TTL) and returns **LaLiga season totals**:
minutes, goals, assists, dribbles (`successfulDribbles`), penalties committed,
penalties saved (goalkeeper block), shots (the denominator of the published
shots-on-target ratio), recoveries (`ballSteals`), saves, balls lost
(`possessionsLost`), and yellow and red cards.

- A count the page does not publish is `null`, never zero. `totals` sums only
  published counts per column.
- A footballer whose profile cannot be read is `available: false` with null
  counts; `coverage` reports requested, read, and unavailable. One failed profile
  does not fail the response. A catalog failure returns the sanitised 5xx.
- It is a separate route so the dossier stays fast. The first read of a club
  issues one scrape per player (about 26 seconds for a 43-player squad on a cold
  cache at a concurrency of four), then repeats within the TTL are cached.

MVP form, starter likelihood, and radar stay on
`GET /players/{id}/stats/profile` and `GET /players/{id}/stats/radar`.

## CLI

```bash
uv run fantasy-clubs
uv run fantasy-clubs 20
```

The command is read-only.
