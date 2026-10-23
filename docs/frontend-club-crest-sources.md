# Club and competition badge sources

Updated 23 October 2026.

## Resolution and loading

The shared `clubMedia` resolver expands fixture codes (including `CEL` and `MLG`)
and exact club aliases before lookup. It keeps published API images, the Fantasy
catalog snapshot, scraped images and curated local football-logos.cc images as
an ordered candidate list. `BadgeImage` advances on image failure, tries each URL
once and resets when its candidates change. Names remain visible if every image
fails. Unknown or ambiguous identities, such as a bare `Salamanca`, are not
assigned another club's badge.

The scraper reads calendar rival and competition images, preferring `data-src`
over lazy-load placeholder `src` (`0.png`). It extracts the player's own badge
from the header image URL rather than its alt text. Home/away images are assigned
only when the player's side is known. Calendar images are shared with matching
season fixtures; API fixture, recent and upcoming responses preserve optional
`home_badge`, `away_badge`, `opponent_badge` and `competition_badge` fields.
Older scrape caches may lack those fields; catalog and local fallbacks still work.

## Curated local fallback assets

54 PNG images cover 40 catalog clubs, eight additional opponents (including
Liverpool, Celtic, Juventus and Santa Clara), and six competitions: LaLiga,
Champions League, Europa League, Conference League, Copa del Rey and Supercopa.
Reserve clubs with ambiguous identities are deliberately excluded.

- Source identities and aliases: `assets/football_logo_sources.json`.
- Exact published download URLs, SHA-256 hashes, dates and local paths:
  `frontend/src/api/footballLogoFallbacks.json`.
- Images: `frontend/public/badges/football-logos/`.
- Refresh: `python3 scripts/sync-football-logos.py` from the repository root.

The script discovers fingerprinted image URLs in the provider's actual HTML,
uses its public download headers and validates PNG signatures and size before
installation. It does not invent CDN paths. Local delivery avoids relying on
third-party hotlink availability during application use. Review source identity
and alias changes before refreshing. Add an exact verified provider page for a
new club rather than using fuzzy matching.

Verified examples: [Celta](https://football-logos.cc/spain/celta/),
[Málaga](https://football-logos.cc/spain/malaga/),
[Liverpool](https://football-logos.cc/england/liverpool/),
[Champions League](https://football-logos.cc/tournaments/uefa-champions-league/).

## Attribution

The application footer credits and links to football-logos.cc, as requested on
their download pages. Logos remain owned by the clubs and organizations; consult
the provider's [usage disclaimer](https://football-logos.cc/license/) for use terms.
