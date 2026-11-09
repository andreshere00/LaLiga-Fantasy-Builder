import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamPerformanceSection } from "./TeamPerformanceSection";

const onCompetition = vi.fn();

const performance = {
  matches: [
    {
      matchId: "cup",
      group: "european" as const,
      competition: "champions_league",
      home: "Liverpool",
      away: "Villarreal",
      venue: "away" as const,
      outcome: "loss" as const,
      regulationHome: 2,
      regulationAway: 2,
      finalHome: 4,
      finalAway: 5,
      scheduled: false,
      kickoff: "2026-10-01T18:00:00Z",
    },
    {
      matchId: "next",
      group: "laliga" as const,
      competition: "laliga",
      home: "20",
      away: "9",
      venue: "home" as const,
      scheduled: true,
      kickoff: "2026-11-08T20:00:00+01:00",
    },
  ],
  nextMatchId: "next",
};

describe("TeamPerformanceSection", () => {
  beforeEach(() => {
    cleanup();
    onCompetition.mockClear();
  });

  it("TeamPerformanceSection_extra_time_and_next_match_stay_labeled", () => {
    render(
      <MemoryRouter><TeamPerformanceSection
        performance={performance}
        clubs={[
          { clubId: 20, name: "Villarreal CF", badgeUrl: null },
          { clubId: 9, name: "Getafe CF", badgeUrl: null },
        ]}
        competition="all"
        window="5"
        failed={false}
        onCompetition={onCompetition}
        onWindow={vi.fn()}
        onRetry={vi.fn()}
      /></MemoryRouter>,
    );
    expect(screen.getByText("2 (4) – 2 (5)")).toBeTruthy();
    expect(screen.getByText("Next match")).toBeTruthy();
    expect(screen.getByText("Villarreal CF")).toBeTruthy();
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links.some((href) => href === "/teams/20" || href === "/teams/9")).toBe(true);
  });

  it("TeamPerformanceSection_empty_filter_offers_all_competitions", () => {
    render(
      <MemoryRouter><TeamPerformanceSection
        performance={performance}
        clubs={[]}
        competition="domestic"
        window="5"
        failed={false}
        onCompetition={onCompetition}
        onWindow={vi.fn()}
        onRetry={vi.fn()}
      /></MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show all competitions" }));
    expect(onCompetition).toHaveBeenCalledWith("all");
  });

  it("TeamPerformanceSection_each_widget_shows_a_description_that_its_content_points_back_to", () => {
    render(
      <MemoryRouter><TeamPerformanceSection
        performance={performance}
        clubs={[{ clubId: 20, name: "Villarreal CF", badgeUrl: null }, { clubId: 9, name: "Getafe CF", badgeUrl: null }]}
        competition="all"
        window="5"
        failed={false}
        onCompetition={onCompetition}
        onWindow={vi.fn()}
        onRetry={vi.fn()}
      /></MemoryRouter>,
    );
    const overview = screen.getByRole("group", { name: "Overview" });
    expect(overview.getAttribute("aria-describedby")).toBe("team-summary-overview");
    expect(document.getElementById("team-summary-overview")?.textContent)
      .toContain("Results, recent form, home and away record");
    const previous = screen.getByRole("list", { name: "Previous matches" });
    expect(document.getElementById(previous.getAttribute("aria-describedby") ?? "")?.textContent)
      .toContain("Finished matches in the selected window");
    const upcoming = screen.getByRole("list", { name: "Upcoming matches" });
    expect(document.getElementById(upcoming.getAttribute("aria-describedby") ?? "")?.textContent)
      .toContain("Scheduled matches in the selected window");
  });

  it("TeamPerformanceSection_long_windows_keep_the_whole_season_board_layout", () => {
    const board = (window: "5" | "10" | "20" | "season") => {
      cleanup();
      const { container } = render(
        <MemoryRouter><TeamPerformanceSection
          performance={performance}
          clubs={[]}
          competition="all"
          window={window}
          failed={false}
          onCompetition={vi.fn()}
          onWindow={vi.fn()}
          onRetry={vi.fn()}
        /></MemoryRouter>,
      );
      return container.querySelector(".team-performance-board") as HTMLElement;
    };
    expect(board("5").classList.contains("is-long")).toBe(false);
    for (const window of ["10", "20", "season"] as const) {
      expect(board(window).classList.contains("is-long")).toBe(true);
    }
  });

  it("TeamPerformanceSection_about_block_is_a_one_line_toggle_that_opens_the_three_descriptions", () => {
    render(
      <MemoryRouter><TeamPerformanceSection
        performance={performance}
        clubs={[{ clubId: 20, name: "Villarreal CF", badgeUrl: null }, { clubId: 9, name: "Getafe CF", badgeUrl: null }]}
        competition="all"
        window="5"
        failed={false}
        onCompetition={vi.fn()}
        onWindow={vi.fn()}
        onRetry={vi.fn()}
      /></MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: /About/ });
    expect(toggle.textContent).toContain("Overview · Previous matches · Upcoming matches");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const list = document.getElementById("team-about-list") as HTMLElement;
    expect(list.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll("dd")).toHaveLength(3);
  });
});
