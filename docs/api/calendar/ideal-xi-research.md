# Official Fantasy Ideal XI investigation

Verified with read-only public requests on **23 October 2026**. This document
investigates the official team of the matchweek, rather than a manager's saved
lineup or a prediction for the next round. No application routes were changed.

## Finding

The current Fantasy host exposes official Ideal XI membership in the public
individual player response:

```text
GET https://fantasy-api.llt-services.com/api/v1/competition/1/player/{playerId}
```

For example, [Mbappé's player response](https://fantasy-api.llt-services.com/api/v1/competition/1/player/3103)
returned **200 without an Authorization header**, including this week 9 entry
(other fields omitted):

```json
{
  "id": "3103",
  "nickname": "Mbappé",
  "positionId": 4,
  "playerStats": [
    {
      "weekNumber": 9,
      "totalPoints": 18,
      "isInIdealFormation": true
    }
  ]
}
```

Select the `playerStats` entry whose `weekNumber` matches the requested round,
then require `isInIdealFormation` to be explicitly `true`. A missing entry or
flag means unavailable evidence; it is not equivalent to `false`.

No dedicated bulk Ideal XI endpoint was verified. The official website currently
serves an app-download landing page; its inspected JavaScript bundle did not
provide a weekly Ideal XI request. This does not establish that a bulk endpoint
does not exist.

## Resolving the latest completed matchweek

Use the existing public calendar sources:

1. [Current week metadata](https://fantasy-api.llt-services.com/api/v1/competition/1/week/current)
   returned `weekNumber=10`, `previousWeek=9`, `nextWeek=11`, `isLive=false`.
2. [Week 10 fixtures](https://fantasy-api.llt-services.com/api/v1/competition/1/calendar?weekNumber=10)
   contained ten scheduled fixtures (`matchState=1`). Its opening time was
   23 October at 21:00 Europe/Madrid.
3. [Week 9 fixtures](https://fantasy-api.llt-services.com/api/v1/competition/1/calendar?weekNumber=9)
   contained ten finished fixtures (`matchState=7`). Its last match was on
   19 October at 21:00 Europe/Madrid.

Thus **week 9** was the latest completed round at verification time. A fixture
is one match; the Ideal XI belongs to the whole matchweek.

Do not always subtract one from `weekNumber`: the reported current round could
already be complete. Check current fixtures first, then the previous round and,
if necessary, earlier rounds. Completion requires all expected distinct fixtures
to be verified finished. `isLive=false`, past kickoff times, or a single finished
match do not establish completion. Postponements and missing fixtures must not
silently become a completed round. Week 1 can have no completed predecessor.

## Verified week 9 selection

Twenty leading candidate cards were checked, with at most two concurrent public
requests. Eleven reported `isInIdealFormation=true` for week 9. All twenty cards'
`totalPoints` agreed with their points in the public
[matchweek stats response](https://fantasy-api.llt-services.com/stats/v1/competition/1/stats/week/9).

| Master player ID | Player | Position | Points |
|---|---|---|---:|
| 2613 | M. Dituro | Goalkeeper | 14 |
| 2074 | Javi Rodríguez | Defender | 17 |
| 1775 | Cubarsí | Defender | 12 |
| 3206 | Maffeo | Defender | 12 |
| 3207 | P. Martínez | Midfielder | 15 |
| 1674 | Arda Güler | Midfielder | 14 |
| 3228 | Requena | Midfielder | 13 |
| 3103 | Mbappé | Forward | 18 |
| 3091 | Oyarzabal | Forward | 16 |
| 3104 | Lamine Yamal | Forward | 16 |
| 3143 | Diomande | Forward | 14 |

These eleven flags produce **3-3-4**, **161 points**, and Mbappé as the highest
scorer. Formation is derived from the returned positions; the player responses
do not return a formation identifier. Do not impose a fixed 4-3-3 or restrict
this global selection to a particular league's enabled formations.

Requena, Kubo and Bellingham each had 13 points. Requena's flag was `true`;
Kubo's and Bellingham's were explicitly `false`. This verifies that sorting
points alone does not reproduce the official selection's tie handling.

The candidate probe used minimum scores of 14 for goalkeepers, 10 for defenders,
12 for midfielders and 14 for forwards. It was not an exhaustive scan of all 864
catalog entries or all 474 entries in matchweek stats. These thresholds describe
this investigation only; they are not a production selection rule or proof that
no other player carries a conflicting flag.

## Fit with the current application

Existing routes already supply most of the supporting data:

| Existing application route | Use | Limitation |
|---|---|---|
| `GET /calendar/current` | Current and previous round pointers | Must verify completion against fixtures |
| `GET /calendar/weeks/{week}` | Fixture completion | Require the whole round to be complete |
| `GET /calendar/weeks/{week}/stats` | Candidate player IDs, positions, images and weekly points | No Ideal XI flag in the verified payload |
| `GET /players` | Public player catalog and weekly scores | No Ideal XI flag in the verified payload |
| `GET /teams/{team_id}/lineup/week/{week}` | A Fantasy manager's historical lineup | Does not represent the global Ideal XI |

The individual public `player/{id}` resource is **not currently proxied** by the
application. `PlayersRepository` currently exposes catalog, market-value and
authenticated league-card reads. Add a public detail repository method if this
source is integrated; do not require pairing solely for this public read.

`PlayerStatWeek` in `schemas/leagues.py` already models `week_number`,
`total_points` and `is_in_ideal_formation`. It can inform the new response model,
but the observed public detail envelope uses **`playerStats`**, whereas existing
roster `PlayerMaster` models **`lastStats`**. Do not assume those envelopes are
interchangeable. IDs here are master `playerId`, never `playerTeamId`.

## Recommended integration

Add an application aggregate in the calendar domain, for example
`GET /calendar/weeks/{week}/ideal-lineup`, with an optional latest-completed
convenience route. These are proposed application paths, not verified upstream
paths. Follow the existing calendar internal-JWT gate; upstream reads need no
LaLiga bearer according to the public probes.

Resolve the round, obtain its player pool, and read the matching per-player
official flags on the server. Keep request concurrency bounded and cache details
and completed selections by competition, season and week. A full scan is
potentially hundreds of calls, so it should not run on every browser render.
Ranking candidates can prioritize work, but an arbitrary score cutoff must not
be presented as proof of exhaustive membership. Prefer a verified bulk endpoint
if a later official-app network capture identifies one.

Return the selected week, eleven unique master IDs, positions, weekly points,
derived formation, total points, source and retrieval time. Exclude coach entries
(`positionId=5`) from the footballer XI. Validate each upstream shape and the
requested week explicitly. Missing flags, failed reads or an inconsistent player
count must remain an unavailable/incomplete result or sanitized upstream error;
never publish an empty or fabricated official XI. Fixture completion alone does
not prove that Fantasy has finished publishing its Ideal XI flags.

For an implementation, add meaningful transport and aggregate tests, CLI access,
and regenerate OpenAPI and endpoint schemas as required by repository guidance.

## Reproduce the decisive check

These requests need no Fantasy account or token:

```bash
curl -sS \
  https://fantasy-api.llt-services.com/api/v1/competition/1/week/current | jq

curl -sS \
  'https://fantasy-api.llt-services.com/api/v1/competition/1/calendar?weekNumber=9' \
  | jq '{matches: length, states: (map(.matchState) | unique)}'

curl -sS \
  https://fantasy-api.llt-services.com/api/v1/competition/1/player/3103 \
  | jq '.playerStats[] | select(.weekNumber == 9) |
        {weekNumber, totalPoints, isInIdealFormation}'
```

The example is a dated observation of the current-season API. Re-resolve the
week and season for future reads rather than hardcoding week 9.
