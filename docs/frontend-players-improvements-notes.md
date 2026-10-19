# Players screen improvement notes

Status: planned; documentation only. These notes adapt the applicable items
from the [market improvements plan](frontend-market-improvements-implementation-plan.md)
to the `/players` catalog screen. They do not describe completed UI changes.

## Applicable changes

| Original issue | Application to Players |
|----------------|------------------------|
| 1. Number of bids | For a player with a current market listing, display its `numberOfBids` beside the market actions. Show zero accurately; an absent/invalid count is unavailable. A player without a listing does not have a market bid count. |
| 3. Bold, larger FSYP | Use `700` weight and approximately `16px` for the primary score in the shared `FsypCell`. Keep the season average smaller and preserve the score tooltip. |
| 4. Release clause value | Show a known positive clause for league-owned players, including players who are not listed on the market. Keep the amount visible while locked or shielded. Distinguish unknown data from a free agent's non-applicable clause. |
| 5. Square bidding buttons | Apply the shared `BidDialog` fix when it is opened from Players: Confirm, Cancel, close, minus and plus all have square corners. Preserve the existing bid/direct-offer validation and pending states. |
| 6. Bold player names | Use `700` weight for the catalog name link and the plain-text coach name. Preserve the details link, wrapping and keyboard focus styling. |
| 7. Dark-mode shield | Any clause/protection indicator displayed with Players actions must use a white monochrome shield in dark mode and a dark one in light mode. Keep red protection indicators red. |
| 8. Protected names in red | Make shielded or currently clause-locked players' names red and bold. Cover league-owned players outside the market as well as listed players, and retain a textual protection explanation. |

The market toolbar's projected spending/available money (issue 2) and new
My bids panel (issue 9) remain in the market plan. The Players catalog currently
has a search toolbar and no balance or visible Offers trigger; these notes do
not propose adding those toolbar widgets. Shared bid state and mutation fixes
still apply when a bid is placed, modified or cancelled from Players. The
confirmed My bids scope remains current active bids only.

## Existing integration points

- `frontend/src/features/players/PlayersPage.tsx` renders `PlayersListRow`, uses
  the shared `FsypCell`, `MarketActionMenu` and `MarketActionDialogs`, and joins
  current listings by master player ID through `useMarketBoard`.
- `frontend/src/features/players/model/playerRow.ts` currently retains player
  and owner information, but not squad-entry ID, clause value, shielding or
  clause lock timestamps.
- `frontend/src/features/players/usePlayersBoard.ts` already fetches league
  teams and their rosters. Reuse those responses for clause/protection metadata.
- `frontend/src/features/players/PlayersPage.css` and the shared
  `frontend/src/components/ui/RichList.css` control names, table layout and
  responsive visibility. The shared name rule currently ends at weight `500`.
- `frontend/src/features/market/actions/BidDialog.tsx` renders through a portal.
  The square-corner fix must reach the dialog itself, rather than depending on
  a `.players-page` ancestor.

## Implementation notes

1. **Retain league-specific clause metadata.** Extend the roster-to-catalog
   join to preserve `playerTeamId`, `buyoutClause`, `isShielded` and the parsed
   clause unlock time. Keep master `playerId`, squad-entry `playerTeamId` and
   `marketId` distinct. Collect metadata independently of whether a manager
   display name is present, so a sparse owner label does not discard a known
   clause. Preserve unknown shielding/lock data instead of treating missing
   fields as proof that a player is unprotected.

2. **Use the correct sources.** League roster entries supply clause and
   protection data for owned catalog players, including unlisted players.
   Current market listings supply listing IDs and bid counts. Where both
   sources overlap, match the selected league and squad-entry identity and use
   a consistent freshness policy; do not carry a previous owner's clause onto
   a new squad entry. A market-read failure must not hide the catalog or
   fabricate zero bids. Reuse existing cached reads without adding a request
   for every catalog row.

3. **Share protection behavior.** Reuse the market plan's protection predicate:
   `isShielded === true` or a known clause unlock time later than `now`. Feed it
   from the existing `useNow` clock so an expired lock stops coloring the name
   without a page reload, unless shielding remains active. Unknown lock time
   alone does not prove protection. Keep lock and shield explanations distinct,
   and preserve existing eligibility checks for market actions.

4. **Apply typography and color deliberately.** Scope Players name rules under
   `.players-page`; make linked names honor the protected state on rest, hover
   and focus. Protection red takes precedence over ordinary link or bid-state
   color. Preserve a visible focus outline and a readable tooltip/accessibility
   label so color is not the only indication. The shared FSYP change may serve
   both screens, but must retain the secondary average and keyboard-accessible
   tooltip. Coordinate with the market implementation to avoid competing CSS
   overrides.

5. **Keep the current table structure.** Add compact clause and, when listed,
   bid-count details inside the existing Actions cell, grouped separately from
   the action/bookmark controls. Allow the cell to grow vertically. Do not add
   columns or move details into the owner cell, which is hidden on smaller
   layouts. Preserve the current <=800px photo/name/team/actions layout and
   its existing FSYP visibility rule; new information must not widen the page
   or make controls unusable.

6. **Reuse dialog and mutation fixes.** Use the shared square-button bid-dialog
   implementation and the existing pending-bid overlay. Listing counts must
   reflect create/cancel once and stay unchanged when only an amount changes.
   Stale refetches and rejected mutations must reconcile counts and actions
   consistently with Market. Preserve favorites, pagination, URL filters,
   return navigation, own-squad sale actions and the existing player-specific
   Offers flow.

## Verification and delivery

Add focused roster-mapping and component coverage for owned-but-unlisted
players, free agents, missing clause metadata, unknown and zero bid counts,
shielded players, timed locks, lock expiry, and changes of league/ownership.
Reuse the shared bid-model and dialog tests from the market work rather than
duplicating them.

Extend browser coverage for the Players route with synthetic roster and market
responses. Check both themes, linked and plain names, computed font emphasis,
red protection state, readable shield icons and clause values, square portaled
dialog controls, and keyboard focus. Check the existing 375/800/1024/1440px
layouts and a layout equivalent to 200% zoom. Verify that filtering, pagination,
favorites and player-specific Offers still work, and that Market presentation
remains consistent. Use browser layout checks instead of unit tests that only
repeat CSS declarations.

Run frontend lint, production build, relevant Vitest suites, and the affected
Playwright scenarios. Update the Players section of `docs/frontend.md` and its
screenshots after implementation. Existing response fields should be sufficient;
if an API schema change becomes necessary, follow the repository's API guides
and schema-generation requirements.

Deliver the shared score/dialog changes with the market work, then the Players
roster metadata and presentation changes, followed by browser verification and
product documentation. Completion means the applicable rows above work for
the full catalog, including players who are not currently on the market.
