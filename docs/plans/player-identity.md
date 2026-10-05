# Plan: player identity (master vs squad-entry id)

Status: **proposed**

Decision date: **2026-10-05**

LaLiga Fantasy exposes two ids for the same footballer. The catalog master id
(`CatalogPlayer.id`, documented as `playerId` in
[Players API](../api/players/README.md)) drives public reads and
`/players/{id}/stats/*`. The squad-entry id (`playerTeamId` on roster and market
payloads) keys lineup slots and most league-scoped mutations. Upstream JSON often
names the field `playerId` while requiring `playerTeamId` (see
[Market API](../api/market/README.md) and [Buyout API](../api/buyout/README.md)).

The future Players screen links with the master id only
([players-url-filters.md](players-url-filters.md)). Mixing ids in the frontend
breaks listings, direct offers, immediate sales, and buyout pay.

This plan is **frontend-first**. It does not merge ids on the backend, change
Fantasy upstream, or persist an id map in a database.

---

## 1. Goal and non-goals

### 1.1 Goal

Make the two ids explicit in TypeScript, carry both on squad and market view
models, route navigation and stats reads on the master id only, and funnel every
Fantasy mutation that sends JSON `playerId` through one helper so the value is
always the squad-entry id.

### 1.2 In scope

| Item | Section |
|------|---------|
| Branded types `MasterPlayerId`, `SquadPlayerId` | §3 |
| `SquadCard`, `LineupSlotView`, `MarketRow` identity fields | §4 |
| `squadCards` / `slotView` populate master id | §4 |
| `upstreamPlayerIdBody` and call sites | §5 |
| Buyout pay path uses `SquadPlayerId` (URL segment) | §5 |
| Hide player-detail links without master id | §6 |
| Vitest coverage | §7 |
| `docs/frontend.md` cross-link | §8 |

### 1.3 Non-goals

- Changing LaLiga upstream or API path id semantics (already documented).
- A new aggregate id, server-side id merge, or DB-backed id map.
- Backend schema or route changes (`fantasy_api` already documents both ids).
- Migrating lineup draft field names in one shot (see §4.3); behaviour stays
  squad-entry keyed for `PUT /teams/{id}/lineup`.
- Market URL filter sync ([players-url-filters.md](players-url-filters.md) §8).

---

## 2. Identifier contract (decision)

| Use case | Id type | Where |
|----------|---------|--------|
| Browser path `/players/:playerId` | Master | Route param only |
| `GET /players`, `/players/{id}/market-value`, `/players/{id}/stats/*` | Master | `frontend/src/api/client.ts` paths |
| Lineup slot values, captain, pitch pick, squad map keys | Squad-entry | Roster `playerTeamId` |
| Market bid on listing (`POST …/bids`) | N/A (no `playerId` body) | `useMarketActions.ts` |
| Direct offer, listing, immediate sale JSON | Squad-entry as key `playerId` | §5 |
| Buyout pay | Squad-entry in **path** | `paths.buyoutPay` |
| Buyout increase | Squad-entry in **path** (when wired) | Same pattern as pay |
| Shield activation (future) | Squad-entry as key `playerId` | Same helper as §5 |

Authoritative repo note: `AGENTS.md` — `playerTeamId` is not interchangeable with
master `playerId`; several upstream bodies name `playerId` and expect the
squad-entry id.

---

## 3. Branded types

**New file:** `frontend/src/api/ids.ts`

Use opaque string brands (no class hierarchy):

```typescript
export type MasterPlayerId = string & { readonly __masterPlayerId: unique symbol };
export type SquadPlayerId = string & { readonly __squadPlayerId: unique symbol };
```

Provide narrow parsers used at API boundaries and mappers (return `null` when
input is empty):

- `parseMasterPlayerId(raw: unknown): MasterPlayerId | null` — digits/string from
  catalog `id`, `playerMaster.id`, `masterIdOf`, calendar stats player `id`.
- `parseSquadPlayerId(raw: unknown): SquadPlayerId | null` — from roster
  `playerTeamId`, market `playerTeam.playerTeamId`, `SquadCard.id`.

Optional ergonomics (same file):

- `masterPlayerIdFromSquadCard(card: SquadCard): MasterPlayerId | null`
- `squadPlayerIdFromSquadCard(card: SquadCard): SquadPlayerId` — `card.id`
  after §4.1 typing.

Do **not** cast between brands with `as`. Parsing functions are the only
constructors.

Update `frontend/src/api/client.ts` path builders to accept `MasterPlayerId` for
catalog reads (`playerMarketValue`, future `playerStatsDetail`, etc.) and
`SquadPlayerId` for `buyoutPay(leagueId, playerTeamId)`.

