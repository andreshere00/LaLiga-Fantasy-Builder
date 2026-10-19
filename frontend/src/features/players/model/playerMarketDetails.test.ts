import { describe, expect, it } from "vitest";
import { marketRow } from "../../market/model/row";
import { protectionDescription } from "../../market/model/protection";
import { matchingPlayerListing, playerClauseDetails } from "./playerMarketDetails";
import { ownerByMasterIdFromRosters, playerRowFromCatalog, type PlayerOwner } from "./playerRow";

const owner: PlayerOwner = {
  name: "Owner", teamId: "team", playerTeamId: "entry", buyoutClause: 100,
  isShielded: false, clauseUnlockAt: null,
};
const catalogRow = (ownership: PlayerOwner | null = owner, label = "Owner") =>
  playerRowFromCatalog({ nickname: "Player" }, "master", label, ownership?.teamId ?? null,
    undefined, ownership);
const listing = () => marketRow({ id: "listing", playerMaster: { id: "master" },
  playerTeam: { playerTeamId: "entry", teamId: "team", buyoutClause: 200, isShielded: true },
  sellerTeam: { id: "team", manager: { managerName: "Owner" } },
}, 0, { catalog: new Map(), history: new Map() });

describe("catalog roster metadata", () => {
  it("should retain unlisted ownership and protection without a manager name", () => {
    const owners = ownerByMasterIdFromRosters([{ id: "team", players: [
      { playerTeamId: "entry", playerMaster: { id: "master" }, buyoutClause: 100,
        isShielded: true, buyoutClauseLockedEndTime: "2026-10-12T13:00:00Z" },
    ] }]);
    expect(owners.get("master")).toEqual({ name: null, teamId: "team", playerTeamId: "entry",
      buyoutClause: 100, isShielded: true, clauseUnlockAt: Date.parse("2026-10-12T13:00:00Z") });
  });

  it("should distinguish absent protection metadata from known false", () => {
    const owners = ownerByMasterIdFromRosters([{ id: "team", players: [
      { id: "unknown", playerMaster: { id: "1" } },
      { id: "known", playerMaster: { id: "2" }, isShielded: false },
    ] }]);
    expect(owners.get("1")).toMatchObject({ playerTeamId: "unknown", buyoutClause: null,
      isShielded: null, clauseUnlockAt: null });
    expect(owners.get("2")?.isShielded).toBe(false);
  });

  it("should replace stale team snapshots without carrying clauses onto new entries", () => {
    const owners = ownerByMasterIdFromRosters([
      { id: "team", players: [
        { id: "old", playerMaster: { id: "master" }, buyoutClause: 500, isShielded: true },
        { id: "removed", playerMaster: { id: "removed-master" } },
      ] },
      { id: "team", players: [{ id: "new", playerMaster: { id: "master" } }] },
    ]);
    expect(owners.get("master")).toMatchObject({ playerTeamId: "new", buyoutClause: null,
      isShielded: null });
    expect(owners.has("removed-master")).toBe(false);
  });

  it("should discard previous-owner metadata when a player moves to another team", () => {
    const owners = ownerByMasterIdFromRosters([
      { id: "old", players: [{ id: "old-entry", playerMaster: { id: "master" }, buyoutClause: 500 }] },
      { id: "new", players: [{ id: "new-entry", playerMaster: { id: "master" }, buyoutClause: 80 }] },
    ]);
    expect(owners.get("master")).toMatchObject({ teamId: "new", playerTeamId: "new-entry",
      buyoutClause: 80 });
  });
});

describe("catalog market details", () => {
  it("should show an owned unlisted player's roster clause", () => {
    expect(playerClauseDetails(catalogRow(), null)).toMatchObject({ buyoutClause: 100,
      isShielded: false, sellerKind: "opponent" });
  });

  it("should prefer known roster values over matching listing values", () => {
    expect(playerClauseDetails(catalogRow(), listing())).toMatchObject({ buyoutClause: 100,
      isShielded: false });
  });

  it("should fill missing metadata only from the same squad entry and owner", () => {
    const row = catalogRow({ ...owner, buyoutClause: null, isShielded: null });
    expect(playerClauseDetails(row, listing())).toMatchObject({ buyoutClause: 200, isShielded: true });
    for (const mismatch of [{ ...listing(), playerTeamId: "old-entry" },
      { ...listing(), sellerTeamId: "old-owner" }]) {
      expect(matchingPlayerListing(row, mismatch)).toBeNull();
      expect(playerClauseDetails(row, mismatch)).toMatchObject({ buyoutClause: null,
        isShielded: null });
    }
  });

  it("should distinguish free agents from unavailable ownership", () => {
    expect(playerClauseDetails(catalogRow(null, "Free Agent"), null).sellerKind).toBe("laliga");
    expect(playerClauseDetails(catalogRow(null, "Unavailable"), null).sellerKind).toBe("opponent");
    expect(matchingPlayerListing(catalogRow(null, "Free Agent"), listing())).toBeNull();
    expect(playerClauseDetails(catalogRow(null, "Unavailable"), listing()).buyoutClause).toBe(200);
  });

  it("should expire roster locks while preserving active shields", () => {
    const clause = playerClauseDetails(catalogRow({ ...owner, clauseUnlockAt: 100 }), null);
    expect(protectionDescription(clause, 99)).toContain("locked until");
    expect(protectionDescription(clause, 100)).toBeNull();
    expect(protectionDescription({ ...clause, isShielded: true }, 101)).toBe("Release clause protected");
    expect(protectionDescription({ isShielded: null, clauseUnlockAt: null }, 101)).toBeNull();
  });
});
