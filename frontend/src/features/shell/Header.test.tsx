// ---- Mocks, fixtures & helpers ---- //

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "./Header";

const harness = vi.hoisted(() => {
  const leagues = [
    { id: "a", name: "Alpha", team: { id: "1" } },
    { id: "b", name: "Beta", team: { id: "2" } },
  ];
  return {
    leagues,
    selected: leagues[0],
    selectLeague: vi.fn(),
  };
});

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "signed-out",
    user: null,
    managerName: null,
    managerAvatar: null,
    notice: null,
    login: () => undefined,
    logout: () => undefined,
  }),
}));

vi.mock("../lineup/LeagueProvider", () => ({
  useLeague: () => ({
    leagues: harness.leagues,
    selected: harness.selected,
    selectLeague: harness.selectLeague,
    isLoading: false,
    error: null,
  }),
}));

// ---- Happy path ---- //

describe("Header", () => {
  beforeEach(() => {
    harness.selectLeague.mockClear();
  });

  it("Header_league_menu_announces_name_and_moves_with_arrows", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open settings and account options" }));
    const trigger = screen.getByRole("combobox", { name: "League" });
    expect(trigger.textContent).toContain("Alpha");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const alpha = await screen.findByRole("option", { name: "Alpha" });
    fireEvent.keyDown(alpha, { key: "ArrowDown" });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "Beta" }));
    });
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(screen.getByRole("link", { name: "Teams" }).getAttribute("href")).toBe("/teams");
    expect(harness.selectLeague).toHaveBeenCalledWith("b");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Header_signedOut_dropsStaleScoutingParams", async () => {
    window.history.replaceState(null, "", "/?scouting=alerts&scoutingQuery=ana&keep=1");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(window.location.search).toBe("?keep=1"));
    window.history.replaceState(null, "", "/");
  });

  it("Header_sections_eachTabHasDecorativeIconAndTextName", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    const tabs = container.querySelectorAll(".nav-tabs .nav-tab");

    expect(tabs.length).toBe(4);
    tabs.forEach((tab) => {
      expect(tab.querySelector("svg.nav-tab-icon")?.getAttribute("aria-hidden")).toBe("true");
      expect(tab.textContent?.length).toBeGreaterThan(0);
    });
  });
});
