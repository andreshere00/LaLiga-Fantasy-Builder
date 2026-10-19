# Market screen improvements implementation plan

Status: implemented. Covers the nine requested market improvements. The new
**My bids** panel shows **current active bids only**, as confirmed by the user.

## Scope and existing implementation

The changes primarily belong in `frontend/src/features/market/`. Existing
responses already supply `numberOfBids`, listing-level `bid`, supplemental
`userBids`, `playerTeam.buyoutClause`, `isShielded`, and clause lock timestamps.
The Python market model and frontend Zod schema already declare the bid count.
No new endpoint is expected.

Relevant integration points:

- `useMarketBoard.ts` joins listings, catalog, balance, and seller rosters, and
  applies the existing short-lived pending-bid overlay.
- `model/listing.ts` reads listing and supplemental bids; `model/row.ts` already
  maps clause value, shield status, lock time, and the user's bid.
- `MarketToolbar.tsx` displays Balance and accepts the Offers widget.
- `offers/MarketOffers.tsx` provides the existing side-panel interaction pattern.
- `components/ui/RichList.css` supplies shared market/Players styling. A later
  `.market-name` rule overrides the earlier bold weight with `500`, and the FSYP
  primary value currently inherits its weight.
- `styles/design-system.css` rounds native buttons inside dialogs. Bid dialogs
  render through a portal, outside `.market-page`, so its square-button rule
  does not reach them.

## Requested behavior

| Issue | Implementation | Acceptance criterion |
|-------|----------------|----------------------|
| 1. Player bid count | Map nullable `numberOfBids` onto `MarketRow`; display a labeled count in the seller/options cell. | Zero renders as `Bids: 0`; absent/invalid values show unavailable, not zero. `numberOfOffers` is not added to bids. |
| 2. Projected spending and available money | Add **Projected spending** and **Projected available** beside Balance, derived from all distinct active bids in the selected league. | Totals ignore table filters, update after bid changes, and clearly state the assumption that all active bids succeed. Balance reservation semantics are handled as described below. |
| 3. FSYP emphasis | Set the primary score to `font-weight: 700` and approximately `16px`, up from the table's `14px`. | Main score is visibly larger and bold; season average and tooltip remain secondary and readable. |
| 4. Release clause value | Show `Release clause: <formatted euros>` in the seller/options cell for a known positive clause. | Value stays visible when shielded or locked; missing/non-applicable values show an explicit unavailable/not-applicable state. |
| 5. Square bidding buttons | Use shared `Button` with `shape="square"` for bid dialog actions; add a scoped bid-dialog class for native counter controls. | Confirm, Cancel, close, minus, and plus have zero corner radius in the portaled dialog, including disabled states. |
| 6. Bold player names | Apply a market-scoped `700` weight and make the nested name link inherit it. | Every market player name is bold, including linked names and names without a details route. |
| 7. Dark-mode shield | Make the seller-cell monochrome shield follow theme foreground color, using a scoped mask/currentColor treatment or the existing dark-theme icon treatment. | Shield is white in dark mode and dark in light mode; the separate red protection indicator retains its red color. |
| 8. Protected names in red | Derive protection from active shielding or a clause lock whose end is in the future; give the name and its link an explicit red status style. | Shielded and time-locked players are red and bold, including when the user has bid; expired locks revert unless shielding remains active. |
| 9. My bids panel | Add a count-bearing **My bids** trigger beside Offers, opening the same side/bottom sheet pattern. | All current active bids appear independently of table filters, with player, bid amount, expiry/status, and eligible modify/cancel actions. |

Keep count and clause details inside the existing seller/options cell instead
of adding table columns. This preserves the current responsive grid, skeleton,
and positional column-hiding rules. Allow the cell to grow vertically and check
that these details remain accessible at narrow widths.

## Delivery sequence

### 1. Normalize active bids and establish the money calculation

