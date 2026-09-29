// ---- Mocks, fixtures & helpers ---- //

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Alpha" });
    expect(screen.queryByRole("button", { name: "League" })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "Beta" }));
    });
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(harness.selectLeague).toHaveBeenCalledWith("b");
    expect(document.activeElement).toBe(trigger);
  });
});
