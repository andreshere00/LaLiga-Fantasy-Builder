// ---- Mocks, fixtures & helpers ---- //

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SealEnd } from "./MarketRowView";

const now = Date.parse("2026-10-12T12:00:00Z");

// ---- Happy path ---- //

describe("SealEnd", () => {
  it("SealEnd_final_minute_shows_a_warning_instead_of_the_rail", () => {
    render(<SealEnd expiresAt={now + 30_000} now={now} />);

    const countdown = screen.getByLabelText("Less than 1 minute remaining");
    expect(countdown.className).toContain("is-expiring");
    expect(countdown.className).not.toContain("is-urgent");
    expect(countdown.querySelector("img")).not.toBeNull();
    expect(countdown.textContent).toContain("<1m");
  });

  it("SealEnd_under_one_hour_keeps_the_coral_rail", () => {
    render(<SealEnd expiresAt={now + 30 * 60_000} now={now} />);

    const countdown = screen.getByText("30m").closest(".market-seal-end");
    expect(countdown?.className).toContain("is-urgent");
    expect(countdown?.querySelector("img")).toBeNull();
  });

  // ---- Edge cases ---- //

  it("SealEnd_expired_listing_keeps_the_rail_without_a_warning", () => {
    render(<SealEnd expiresAt={now} now={now} />);

    const countdown = screen.getByText("Expired").closest(".market-seal-end");
    expect(countdown?.className).toContain("is-urgent");
    expect(countdown?.className).not.toContain("is-expiring");
  });
});