Add a pure active-bid normalizer under `model/` and derive its result once in
`useMarketBoard`. Merge listing-level `bid` with `userBids` from the existing
pending-adjusted snapshot. Deduplicate by real bid ID, reconciling synthetic
local IDs by listing identity during confirmation. Preserve player/master,
listing and squad-entry IDs separately; join display data from listings or
embedded metadata and the catalog.

The normalizer should retain bid amount, status, expiry, player identity,
listing reference, confirmation state, and data-quality information. Exclude
explicitly terminal or expired records using verified wire statuses. Preserve
supported listing-only snapshots when `userBids` is absent. Missing display
metadata must not hide a bid or remove its known amount from spending; show a
fallback label and disable unavailable actions. Conflicting amounts or an
unclassifiable record make totals incomplete rather than silently dropping it.

Use this same collection for the panel, total spending, and active-bid count
used by existing squad-cap checks. Avoid a second query, local copy of server
data, or separate arithmetic over filtered rows. Direct offers remain distinct
from market bids and must not be synthesized as active bids merely because an
offer submission succeeded.

**Money semantics are a prerequisite for an exact future balance.** Existing
documentation (`docs/api/lineup-builder.md`, Source gates) says gross/net
reservation accounting is unverified. The builder currently labels
`reported cash - distinct bid amounts` as a conservative lower bound. The market
must not present that calculation as an established exact balance.

During implementation, compare existing read-only money, league-summary and
market captures containing naturally pending bids; document the evidence in
the Teams/market frontend documentation. Do not create a transaction to obtain
evidence, or assume `teamInvestment` means pending spending.

Let `P` be the sum of distinct active bid amounts and `B` the reported balance:

- If evidence establishes that `B` is gross cash, projected available is `B - P`.
- If `B` is already net of these reservations, projected available is `B`;
  subtracting `P` again would count the same spending twice.
- Until semantics are established, display `B - P` as **Estimated available**
  with a clear conservative-estimate explanation, consistent with the builder.
  Do not label it an exact future balance.

Projected spending is `P` under the assumption that all active bids succeed.
Do not add expected sales, incoming offers, hypothetical clauses, or the
20%-of-squad-value borrowing allowance to projected cash. That allowance remains
part of existing bid eligibility. Unknown balance or incomplete commitments
produces an unavailable/incomplete projection, not a fabricated zero.

### 2. Implement row information and styling

Update `model/row.ts`, `cells/SellerCell.tsx`, `cells/PlayerCell.tsx`, and
`cells/FsypCell.tsx` as needed. Put the new market-only presentation rules in
`MarketPage.css`, with sufficient specificity to supersede shared rules without
restyling the Players screen.

Use a shared protection predicate based on `isShielded` and `clauseUnlockAt`
plus the existing `useNow` clock. An unknown lock time does not prove protection.
Protection color takes precedence over bid/name-link colors, including hover
and focus. Keep a textual tooltip/accessibility description such as
"Release clause protected" or "Release clause locked until …" so color is not
the only indication. Do not equate a lock with a paid shield or change the
existing clause-payment eligibility rules.

Format money with `formatEuro`. Use the appropriate unavailable or
not-applicable copy when a clause is unknown versus absent by listing type.
Show the protection/lock indicator next to the clause information without
removing the existing seller navigation or countdown.

In `actions/BidDialog.tsx`, use explicit square shared buttons and a
`market-bid-dialog` popup class. Override the inherited native-button radius
within that popup for `NumericCounterField`. Keep current validation, stepping,
pending disabling, labels, and focus behavior. This also covers the bid dialog's
direct-offer mode.

### 3. Add the spending summary and My bids sheet

Extend `MarketBoard` with normalized active bids, projection values, and data
availability flags. Extend `MarketToolbar` with the two summary values and the
My bids trigger, reusing `ValueBox` and the existing notification layout.
Wrap/stack the summary and controls on small screens without widening the page.
Keep the current negative-balance warning and explain negative projections
separately from the actual reported balance.

Create `bids/MarketBids.tsx` and scoped styles using the existing `Dialog`
with `layout="sheet"`. Reuse the Offers panel's visual conventions without
extracting a generic panel framework. Show:

