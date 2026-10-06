import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PlayerDetailsLink } from "./PlayerDetailsLink";

// ---- Happy path ---- #

describe("PlayerDetailsLink", () => {
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
});