---

## 4. View models carry both ids

### 4.1 `SquadCard` (`frontend/src/api/mappers.ts`)

**Today:** `id` is the squad-entry id from `idText(record?.playerTeamId)` in
`squadCards`; `masterPlayerIdsFromTeam` reads master ids separately but
`squadCards` drops `idText(master?.id)` after computing fixture scores.

**Change:**

| Field | Type | Meaning |
|-------|------|---------|
| `id` | `SquadPlayerId` (or string during migration) | Squad-entry id; map key, sales, lineup |
| `masterPlayerId` | `MasterPlayerId \| null` | Catalog / stats / detail links |

Populate `masterPlayerId` in `squadCards` from `master?.id` (same source as
`masterPlayerIdsFromTeam`). Use `masterIdFromLineupSlot` in `slotView` and pass
through `enrichSquadMapFromLineup` when merging lineup-only rows.

**Call sites to update** (use squad id for mutations, master for links):

- `frontend/src/features/lineup/SquadPlayerActions.tsx` — listing payloads
  already pass `player.id` as squad id; switch to `upstreamPlayerIdBody` (§5).
- `frontend/src/features/lineup/useLineupBoard.ts` — squad maps keyed by squad
  id; market-value queries already use `masterPlayerIdsFromTeam` (master id).
- `frontend/src/features/lineup/lineupDraft.ts` — `PitchSelection.playerId` remains
  squad-entry semantics; document in a one-line comment. Rename to
  `squadPlayerId` is a follow-up to avoid a large mechanical diff.

### 4.2 `LineupSlotView`

Add optional `masterPlayerId: MasterPlayerId | null` in `slotView`, parsed from
`masterIdFromLineupSlot`. Keep `id` as squad-entry for pitch UI parity with
`SquadCard.id`.

### 4.3 `MarketRow` (`frontend/src/features/market/model/row.ts`)

**Today:** `playerId` is already the master id (`masterIdOf(item)`);
`playerTeamId` is squad-entry. Align naming with §3:

| Field | Type after change |
|-------|-------------------|
| `masterPlayerId` | `MasterPlayerId \| null` (rename from `playerId`) |
| `playerTeamId` | `SquadPlayerId \| null` |

Update consumers: `useMarketBoard.ts` (history keys), `marketFilters.ts`,
`marketSearch.ts`, tests under `frontend/src/features/market/`.

---

## 5. Single mutation helper (`playerId` → squad-entry)

**New file:** `frontend/src/api/mutationBodies.ts`

```typescript
/** Fantasy JSON uses key ``playerId`` for the squad-entry id, not the catalog id. */
export function upstreamPlayerIdBody(
  squadPlayerId: SquadPlayerId,
): { playerId: string } {
  return { playerId: squadPlayerId as string };
}
```

Spread extra fields at call sites; do not add listing-specific variants.

### 5.1 Required call sites (replace inline `{ playerId: … }`)

| File | Mutation | Current body |
|------|----------|--------------|
| `frontend/src/features/market/actions/useMarketActions.ts` | `createBid` when `usesDirectOfferBid(row, kind)` | `{ playerId: row.playerTeamId, money }` |
| `frontend/src/features/lineup/useSquadSales.ts` | `listPlayer` | `{ playerId: input.playerTeamId, salePrice }` |
| `frontend/src/features/lineup/useSquadSales.ts` | `modifyListing` (re-list `postJson`) | `{ playerId: input.playerTeamId, salePrice }` |
| `frontend/src/features/lineup/useSquadSales.ts` | `sellImmediately` | `{ playerId: playerTeamId }` |

**Not** using this helper (no `playerId` in body):

- `useMarketActions.ts` — `createBid` / `modifyBid` / `cancelBid` on market bids
  (`{ money }` only).
- `useMarketActions.ts` — `payClause`: `postJson(paths.buyoutPay(leagueKey,
  playerTeamId), …, { buyoutClauseToPay })` — pass `parseSquadPlayerId(row.playerTeamId)`
  into `paths.buyoutPay`; body unchanged.

**Future:** shield `PUT /buyout/.../shield` — build body with
`{ ...upstreamPlayerIdBody(squadId), rewardedAdType, rewardedAd }`.

### 5.2 Guardrails

- ESLint or a simple grep check in CI docs: forbid `playerId:` in feature code
  outside `mutationBodies.ts` (optional follow-up).
- Type `useSquadSales` inputs as `{ squadPlayerId: SquadPlayerId; … }` instead
  of `playerTeamId: string` when touching those mutations.

---

## 6. Navigation and player-detail links

### 6.1 URL rule

- List and detail routes use **master** id only
  ([players-url-filters.md](players-url-filters.md) §1).
