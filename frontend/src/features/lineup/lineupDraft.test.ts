// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import type { LineupGroup, SquadCard } from "../../api/mappers";
import {
  applyFormationCode,
  applyPitchPick,
  draftFromGroups,
  groupsForPitchDisplay,
  isDraftComplete,
  lineupWriteBody,
  roleFromPositionId,
  squadPickerPool,
} from "./lineupDraft";

const media = { photoUrl: null, teamBadgeUrl: null };

const squad: SquadCard[] = [
  { id: "gk", name: "GK", captain: false, positionId: 1, ...media },
  { id: "d1", name: "D1", captain: false, positionId: 2, ...media },
  { id: "d2", name: "D2", captain: false, positionId: 2, ...media },
  { id: "m1", name: "M1", captain: false, positionId: 3, ...media },
  { id: "m2", name: "M2", captain: false, positionId: 3, ...media },
  { id: "s1", name: "S1", captain: false, positionId: 4, ...media },
  { id: "s2", name: "S2", captain: false, positionId: 4, ...media },
];

function groups442(): LineupGroup[] {
  return [
    { role: "goalkeeper", players: [{ id: "gk", name: "GK" }] },
    { role: "defender", players: [{ id: "d1", name: "D1" }, { id: "d2", name: "D2" }] },
    { role: "midfield", players: [{ id: "m1", name: "M1" }, { id: "m2", name: "M2" }] },
    { role: "striker", players: [{ id: "s1", name: "S1" }, { id: "s2", name: "S2" }] },
  ];
}

// ---- Happy path ---- //

describe("lineupDraft", () => {
  it("draftFromGroups_builds_slot_ids_from_groups", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2]);
    expect(draft?.defender).toEqual(["d1", "d2", "", ""]);
    expect(isDraftComplete(draft!)).toBe(false);
  });

  it("draftFromGroups_marks_full_lineup_complete", () => {
    const draft = draftFromGroups(
      [
        { role: "goalkeeper", players: [{ id: "gk", name: "GK" }] },
        {
          role: "defender",
          players: [
            { id: "d1", name: "D1" },
            { id: "d2", name: "D2" },
            { id: "d3", name: "D3" },
            { id: "d4", name: "D4" },
          ],
        },
        {
          role: "midfield",
          players: [
            { id: "m1", name: "M1" },
            { id: "m2", name: "M2" },
            { id: "m3", name: "M3" },
            { id: "m4", name: "M4" },
          ],
        },
        { role: "striker", players: [{ id: "s1", name: "S1" }, { id: "s2", name: "S2" }] },
      ],
      [4, 4, 2],
    );
    expect(isDraftComplete(draft!)).toBe(true);
  });

  it("applyFormationCode_keeps_players_that_still_fit", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const next = applyFormationCode(draft, squad, "3,4,3");
    expect(next.defender).toEqual(["d1", "d2", ""]);
    expect(next.striker).toEqual(["s1", "s2", ""]);
    expect(isDraftComplete(next)).toBe(false);
  });

  it("applyPitchPick_swaps_same_line_or_replaces_from_bench", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const swapped = applyPitchPick(
      draft,
      { role: "defender", playerId: "d1" },
      "d2",
      squad,
    );
    expect(swapped.defender).toEqual(["d2", "d1", "", ""]);
  });

  it("applyPitchPick_rejects_other_position", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const same = applyPitchPick(
      draft,
      { role: "defender", playerId: "d1" },
      "m1",
      squad,
    );
    expect(same).toEqual(draft);
  });

  it("lineupWriteBody_includes_captain_when_still_in_lineup", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const body = lineupWriteBody(draft, "m1");
    expect(body.captain).toBe("m1");
    expect(body.tactical_formation).toEqual([4, 4, 2]);
  });
});

// ---- Edge cases ---- //

describe("groupsForPitchDisplay", () => {
  it("groupsForPitchDisplay_keeps_fixture_points_from_lineup_slot", () => {
    const groups = groupsForPitchDisplay(
      [
        {
          role: "goalkeeper",
          players: [{ id: "gk", name: "GK", fixturePoints: 7 }],
        },
        { role: "defender", players: [] },
        { role: "midfield", players: [] },
        { role: "striker", players: [] },
      ],
      [4, 4, 2],
      new Map(),
    );
    expect(groups[0]?.players[0]?.fixturePoints).toBe(7);
  });

  it("groupsForPitchDisplay_keeps_lineup_slots_when_squad_not_loaded", () => {
    const groups = groupsForPitchDisplay(groups442(), [4, 4, 2], new Map());
    const midfield = groups.find((group) => group.role === "midfield")?.players ?? [];
    expect(midfield[0]).toMatchObject({ id: "m1", name: "M1" });
    expect(midfield[0]?.isEmpty).not.toBe(true);
  });

  it("groupsForPitchDisplay_marks_missing_slots_empty", () => {
    const squadById = new Map(squad.map((player) => [player.id, player]));
    const groups = groupsForPitchDisplay(
      groups442(),
      [4, 4, 2],
      squadById,
    );
    const defenders = groups.find((group) => group.role === "defender")?.players ?? [];
    expect(defenders.filter((slot) => slot.isEmpty).length).toBe(2);
  });

  it("applyPitchPick_fills_empty_slot_by_index", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const next = applyPitchPick(
      draft,
      { role: "defender", playerId: "empty-defender-2" },
      "d1",
      squad,
    );
    expect(next.defender[2]).toBe("d1");
  });
});

describe("lineupDraft edge cases", () => {
  it("roleFromPositionId_maps_laliga_ids", () => {
    expect(roleFromPositionId(3)).toBe("midfield");
    expect(roleFromPositionId(99)).toBeNull();
  });

  it("squadPickerPool_excludes_players_already_in_the_draft", () => {
    const draft = draftFromGroups(groups442(), [4, 4, 2])!;
    const pool = squadPickerPool(squad, draft, "defender", "");
    expect(pool.map((player) => player.id)).toEqual([]);
  });
});
