// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  clampWeek,
  defaultWeek,
  formatTeamValue,
  formationLabel,
  freeFormationCodesFromLineup,
  groupsFromLineup,
  lineupsAvailableFromLineup,
  mapRanking,
  maxWeek,
  pointsLabel,
  possessiveName,
  scoreWeekLabel,
  selectedTeamValue,
  catalogMediaByMasterId,
  enrichSquadMapFromLineup,
  mediaFromLineupSlot,
  mediaFromPlayerMaster,
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
      {
        id: "pt-1",
        name: "Raphinha",
        captain: true,
        positionId: null,
        photoUrl: null,
        teamBadgeUrl: null,
      },
      {
        id: "pt-2",
        name: "Unai Simón",
        captain: false,
        positionId: null,
        photoUrl: null,
        teamBadgeUrl: null,
      },
    ]);
  });
});

describe("mediaFromPlayerMaster", () => {
  it("mediaFromPlayerMaster_reads_photo_and_club_badge", () => {
    expect(
      mediaFromPlayerMaster({
        images: { transparent: { "256x256": "https://example.test/player.png" } },
        team: { badgeColor: "https://example.test/badge.png" },
      }),
    ).toEqual({
      photoUrl: "https://example.test/player.png",
      teamBadgeUrl: "https://example.test/badge.png",
    });
  });

  it("mediaFromPlayerMaster_prefers_badge_color_for_full_crest", () => {
    expect(
      mediaFromPlayerMaster({
        team: {
          badgeWhite: "https://example.test/badge-white.png",
          badgeColor: "https://example.test/badge-color.png",
        },
      }),
    ).toEqual({
      photoUrl: null,
      teamBadgeUrl: "https://example.test/badge-color.png",
    });
  });
});

describe("catalogMediaByMasterId", () => {
  it("catalogMediaByMasterId_indexes_master_player_media", () => {
    const map = catalogMediaByMasterId([
      {
        id: 42,
        team: { badgeColor: "https://example.test/catalog-badge.png" },
      },
    ]);
    expect(map.get("42")?.teamBadgeUrl).toBe("https://example.test/catalog-badge.png");
  });
});

describe("mediaFromLineupSlot", () => {
  it("mediaFromLineupSlot_falls_back_to_catalog_by_master_id", () => {
    const catalog = catalogMediaByMasterId([
      {
        id: "7",
        team: { badgeColor: "https://example.test/catalog-badge.png" },
      },
    ]);
    expect(
      mediaFromLineupSlot(
        {
          playerTeamId: "pt-old",
          playerMaster: { id: "7", nickname: "Former" },
        },
        catalog,
      ).teamBadgeUrl,
    ).toBe("https://example.test/catalog-badge.png");
  });

  it("mediaFromPlayerMaster_resolves_badge_from_team_id_via_teams_master", () => {
    expect(
      mediaFromPlayerMaster({
        teamId: "2",
        images: { transparent: { "256x256": "https://example.test/photo.png" } },
      }).teamBadgeUrl,
    ).toMatch(/atletico-de-madrid/);
  });

  it("mediaFromLineupSlot_reads_team_on_slot_when_master_has_no_team", () => {
    expect(
      mediaFromLineupSlot({
        playerTeamId: "pt-9",
        playerMaster: {
          nickname: "Former",
          images: { transparent: { "256x256": "https://example.test/p.png" } },
        },
        team: { badgeColor: "https://example.test/club.png" },
      }),
    ).toEqual({
      photoUrl: "https://example.test/p.png",
      teamBadgeUrl: "https://example.test/club.png",
    });
  });
});

describe("enrichSquadMapFromLineup", () => {
  it("enrichSquadMapFromLineup_adds_former_lineup_players_not_on_roster", () => {
    const lineup = {
      formation: {
        tacticalFormation: [4, 4, 2],
        goalkeeper: [
          {
            playerTeamId: "old-gk",
            playerMaster: { nickname: "Old GK" },
            team: { badgeColor: "https://example.test/old-badge.png" },
          },
        ],
        defender: [],
        midfield: [],
        striker: [],
      },
    };
    const merged = enrichSquadMapFromLineup(new Map(), lineup);
    expect(merged.get("old-gk")).toMatchObject({
      name: "Old GK",
      teamBadgeUrl: "https://example.test/old-badge.png",
    });
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
  it("defaultWeek_opens_on_current_week_number", () => {
    expect(defaultWeek({ previousWeek: 4, weekNumber: 5 })).toBe(5);
  });

  it("defaultWeek_without_current_uses_previous_week", () => {
    expect(defaultWeek({ previousWeek: 4 })).toBe(4);
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

describe("lineups available", () => {
  it("lineupsAvailableFromLineup_reads_nested_free_list", () => {
    const payload = {
      lineupsAvailable: {
        free: ["4,4,2", "3,4,3"],
        premium: ["4,2,4"],
      },
    };
    expect(lineupsAvailableFromLineup(payload)).toEqual({
      free: ["4,4,2", "3,4,3"],
      premium: ["4,2,4"],
    });
    expect(freeFormationCodesFromLineup(payload)).toEqual(["4,4,2", "3,4,3"]);
  });

  it("freeFormationCodesFromLineup_missing_payload_returns_null", () => {
    expect(freeFormationCodesFromLineup({ formation: {} })).toBeNull();
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
