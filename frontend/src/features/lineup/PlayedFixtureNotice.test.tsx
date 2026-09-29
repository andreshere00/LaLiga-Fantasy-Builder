// ---- Mocks, fixtures & helpers ---- //

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PlayedFixtureNotice } from "./PlayedFixtureNotice";

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="app-shell">
        <button type="button" onClick={() => setOpen(true)}>
          Board
        </button>
      </div>
      <PlayedFixtureNotice open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---- Happy path ---- //

describe("PlayedFixtureNotice", () => {
  it("PlayedFixtureNotice_open_traps_focus_and_restores_it_on_close", async () => {
    render(<Host />);
    const board = screen.getByRole("button", { name: "Board" });
    board.focus();
    fireEvent.click(board);

    const ok = await screen.findByRole("button", { name: "OK" });
    await waitFor(() => {
      expect(document.activeElement).toBe(ok);
    });
    const shell = document.querySelector(".app-shell");
    expect(shell instanceof HTMLElement && shell.inert).toBe(true);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(ok);

    fireEvent.click(ok);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const closedShell = document.querySelector(".app-shell");
    expect(closedShell instanceof HTMLElement && closedShell.inert).toBe(false);
    expect(document.activeElement).toBe(board);
  });
});
