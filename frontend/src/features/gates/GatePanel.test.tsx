// ---- Mocks, fixtures & helpers ---- //

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GatePanel } from "./GatePanel";

const harness = vi.hoisted(() => ({ connectLaliga: vi.fn() }));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ login: vi.fn(), reload: vi.fn(), connectLaliga: harness.connectLaliga }),
}));

function renderGate(status: "unlinked" | "needs-reauth") {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<GatePanel status={status} />} />
        <Route path="/connect-laliga" element={<p>connect page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GatePanel", () => {
  afterEach(cleanup);

  // ---- Happy path ---- //

  it.each(["unlinked", "needs-reauth"] as const)(
    "connectAction_%s_opensConnectPage",
    status => {
      // Arrange
      renderGate(status);

      // Act
      fireEvent.click(screen.getByRole("link", { name: "Connect LaLiga" }));

      // Assert
      expect(screen.getByText("connect page")).toBeTruthy();
      expect(harness.connectLaliga).not.toHaveBeenCalled();
    },
  );
});
