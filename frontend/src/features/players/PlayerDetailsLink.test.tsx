import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { PlayerDetailsLink } from "./PlayerDetailsLink";

// ---- Happy path ---- #

describe("PlayerDetailsLink", () => {
  beforeEach(() => {
    cleanup();
  });

  it("PlayerDetailsLink_rendersPlayerRoute", () => {
    render(
      <MemoryRouter initialEntries={["/players"]}>
        <Routes>
          <Route path="/players" element={<PlayerDetailsLink playerId="42" playerName="Raphinha" />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Raphinha, view details" });
    expect(link.getAttribute("href")).toBe("/players/42");
  });

  it("PlayerDetailsLink_card_usesGrayAndRedIcons", () => {
    render(
      <MemoryRouter initialEntries={["/players"]}>
        <Routes>
          <Route
            path="/players"
            element={<PlayerDetailsLink playerId="42" playerName="Raphinha" card />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Raphinha, view details" });
    const icons = link.querySelectorAll("img");
    expect(icons.length).toBe(2);
    expect(icons[0]?.className).toContain("is-for-gray");
    expect(icons[1]?.className).toContain("is-for-red");
  });

  it("PlayerDetailsLink_club_return_keeps_the_club_path", () => {
    render(
      <MemoryRouter initialEntries={["/teams/5"]}>
        <Routes>
          <Route
            path="/teams/5"
            element={(
              <PlayerDetailsLink
                playerId="42"
                playerName="Isco"
                returnTo="/teams/5?section=lineup"
              />
            )}
          />
          <Route path="/players/42" element={<ReturnPath />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Isco, view details" }));
    expect(screen.getByText("/teams/5?section=lineup")).toBeTruthy();
  });
});

function ReturnPath() {
  const location = useLocation();
  const state = location.state as { returnTo?: string } | null;
  return <p>{state?.returnTo}</p>;
}
