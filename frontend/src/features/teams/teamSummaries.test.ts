import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import type { ClubMatchView } from "./teamPerformance";
import {
  alternativesSummary, coachSummary, formationOf, injuriesSummary, mvpSummary,
  newsSummary, overviewSummary, previousSummary, squadSummary, startersSummary, upcomingSummary,
} from "./teamSummaries";

// ---- Mocks, fixtures & helpers ---- //

afterEach(() => { void i18n.changeLanguage("en"); });

function match(patch: Partial<ClubMatchView>): ClubMatchView {
  return {
    matchId: "m", group: "laliga", competition: "laliga", home: "Athletic Club", away: "Osasuna",
    homeBadge: null, awayBadge: null, kickoff: "2026-11-07T20:00:00+01:00", kickoffText: null,
    roundLabel: null, regulationHome: 1, regulationAway: 1, finalHome: null, finalAway: null,
    outcome: "draw", venue: "home", scheduled: false, ...patch,
  };
}

const record = {
  won: 2, drawn: 2, lost: 1,
  home: { won: 2, drawn: 0, lost: 0 }, away: { won: 0, drawn: 2, lost: 1 },
  goalsFor: 8, goalsAgainst: 5,
};

describe("teamSummaries", () => {
  // ---- Happy path ---- //

  it("overviewSummary_with_a_record_states_results_goals_and_signed_difference", () => {
    expect(overviewSummary(record))
      .toBe("Played 5: won 2, drawn 2, lost 1. Goals: 8 scored, 5 conceded (+3).");
  });

  it("previousSummary_names_the_newest_result_and_its_outcome", () => {
    const text = previousSummary([match({}), match({ matchId: "n" })]);
    expect(text).toContain("Played 2, newest first.");
    expect(text).toContain("Latest: Athletic Club 1 – 1 Osasuna, 7 Nov 2026 (draw).");
  });

  it("upcomingSummary_names_the_next_fixture_with_date_and_time", () => {
    const text = upcomingSummary([match({ scheduled: true, regulationHome: null, regulationAway: null, outcome: null })]);
    expect(text).toBe("Scheduled 1. Next: Athletic Club vs Osasuna, 7 Nov 2026, 20:00.");
  });

  it("mvpSummary_and_squadSummary_report_the_points_leaders", () => {
    expect(mvpSummary([{ name: "A", points: 90 }, { name: "B", points: 79 }]))
      .toBe("Ranked by FSYP: A (90), B (79).");
    expect(squadSummary([{ name: "A", points: 3 }, { name: "B", points: 9 }, { name: "C", points: null }]))
      .toBe("Squad of 3. Highest FSYP: B (9).");
  });

  it("startersSummary_reports_the_formation_and_the_least_certain_starter", () => {
    const position = ["Portero", "Defensa", "Defensa", "Defensa", "Defensa",
      "Mediocampista", "Mediocampista", "Mediocampista", "Delantero", "Delantero", "Delantero"];
    const players = position.map((value, index) => ({
      name: `P${index}`, position: value, probability: index === 5 ? 50 : 90,
    }));
    expect(formationOf(players)).toBe("4-3-3");
    expect(startersSummary(players))
      .toBe("Predicted XI, 4-3-3 formation. Least certain starter: P5 (50%).");
  });

  it("coachSummary_alternativesSummary_injuriesSummary_and_newsSummary_read_their_widgets", () => {
    expect(coachSummary({
      coach: { name: "Terzic", seasonPredictabilityPercent: 85, matchdayPredictability: "poco previsible" },
      summary: { averageProbability: 76 },
    })).toBe("Coach Terzic. Season predictability: 85%. Matchday predictability: Hard to predict. Average start probability: 76%.");
    expect(alternativesSummary([
      { players: [{ name: "X", probability: 10 }] }, { players: [{ name: "Y", probability: 50 }] },
    ])).toBe("Substitutes: 2. Position groups: 2. Likeliest: Y (50%).");
    expect(injuriesSummary([{ name: "N. Williams", hierarchy: "Clave" }, { name: "B", hierarchy: null }]))
      .toBe("Injured: 2. Most important: N. Williams (Clave).");
    expect(newsSummary(26, "7 days", { kind: "Lineup", when: "8 Nov, 22:26" }))
      .toBe("Events: 26, covering 7 days. Latest: Lineup, 8 Nov, 22:26.");
  });

  // ---- Edge cases ---- //

  it("summaries_without_data_return_nothing_to_announce", () => {
    expect(previousSummary([])).toBeNull();
    expect(upcomingSummary([])).toBeNull();
    expect(mvpSummary([])).toBeNull();
    expect(squadSummary([])).toBeNull();
    expect(startersSummary([])).toBeNull();
    expect(coachSummary({})).toBeNull();
    expect(alternativesSummary([])).toBeNull();
    expect(injuriesSummary([])).toBeNull();
    expect(newsSummary(0, "0 days", null)).toBeNull();
  });

  it("overviewSummary_without_finished_matches_says_so", () => {
    expect(overviewSummary({ ...record, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 }))
      .toBe("No finished matches with a recorded score in this window.");
  });

  it("startersSummary_without_a_clean_formation_falls_back_to_the_player_count", () => {
    expect(formationOf([{ position: "Portero" }, { position: null }])).toBeNull();
    expect(startersSummary([{ name: "A", position: null }, { name: "B", position: null }]))
      .toBe("Predicted XI of 2 players.");
  });

  it("summaries_are_translated_when_the_language_is_spanish", () => {
    void i18n.changeLanguage("es");
    expect(overviewSummary(record))
      .toBe("Jugados 5: ganados 2, empatados 2, perdidos 1. Goles: 8 a favor, 5 en contra (+3).");
    expect(injuriesSummary([{ name: "B", hierarchy: null }]))
      .toBe("Lesionados: 1. El más importante: B.");
  });
});
