// ---- Mocks, fixtures & helpers ---- //

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerTile } from "./PlayerTile";
import { LINEUP_POSITION_NEEDED_LABEL } from "./playerTileCopy";
import type { FixtureScoreLine } from "./fixtureScoreLines";

const playedMinutes: FixtureScoreLine = {
  key: "mins_played",
  label: "Minutes",
  count: 90,
  points: 2,
};

// ---- Happy path ---- //

describe("PlayerTile", () => {
  it("PlayerTile_goal_on_a_played_fixture_uses_a_purple_background", () => {
    render(
      <PlayerTile
        name="Lewandowski"
        captain={false}
        variant="pitch"
        interactive
        onSelect={() => undefined}
        fixtureHighlight={{ kind: "goal", goals: 2 }}
      />,
    );

    const card = screen.getByRole("button", { name: "Lewandowski, Scored 2 goals" });
    expect(card.className).toContain("is-fixture-highlight");
  });

  it("PlayerTile_goalkeeper_without_a_goal_against_uses_the_same_background", () => {
    render(
      <PlayerTile
        name="Courtois"
        captain={false}
        variant="pitch"
        interactive
        onSelect={() => undefined}
        fixtureHighlight={{ kind: "clean-sheet", goals: 0 }}
      />,
    );

    const card = screen.getByRole("button", { name: "Courtois, No goals conceded" });
    expect(card.className).toContain("is-fixture-highlight");
  });

  it("PlayerTile_played_score_describes_the_nested_point_events", () => {
    render(
      <PlayerTile
        name="Freeman"
        captain={false}
        variant="pitch"
        interactive
        onSelect={() => undefined}
        fixturePoints={2}
        fixtureScoreLines={[playedMinutes]}
      />,
    );

    const card = screen.getByRole("button", {
      name: "Freeman, 2 points, Minutes, 90, +2 points",
    });
    expect(card.className).toContain("pitch-tile");
  });

  it("PlayerTile_daznPoints_describesSignedPointsWithoutACount", () => {
    render(
      <PlayerTile
        name="Freeman"
        captain={false}
        variant="pitch"
        interactive
        onSelect={() => undefined}
        fixturePoints={5}
        fixtureScoreLines={[{
          key: "daznPoints", label: "DAZN", count: null, points: 3,
        }]}
      />,
    );

    const card = screen.getByRole("button", {
      name: "Freeman, 5 points, DAZN, +3 points",
    });
    expect(card.className).toContain("pitch-tile");
  });

  // ---- Edge cases ---- //

  it("PlayerTile_without_a_fixture_highlight_keeps_the_neutral_background", () => {
    render(
      <PlayerTile
        name="Bench"
        captain={false}
        variant="squad"
        interactive
        onSelect={() => undefined}
      />,
    );

    const card = screen.getByRole("button", { name: "Bench" });
    expect(card.className).not.toContain("is-fixture-highlight");
  });

  it("PlayerTile_unfilled_position_uses_a_red_background_and_black_text_name", () => {
    render(
      <PlayerTile
        name="Bench striker"
        captain={false}
        variant="squad"
        interactive
        onSelect={() => undefined}
        positionNeeded
      />,
    );

    const card = screen.getByRole("button", {
      name: `Bench striker, ${LINEUP_POSITION_NEEDED_LABEL}`,
    });
    expect(card.className).toContain("is-position-needed");
  });

  it("PlayerTile_empty_slot_ignores_a_fixture_highlight", () => {
    const { container } = render(
      <PlayerTile
        name="Empty"
        captain={false}
        variant="pitch"
        empty
        fixtureHighlight={{ kind: "goal", goals: 1 }}
      />,
    );

    expect(container.querySelector(".is-fixture-highlight")).toBeNull();
  });

  it("PlayerTile_listedOnMarket_showsMarkAndNamesItForScreenReaders", () => {
    const { container } = render(
      <PlayerTile name="Ionut Radu" captain={false} variant="squad" interactive
        listedOnMarket onSelect={() => undefined} />,
    );

    expect(container.querySelector(".player-market-badge")).not.toBeNull();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("On the market");
  });

  it("PlayerTile_notListed_hasNoMarketMark", () => {
    const { container } = render(
      <PlayerTile name="Ionut Radu" captain={false} variant="squad" interactive
        onSelect={() => undefined} />,
    );

    expect(container.querySelector(".player-market-badge")).toBeNull();
  });
});
