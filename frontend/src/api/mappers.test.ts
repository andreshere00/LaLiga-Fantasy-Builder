// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it } from "vitest";

import {
  clampWeek,
  defaultWeek,
  fixtureScoresVisibleForWeek,
  lastPlayedWeek,
  lineupFixtureTotal,
  formatTeamValue,
  formationLabel,
  freeFormationCodesFromLineup,
  groupsFromLineup,
  lineupsAvailableFromLineup,
  avatarsByTeamId,
  managerAvatarUrl,
  teamIdsMissingAvatars,
  asLeagues,
  mapRanking,
  masterPlayerIdsFromTeam,
  maxWeek,
  pointsLabel,
  possessiveName,
  scoreWeekLabel,
  selectedTeamValue,
  catalogMediaByMasterId,
  enrichSquadMapFromLineup,
  formatFixtureCountdown,
  fixtureMvpFromSlot,
  fixturePointsFromSlot,
  nextFixtureKickoffMs,
  mediaFromLineupSlot,
  mediaFromPlayerMaster,
  teamNameFromTeamId,
  scoreTone,
  squadCards,
  weekMvpMasterIds,
  weekPointsByMasterId,
  weekPointsForTeam,
  withCallerAvatar,
  type StandingRow,
} from "./mappers";

const STANDING: StandingRow[] = [
  {
    position: 2,
    points: 1123,
    team: {
      id: "t-2",
      teamValue: 80_000,
      manager: { managerName: "Opponent 1", avatar: "https://cdn.example/opp.png" },
    },
  },
  {
    position: 1,
    points: 1200,
    team: {
      id: 7,
      teamValue: 100_000,
      manager: { managerName: "Andreshere", avatar: "https://cdn.example/mgr.png" },
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
      avatarUrl: "https://cdn.example/mgr.png",
    });
    expect(ranking[1]?.avatarUrl).toBe("https://cdn.example/opp.png");
  });
});

describe("asLeagues", () => {
  it("asLeagues_wrapped_payload_returns_league_objects", () => {
    const leagues = asLeagues({
      leagues: [{ id: "1", name: "Estadio de Vallecas" }, { id: "2", name: "Other" }],
    });
    expect(leagues.map((league) => league.name)).toEqual([
      "Estadio de Vallecas",
      "Other",
    ]);
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
        masterPlayerId: null,
        name: "Raphinha",
        captain: true,
        positionId: null,
        photoUrl: null,
        teamBadgeUrl: null,
        fixturePoints: null,
        isMvp: false,
        marketValue: null,
        onMarket: false,
        listingId: null,
        salePrice: null,
      },
      {
        id: "pt-2",
        masterPlayerId: null,
        name: "Unai Simón",
        captain: false,
        positionId: null,
        photoUrl: null,
        teamBadgeUrl: null,
        fixturePoints: null,
        isMvp: false,
        marketValue: null,
        onMarket: false,
        listingId: null,
        salePrice: null,
      },
    ]);
  });

  it("squadCards_reads_market_value_and_listing", () => {
    const [card] = squadCards(
      [
        {
          playerTeamId: "pt-9",
          playerMarket: { id: "mk-1", salePrice: 9_000_000 },
          playerMaster: { nickname: "Pedri", marketValue: 8_000_000.4 },
        },
      ],
      null,
    );
    expect(card?.marketValue).toBe(8_000_000);
    expect(card?.onMarket).toBe(true);
    expect(card?.listingId).toBe("mk-1");
    expect(card?.salePrice).toBe(9_000_000);
  });

  it("squadCards_sale_price_without_listing_id_is_not_on_market", () => {
    const [card] = squadCards(
      [
        {
          playerTeamId: "pt-9",
          playerMarket: { salePrice: 9_000_000 },
          playerMaster: { nickname: "Pedri", marketValue: 8_000_000 },
        },
      ],
      null,
    );
    expect(card?.onMarket).toBe(false);
    expect(card?.listingId).toBeNull();
    expect(card?.salePrice).toBe(9_000_000);
  });
});

