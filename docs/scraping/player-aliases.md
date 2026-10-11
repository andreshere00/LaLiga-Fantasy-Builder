# Player aliases

## Reviewed catalog

The 2026-10-11 public Fantasy catalog snapshot contains 854 records: **829
footballers** and **25 coaches**. Coaches (`positionId=5`) are excluded from the
footballer inventory. The catalog publishes nicknames, so full names come from
FutbolFantasy profiles and, where needed, official club publications. Every
identity includes its source URLs.

| File | Purpose |
|------|---------|
| `backend/scraping/src/fantasy_scraping/scraper/data/player_names.json` | Reviewed IDs, nicknames, available full names, profile routes and source provenance |
| `backend/scraping/scripts/generate_player_aliases.py` | Offline normalization of the reviewed inventory |

826 footballers have confirmed profile routes. Three have published identities
but no confirmed FutbolFantasy route: Mario Nájera (`2970`), Albert García
(`3278`), and Yakiv Kinareikin (`3280`). Their name variants remain in the
grouped registry with `slug: null`; their ID entries in the in-memory index are
empty lists. Requests with those IDs return `player_not_found` instead of falling
back to a different person.
Revisit these entries when the source adds profiles.

## Runtime index

At service startup, each master player ID is compiled from the reviewed inventory
into `full_name`, `slug`, `team_id`, `team`, and normalized aliases. Missing full
names, teams, or source routes remain `null`. Team IDs identify Fantasy clubs,
not league managers' squads or squad entries.

Example with an abbreviated alias list (the generated record contains all variants):

```json
{
  "2614": {
    "full_name": "Carlos Romero Serrano",
    "slug": "carlos-romero",
    "team_id": "20",
    "team": "Villarreal CF",
    "aliases": ["c-romero", "carlos", "carlos-romero", "romero"]
  }
}
```

The loader derives aliases from the reviewed identity fields and validates record
fields, source route shapes, normalized aliases and
numeric master IDs before building a reverse name index. Malformed records fail
loading rather than silently changing the lookup behavior.

The in-memory index supports constant-time ID and name lookups without scanning
the grouped file per request. A shared alias retains all matching source routes.
The resolver's interface is unchanged: it consumes this compiled index, including
explicit unavailable IDs. Team fields describe the reviewed catalog snapshot;
they do not replace live profile club verification, since transfers can make a
snapshot stale.

## Name patterns

For the published name **Pablo Fornals Malla**, the generated aliases include:

| Requested pattern | Example | Normalized key |
|-------------------|---------|----------------|
| Nickname | Fornals | `fornals` |
| Given name | Pablo | `pablo` |
| Given name + surname | Pablo Fornals | `pablo-fornals` |
| Surname | Fornals | `fornals` |
| Given-name initial + surname | P. Fornals | `p-fornals` |
| Given name + surname initial | Pablo F. | `pablo-f` |
| Given name + both surnames | Pablo Fornals Malla | `pablo-fornals-malla` |
| Given name + both surname initials | Pablo F. M. | `pablo-f-m` |

Compound given names and surname particles are retained. For example, José María
Giménez de Vargas supports `jose-maria-gimenez`, `jm-gimenez`, `j-m-gimenez`, and
`jose-g-v`. Initial forms also allow the particle's first letter (`jose-g-d`).
`de` is not indexed as a standalone surname. Both published display
names and full personal names contribute variants, because the source does not
label given-name/surname boundaries separately.

Accents, case, spaces and periods normalize consistently. `I.Vidal`, `I. Vidal`
and `i vidal` therefore use the same key. Apostrophes are folded without splitting
names such as N'Golo. Published player routes with a leading or trailing dash are
preserved; other path validation and the scraper host allow-list remain enforced.

Some profiles publish only a nickname, a partial name, one surname, or a full name
in a non-Latin script. Generate variants from the available Latin display name
without inventing a surname, patronymic or transliteration. This limits the
two-surname patterns for those players.

## Resolution and collisions

1. A Fantasy **master player ID** selects its reviewed route. Never use a squad
   entry's `playerTeamId` here.
2. Name aliases resolve before fuzzy matching. At startup, a unique alias maps to
   one slug in memory; shared aliases map to every distinct slug in a sorted list.
3. A supplied full name narrows a shared nickname. When ambiguity remains, the
   existing club verification is used. Multiple same-club matches remain
   ambiguous. Groups above the five-profile probe limit remain ambiguous.
4. Names absent from the reviewed index retain the existing sitemap distance
   fallback. Explicit unavailable IDs never use this fallback.

Club hints continue to be checked for alias routes. Transfers and missing club
metadata can still cause an ambiguous result. Finding a person's profile does
not prove that a requested competition/season has statistics.

## Maintenance

1. Compare the public competition player catalog with the identity inventory.
   Include all footballer positions (`1`–`4`), including reserve and out-of-league
   entries; exclude coaches.
2. Resolve new identities against the player sitemap and club **squad** pages
   (`/laliga/equipos/{club}/plantilla`), which include more reserves than calendar
   pages. Use the existing guarded HTTP client for source downloads.
3. Review full names, positions and namesakes. A matching surname or current club
   alone is insufficient proof. Record source URLs. Keep `slug: null` with
   `route_status: "source_not_found"` when no route is confirmed.
4. Update reviewed names, teams and routes in `player_names.json`.
5. Regenerate offline:

   ```bash
   cd backend/scraping
   uv run python scripts/generate_player_aliases.py
   ```

6. Review and commit the inventory. Restart the scraping process to load the
   new aliases and clear its in-memory route cache.

The generator rejects duplicate IDs, invalid ID keys and invalid route
slugs. It preserves collisions and produces deterministic output. No LaLiga
bearer or personal session data is needed to regenerate the index.

Club verification prefers an exact sitemap club slug (or its configured canonical
alias) before trying partial token matches. This keeps a first team such as Real
Sociedad distinct from Real Sociedad B when resolving player profiles. Diacritics
in names such as Luka Sučić are normalized to ASCII slugs (`luka-sucic`).
