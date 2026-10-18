import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import response from "../../../../contracts/lineup-builder-response.json";
import { lineupBuildResponseSchema, type BuilderCandidate } from "../../api/schemas";
import { LineupBuilderScoreDetails } from "./LineupBuilderScoreDetails";

type Player = BuilderCandidate["starters"][number];
type Rule = Player["sections"][number]["criteria"][number];
const base = lineupBuildResponseSchema.parse(response.payload).candidates[0].starters[0];
const rule = (ruleId: string, observed: string, lineup: number | null, trading: number | null = null): Rule => ({
  ruleId, observed, lineup, trading, source: "futbolfantasy",
  lineupLower: -5, lineupUpper: 5, tradingLower: -10, tradingUpper: 10,
});
function section(name: string, criteria: Rule[], overrides: Partial<Player["sections"][number]> = {}) {
  return { section: name, criteria, lineupRaw: 0, tradingRaw: 0, lineupLower: -5,
    lineupUpper: 5, tradingLower: -10, tradingUpper: 10, lineupNormalized: 0,
    tradingNormalized: 0, effectiveWeight: 0.25, ...overrides };
}
afterEach(cleanup);

describe("LineupBuilderScoreDetails", () => {
  it("should distinguish trading rule points from weighted lineup contributions", () => {
    render(<LineupBuilderScoreDetails player={{ ...base, marketValue: 20000000, sections: [
      section("market", [{ ...rule("market_growth_and_value", "0.03579099345999330549621278496", null, 3),
        source: "fantasy_market_history" }], { tradingNormalized: 0.462 }),
    ] }} />);
    expect(screen.getByText(/\+3.58% over five days/)).toBeTruthy();
    expect(screen.getByText("Trading +3 rule pts")).toBeTruthy();
    expect(screen.getByText(/Lineup contribution 0.000 · Weight 25.0% · Trading contribution \+0.462/)).toBeTruthy();
    expect(screen.getByText("Source: Fantasy market history")).toBeTruthy();
    expect(screen.queryByText(/0.035790993459/)).toBeNull();
  });

  it("should translate role, form, match results and injury timing into readable evidence", () => {
    render(<LineupBuilderScoreDetails player={{ ...base, sections: [
      section("indicators", [rule("role_and_starting_probability", "Clave: 90%", 6), rule("form", "mid", 0)]),
      section("fixtures", [rule("club_results", "('D', 'W', 'L', 'L', 'D')", 5), rule("opponent_position", "2", -5)]),
      section("injury", [rule("injury_history", "9", -1)]),
    ] }} />);
    expect(screen.getByText("Key player · 90% chance of starting")).toBeTruthy();
    expect(screen.getByText("Average form")).toBeTruthy();
    expect(screen.getByText("Draw · Win · Loss · Loss · Draw")).toBeTruthy();
    expect(screen.getByText("2nd in LaLiga")).toBeTruthy();
    expect(screen.getByText("9 days since the last recorded injury began, measured at round kickoff")).toBeTruthy();
  });

  it("should explain missing evidence without presenting an unknown injury history as clean", () => {
    render(<LineupBuilderScoreDetails player={{ ...base, omissions: ["injury_history_unknown", "fantasy_average", "weather"],
      sections: [section("injury", [], { effectiveWeight: 0 })] }} />);
    expect(screen.getByText("Complete injury history is unavailable")).toBeTruthy();
    expect(screen.getByText("Season Fantasy average is unavailable")).toBeTruthy();
    expect(screen.getByText("Match-day weather is unavailable")).toBeTruthy();
    expect(screen.getByText("Not used in the lineup score")).toBeTruthy();
    expect(screen.getByText(/its weight is redistributed/)).toBeTruthy();
    expect(screen.queryByText("No injuries in the complete recorded history")).toBeNull();
  });
});