describe("teamNameFromTeamId", () => {
  it("teamNameFromTeamId_resolves_canonical_team_id", () => {
    expect(teamNameFromTeamId("2")).toBe("Atlético de Madrid");
  });

  it("teamNameFromTeamId_resolves_dsp_id", () => {
    expect(teamNameFromTeamId(70)).toBe("Atlético de Madrid");
  });

  it("teamNameFromTeamId_unknown_id_returns_null", () => {
    expect(teamNameFromTeamId("not-a-club")).toBeNull();
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

  it("mediaFromPlayerMaster_falls_back_to_nested_images", () => {
    expect(
      mediaFromPlayerMaster({
        images: { photo: { url: "https://example.test/nested.png" } },
      }),
    ).toEqual({
      photoUrl: "https://example.test/nested.png",
      teamBadgeUrl: null,
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

describe("fixture score", () => {
  it("scoreTone_uses_sign_scale_and_mvp_blue", () => {
    expect(scoreTone(-1)).toBe("red");
    expect(scoreTone(0)).toBe("yellow");
    expect(scoreTone(4)).toBe("green");
    expect(scoreTone(10, true)).toBe("blue");
  });

  it("fixturePointsFromSlot_reads_week_points_on_slot", () => {
    expect(fixturePointsFromSlot({ playerTeamId: "pt-1", weekPoints: 12 })).toBe(12);
  });

  it("fixturePointsFromSlot_reads_last_stats_for_requested_week", () => {
    expect(
      fixturePointsFromSlot(
        {
          playerMaster: {
            lastStats: [
              { weekNumber: 3, totalPoints: 2 },
              { weekNumber: 7, totalPoints: 8 },
            ],
          },
        },
        { week: 7 },
      ),
    ).toBe(8);
  });

  it("weekPointsByMasterId_indexes_calendar_match_players", () => {
    const map = weekPointsByMasterId([
      {
        local: { players: [{ id: "11", weekPoints: 6 }] },
        visitor: { players: [{ id: 22, weekPoints: 0 }] },
      },
    ]);
    expect(map.get("11")).toBe(6);
    expect(map.get("22")).toBe(0);
  });

  it("fixturePointsFromSlot_falls_back_to_calendar_master_id", () => {
    const pointsByMasterId = new Map([["77", 11]]);
    expect(
      fixturePointsFromSlot(
        { playerMaster: { id: "77", nickname: "Former" } },
        { week: 4, pointsByMasterId },
      ),
    ).toBe(11);
  });

  it("weekMvpMasterIds_indexes_calendar_mvp_flag", () => {
    const set = weekMvpMasterIds([
      {
        local: { players: [{ id: "11", weekPoints: 12, isMvp: true }] },
        visitor: { players: [{ id: 22, weekPoints: 8, mvp: false }] },
      },
    ]);
    expect(set.has("11")).toBe(true);
    expect(set.has("22")).toBe(false);
  });

  it("fixtureMvpFromSlot_reads_last_stats_flag_for_week", () => {
    expect(
      fixtureMvpFromSlot(
        {
          playerMaster: {
            lastStats: [
              { weekNumber: 3, totalPoints: 2 },
              { weekNumber: 7, totalPoints: 8, isMvp: true },
            ],
          },
        },
        { week: 7 },
      ),
    ).toBe(true);
  });

  it("fixtureMvpFromSlot_falls_back_to_calendar_master_id", () => {
    expect(
      fixtureMvpFromSlot(
        { playerMaster: { id: "77", nickname: "Former" } },
        { week: 4, mvpByMasterId: new Set(["77"]) },
      ),
    ).toBe(true);
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

  it("mapRanking_missing_manager_avatar_is_null", () => {
    const ranking = mapRanking([
      { position: 1, points: 10, team: { id: "7", manager: { managerName: "A" } } },
    ]);
    expect(ranking[0]?.avatarUrl).toBeNull();
  });

  it("mapRanking_profile_image_fills_missing_avatar", () => {
    const ranking = mapRanking([
      {
        position: 1,
        team: { id: "7", manager: { profileImage: "https://cdn.example/alt.png" } },
      },
    ]);
    expect(ranking[0]?.avatarUrl).toBe("https://cdn.example/alt.png");
  });

  it("mapRanking_team_lookup_fills_missing_standing_avatar", () => {
    const ranking = mapRanking(
      [{ position: 1, team: { id: "7", manager: { managerName: "A" } } }],
      new Map([["7", "https://cdn.example/from-teams.png"]]),
    );
    expect(ranking[0]?.avatarUrl).toBe("https://cdn.example/from-teams.png");
  });

  it("managerAvatarUrl_nested_images_uses_transparent_size", () => {
    expect(
      managerAvatarUrl({
        images: { transparent: { "128x128": "https://cdn.example/128.png" } },
      }),
    ).toBe("https://cdn.example/128.png");
  });

  it("avatarsByTeamId_indexes_manager_photos", () => {
    const map = avatarsByTeamId([
      { id: 7, manager: { avatar: "https://cdn.example/a.png" } },
      { id: "8", manager: { managerName: "No photo" } },
    ]);
    expect(map.get("7")).toBe("https://cdn.example/a.png");
    expect(map.has("8")).toBe(false);
  });

  it("teamIdsMissingAvatars_skips_ids_already_indexed", () => {
    const map = avatarsByTeamId([
      { id: 7, manager: { avatar: "https://cdn.example/a.png" } },
    ]);
    expect(teamIdsMissingAvatars(["7", "007", "8"], map)).toEqual(["8"]);
  });

  it("avatarsByTeamId_player_manager_and_name_fill_lookup", () => {
    const map = avatarsByTeamId({
      teams: [
        {
          id: "9",
          players: [
            { manager: { managerName: "Kylian", avatar: "//cdn.example/k.png" } },
          ],
        },
      ],
    });
    expect(map.get("9")).toBe("https://cdn.example/k.png");
    expect(map.get("name:kylian")).toBe("https://cdn.example/k.png");
  });

  it("mapRanking_name_lookup_fills_missing_team_id_avatar", () => {
    const ranking = mapRanking(
      [{ position: 1, team: { id: "99", manager: { managerName: "Kylian" } } }],
      new Map([["name:kylian", "https://cdn.example/k.png"]]),
    );
    expect(ranking[0]?.avatarUrl).toBe("https://cdn.example/k.png");
  });

  it("mapRanking_padded_team_id_uses_lookup", () => {
    const ranking = mapRanking(
      [{ position: 1, team: { id: "007", manager: { managerName: "A" } } }],
      new Map([["7", "https://cdn.example/pad.png"]]),
    );
    expect(ranking[0]?.avatarUrl).toBe("https://cdn.example/pad.png");
  });

  it("withCallerAvatar_name_match_fills_missing_photo", () => {
    const ranking = withCallerAvatar(
      mapRanking([
        { position: 1, team: { id: "99", manager: { managerName: "Kylian Mpalmé" } } },
      ]),
      {
        teamId: "1",
        name: "Kylian Mpalme",
        avatar: "https://cdn.example/me.png",
      },
    );
    expect(ranking[0]?.avatarUrl).toBe("https://cdn.example/me.png");
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

  it("lastPlayedWeek_uses_previous_week_when_present", () => {
    expect(lastPlayedWeek({ previousWeek: 7, weekNumber: 8 })).toBe(7);
    expect(lastPlayedWeek({ weekNumber: 8 })).toBe(7);
    expect(lastPlayedWeek({ weekNumber: 1 })).toBe(0);
  });

  it("fixtureScoresVisibleForWeek_hides_open_matchweek", () => {
    const current = { previousWeek: 7, weekNumber: 8 };
    expect(fixtureScoresVisibleForWeek(8, current)).toBe(false);
    expect(fixtureScoresVisibleForWeek(7, current)).toBe(true);
    expect(fixtureScoresVisibleForWeek(1, current)).toBe(true);
  });

  it("clampWeek_out_of_range_stays_inside_bounds", () => {
    expect(clampWeek(0, 8)).toBe(1);
    expect(clampWeek(9, 8)).toBe(8);
    expect(clampWeek(3, 8)).toBe(3);
  });
});

describe("lineupFixtureTotal", () => {
  it("lineupFixtureTotal_sums_scored_players_and_ignores_empty_slots", () => {
    const groups = [
      {
        role: "goalkeeper" as const,
        players: [
          { id: "a", masterPlayerId: null, name: "A", fixturePoints: 7 },
          { id: "b", masterPlayerId: null, name: "B", fixturePoints: -1 },
          { id: "c", masterPlayerId: null, name: "C", fixturePoints: 9, isEmpty: true },
          { id: "d", masterPlayerId: null, name: "D" },
        ],
      },
    ];
    expect(lineupFixtureTotal(groups)).toBe(6);
  });

  it("lineupFixtureTotal_without_scores_returns_null", () => {
    expect(
      lineupFixtureTotal([
        { role: "defender", players: [{ id: "a", masterPlayerId: null, name: "A" }] },
      ]),
    ).toBeNull();
  });
});

describe("masterPlayerIdsFromTeam", () => {
  it("masterPlayerIdsFromTeam_collects_master_ids_from_roster", () => {
    expect(
      masterPlayerIdsFromTeam({
        players: [
          { playerMaster: { id: 12 }, playerTeamId: "pt-1" },
          { playerMasterId: "34" },
        ],
      }),
    ).toEqual(["12", "34"]);
  });
});

describe("fixture countdown", () => {
  it("nextFixtureKickoffMs_picks_earliest_future_kickoff", () => {
    const now = Date.parse("2026-10-10T12:00:00+02:00");
    const payload = [
      { matchDate: "2026-10-09T21:00:00+02:00" },
      { matchDate: "2026-10-11T16:15:00+02:00" },
      { matchDate: "2026-10-11T20:00:00+02:00" },
    ];
    expect(nextFixtureKickoffMs(payload, now)).toBe(Date.parse("2026-10-11T16:15:00+02:00"));
  });

  it("formatFixtureCountdown_formats_days_hours_minutes", () => {
    const now = Date.parse("2026-10-10T12:00:00+02:00");
    const target = Date.parse("2026-10-12T15:05:00+02:00");
    expect(formatFixtureCountdown(target, now)).toBe("2 days 3 hours 5 minutes");
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
    expect(groups[0]?.players).toEqual([
      { id: "pt-1", masterPlayerId: null, name: "Player name" },
    ]);
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
