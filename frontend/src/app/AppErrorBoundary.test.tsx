// ---- Mocks, fixtures & helpers ---- //

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./AppErrorBoundary";

function Broken(): never {
  throw new Error("render failed");
}

function Shell({ path }: { path: string }) {
  return (
    <>
      <nav>menu</nav>
      <AppErrorBoundary key={path}>{path === "/broken" ? <Broken /> : <p>{path}</p>}</AppErrorBoundary>
    </>
  );
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ---- Error paths ---- //

  it("render_pageThrows_keepsSurroundingNavigation", () => {
    // Arrange
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Act
    render(<Shell path="/broken" />);

    // Assert
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText("menu")).toBeTruthy();
  });

  // ---- Edge cases ---- //

  it("render_pathChangesAfterError_showsNextPage", () => {
    // Arrange
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<Shell path="/broken" />);

    // Act
    rerender(<Shell path="/market" />);

    // Assert
    expect(screen.getByText("/market")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).toBeNull();
  });
});