- Never put `playerTeamId` in `/players/:playerId` or stats client paths.

### 6.2 When to show links

Render a link to `/players/${encodeURIComponent(masterId)}` (and later stats
fetch via master id) **only when** `masterPlayerId != null`.

**Hide** the control (no dead link, no fallback to squad id) when:

- Roster row lacks `playerMaster.id` (corrupt or partial payload).
- Market row lacks `masterIdOf` result after catalog join.

**Locations to wire when UI adds detail entry points:**

- Future `frontend/src/features/players/PlayersPage.tsx` — catalog row always
  has master `id`.
- Market table row name / avatar (master from `MarketRow.masterPlayerId`).
- Lineup squad panel (`SquadCard.masterPlayerId`).
- Do not link from lineup empty slots or placeholder `player-${index}` ids.

### 6.3 Reads already correct

- `useMarketBoard.ts` — `playerIds` for market-value history must stay master
  ids from listings (`masterIdOf`), not `playerTeamId`.
- `useLineupBoard.ts` — `squadMasterIds` via `masterPlayerIdsFromTeam` is
  correct; do not substitute `SquadCard.id`.

When `GET /players/{id}/stats/detail` is consumed, add
`paths.playerStatsDetail(masterId: MasterPlayerId)` in `client.ts` only.

---

## 7. Tests

Follow repo conventions: `{method}_{state}_{behavior}`, Arrange-Act-Assert, and
section banners:

```text
# ---- Mocks, fixtures & helpers ---- #
# ---- Happy path ---- #
# ---- Error paths ---- #
# ---- Edge cases ---- #
```

### 7.1 New / extended files

| File | Focus |
|------|--------|
| `frontend/src/api/ids.test.ts` | `parseMasterPlayerId` / `parseSquadPlayerId` reject empty |
| `frontend/src/api/mutationBodies.test.ts` | `upstreamPlayerIdBody` returns squad id under `playerId` |
| `frontend/src/api/mappers.test.ts` | `squadCards` sets `masterPlayerId`; `slotView` propagates |
| `frontend/src/features/market/marketRows.test.ts` | Row keeps distinct master vs squad ids |
| `frontend/src/features/market/actions/marketActions.test.ts` | Direct-offer payload uses helper (mock `postJson`) |
| `frontend/src/features/lineup/useSquadSales.test.ts` (new if missing) | Listing / immediate sale bodies |

Example names:

- `upstreamPlayerIdBody_squadId_mapsToPlayerIdKey`
- `squadCards_rosterWithMaster_setsMasterPlayerId`
- `squadCards_rosterWithoutMaster_leavesMasterPlayerIdNull`
- `marketRow_listingWithBothIds_exposesMasterAndSquad`

---

## 8. Documentation

- Add a short **Player identity** subsection to `docs/frontend.md` (routes table
  footnote): master id in URLs and stats; squad id for lineup and mutations;
  link to this plan.
- Cross-link from [players-url-filters.md](players-url-filters.md) §1 and
  [player-detail-endpoint.md](player-detail-endpoint.md) §2 (path id).
- No change required to backend OpenAPI for identity; optional comment in
  `docs/api/players/README.md` pointing frontend devs here.

---

## 9. Implementation order

1. Add `ids.ts` + parsers; extend `client.ts` signatures (types only at first).
2. Add `mutationBodies.ts` + tests; refactor the four call sites in §5.1.
3. Extend `SquadCard` / `squadCards` / `slotView` / `enrichSquadMapFromLineup`.
4. Rename `MarketRow.playerId` → `masterPlayerId`; fix market feature imports.
5. Add detail-link visibility helpers (e.g. `playerDetailPath(masterId)` returning
   `null` when missing); use in new Players UI and existing surfaces as they gain
   links.
6. Run `cd frontend && npm test` (or project test script).

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Dev assumes `SquadCard.id` is catalog id | Branded `SquadPlayerId`; explicit `masterPlayerId` field |
| Direct offer sends master id | Single `upstreamPlayerIdBody`; test in market actions |
| Partial roster without `playerMaster` | Hide detail link; mutations still use squad id |
| Large rename of `PitchSelection.playerId` | Defer; comment that value is squad-entry |

---

## 11. Acceptance criteria

- All `/players/*` client paths and future detail links use `MasterPlayerId` only.
- Every JSON body with Fantasy field `playerId` is built via `upstreamPlayerIdBody`.
- `SquadCard` and `MarketRow` expose both ids; neither overloads one field for both.
- Buyout pay and future buyout path segments use `SquadPlayerId`, not master id.
- Tests in §7 pass; no application code sends master id as mutation `playerId`.