- A square My bids trigger with the active count and an accessible name.
- Player name/photo when available, bid amount, seller when known, and time
  remaining or an explicit unavailable label. Sort by nearest known expiry,
  then stable listing/bid identity; unknown expiries follow known ones.
- A total matching Projected spending and a clear empty state for zero bids.
- Refresh, first-load, incomplete-data, and failed-refresh states. Keep usable
  cached rows visible when a background refresh fails and mark them stale.
- Modify and Cancel using the page's existing `useMarketActions` instance.
  Do not send writes for synthetic local IDs, missing authoritative identifiers,
  expired bids, or unconfirmed status. Rows with incomplete metadata remain
  visible. Refresh refetches the existing market and money reads.

Close the sheet before handing off to the existing modify dialog so two modal
focus traps do not compete. After dismissal, restore focus to a connected
trigger or suitable fallback. Preserve keyboard operation, Escape/backdrop
dismissal, and pending-action restrictions from the existing widgets. Reset
panel/dialog state on league change and prevent old-league rows or totals from
appearing in the new league.

### 4. Reconcile mutations across all market views

Reuse `model/pendingBids.ts`, `model/marketSnapshotPatch.ts`, and
`actions/useMarketActions.ts`. The same pending-adjusted snapshot must drive
row state, the My bids count/list, and spending, including stale responses
during the existing confirmation window.

For a known listing bid count, increment only when the user's bid changes from
absent to present, leave it unchanged on amount modification, and decrement
once on cancellation. Account for bids present only in `userBids`; reapplying an
overlay or receiving server confirmation must not apply the delta twice.
Unknown counts stay unknown. Reconcile rejected cancellations with server data
so rows, count, panel, and spending recover together.

Market and money responses can arrive at different times. Keep the projection
marked refreshing/stale until the relevant reads reconcile, especially if the
verified balance semantics include reservations. Never adjust authoritative
cash locally and then also subtract the same reservation in the projection.

### 5. Verify and document

Add focused unit/component coverage for the shared bid model, row mapping,
toolbar summary and panel behavior. Extend existing pending-bid and action
tests where synchronization changes. Cover duplicate listing/envelope bids,
listing-only payloads, supplemental bids without a visible listing, synthetic
ID confirmation, create/modify/cancel, failed cancellation, stale refetches,
zero/unknown counts, incomplete amounts, expired/terminal bids, negative and
unknown balances, and both verified reservation-accounting branches.

Add a mocked Playwright market scenario using `e2e/fixtures.ts` and a new
`e2e/market-bids.spec.ts`. Verify that filtering out a player does not change
spending or remove their bid from the panel; modifying/cancelling updates all
views without a reload; league switching isolates data; and the existing Offers
flow still works. Browser requests must stay on synthetic fixtures.

Use real-browser checks for square computed button corners, bold/larger FSYP,
bold/red linked player names, lock expiry, white dark-mode seller shield,
readable clause/count labels, keyboard focus, and responsive layout. Cover both
themes at the existing 375/800/1024/1440px sizes and a layout equivalent to 200%
zoom. Include a Players-screen regression check because of the shared CSS.
Do not add unit tests that merely duplicate CSS declarations.

Run from `frontend/`:

```bash
bun run lint
bun run build
bun run test
bun run test:browser -- e2e/market-bids.spec.ts e2e/market-offers.spec.ts e2e/design-system.spec.ts
```

Update `docs/frontend.md` with row details, projection semantics, and the My
bids lifecycle; refresh the market screenshots after implementation. If source
verification reveals a necessary API schema change, first follow the repository
API guides, add contract/route coverage, update the feature README, and regenerate
`backend/api/openapi.json` and `docs/api/endpoint-schemas.md` using the existing
generation tasks. These artifacts do not need regeneration for frontend-only
changes.

Deliver as three reviewable changes: shared bid/projection model; market row
and bid-dialog presentation; summary/My bids integration with browser checks
and documentation. Completion requires all nine acceptance criteria above;
an exact available-money claim additionally requires verified balance semantics.
