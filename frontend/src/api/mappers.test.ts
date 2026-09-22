// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  clampWeek,
  defaultWeek,
  formatTeamValue,
  formationLabel,
  groupsFromLineup,
  mapRanking,
  maxWeek,
  pointsLabel,
  possessiveName,
  scoreWeekLabel,
  selectedTeamValue,
  squadCards,
  weekPointsForTeam,
  type StandingRow,
} from "./mappers";

const STANDING: StandingRow[] = [
  {
    position: 2,
    points: 1123,
    team: {
      id: "t-2",
      teamValue: 80_000,
      manager: { managerName: "Opponent 1" },
    },
  },
  {
    position: 1,
    points: 1200,
    team: {
      id: 7,
      teamValue: 100_000,
      manager: { managerName: "Andreshere" },
    },
  },
];

// ---- Happy path ---- //

describe("mapRanking", () => {
  it("mapRanking_standing_rows_orders_by_position", () => {
    const ranking = mapRanking(STANDING);
    expect(ranking.map((row) => row.name)).toEqual(["Andreshere", "Opponent 1"]);
    expect(ranking[0]).toMatchObject({
      teamId: "7",
      position: 1,
      points: 1200,
      teamValue: 100_000,
      selectable: true,
    });
  });
});

describe("formatTeamValue", () => {
  it("formatTeamValue_amount_uses_es_locale_and_euro", () => {
    expect(formatTeamValue(100_000)).toBe("100.000 €");
  });
});

describe("week score", () => {
  it("scoreWeekLabel_and_points_describe_the_selected_matchday", () => {
    expect(scoreWeekLabel(1)).toBe("F1");
    expect(weekPointsForTeam(STANDING, "7")).toBe(1200);
    expect(pointsLabel(1200)).toBe("1200 p");
  });
});

describe("formationLabel", () => {
  it("formationLabel_tactical_list_joins_with_dashes", () => {
    expect(formationLabel([4, 4, 2])).toBe("4-4-2");
  });
});

describe("squadCards", () => {
  it("squadCards_players_prefer_nickname", () => {
    const cards = squadCards(
      [
        {
          playerTeamId: "pt-1",
          playerMaster: { nickname: "Raphinha", name: "Raphinha Dias" },
        },
        { playerTeamId: "pt-2", playerMaster: { name: "Unai Simón" } },
      ],
      "pt-1",
    );
    expect(cards).toEqual([
      { id: "pt-1", name: "Raphinha", captain: true },
      { id: "pt-2", name: "Unai Simón", captain: false },
    ]);
  });
});

// ---- Error paths ---- //

describe("mapper failures", () => {
  it("formatTeamValue_missing_value_returns_dash", () => {
    expect(formatTeamValue(null)).toBe("—");
    expect(formatTeamValue(Number.NaN)).toBe("—");
  });

  it("weekPointsForTeam_unknown_team_returns_null", () => {
    expect(weekPointsForTeam(STANDING, "missing")).toBeNull();
  });

  it("mapRanking_non_array_is_empty", () => {
    expect(mapRanking([])).toEqual([]);
  });
});

// ---- Edge cases ---- //

describe("matchday bounds", () => {
  it("defaultWeek_previous_week_is_preferred", () => {
    expect(defaultWeek({ previousWeek: 4, weekNumber: 5 })).toBe(4);
  });

  it("defaultWeek_without_previous_uses_current_week", () => {
    expect(defaultWeek({ previousWeek: 0, weekNumber: 5 })).toBe(5);
    expect(defaultWeek({})).toBe(1);
    expect(maxWeek({ weekNumber: 5 })).toBe(5);
  });

  it("clampWeek_out_of_range_stays_inside_bounds", () => {
    expect(clampWeek(0, 8)).toBe(1);
    expect(clampWeek(9, 8)).toBe(8);
    expect(clampWeek(3, 8)).toBe(3);
  });
});

describe("lineup names", () => {
  it("groupsFromLineup_id_only_slot_uses_placeholder_name", () => {
    const groups = groupsFromLineup({
      formation: {
        tacticalFormation: [4, 4, 2],
        goalkeeper: ["pt-1"],
        defender: [],
        midfield: [],
        striker: [],
      },
    });
    expect(formationLabel([4, 4, 2])).toBe("4-4-2");
    expect(groups[0]?.players).toEqual([{ id: "pt-1", name: "Player name" }]);
  });

  it("possessiveName_blank_falls_back_to_your", () => {
    expect(possessiveName("Andreshere")).toBe("Andreshere’s");
    expect(possessiveName("  ")).toBe("Your");
  });

  it("selectedTeamValue_falls_back_to_caller_value", () => {
    const ranking = mapRanking([
      { position: 1, points: 10, team: { id: "7", manager: { managerName: "A" } } },
    ]);
    expect(selectedTeamValue(ranking, "7", "7", 50_000)).toBe(50_000);
    expect(formatTeamValue(selectedTeamValue(ranking, "7", "7", 50_000))).toBe("50.000 €");
  });
});
