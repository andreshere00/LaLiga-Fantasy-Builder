// ---- Mocks, fixtures & helpers ---- //

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerTile } from "./PlayerTile";

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
});
