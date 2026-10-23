import { describe, expect, it } from "vitest";
import { badgeSources, clubMediaFromFixture, competitionMedia, fixtureClubMedia } from "./clubMedia";

describe("badge source resolution", () => {
  it.each(["CEL", "Celta", "MLG", "Malaga FC", "Elche", "Rayo", "Liverpool", "Celtic"])("resolves %s with a local fallback", (name) => {
    const media = clubMediaFromFixture(name);
    expect(media).not.toBeNull();
    expect([media?.badge, ...(media?.fallbackBadges ?? [])].some((url) => url?.startsWith("/badges/football-logos/"))).toBe(true);
  });
  it("prefers published API media then the catalog and local fallback", () => {
    const media = fixtureClubMedia({ homeTeam: "CEL", homeBadge: "https://example.com/api.png" }, "home");
    expect(media?.badge).toBe("https://example.com/api.png");
    expect(media?.fallbackBadges?.at(-1)).toBe("/badges/football-logos/spain-celta.png");
  });
  it("resolves Champions League aliases without guessing unknown competitions", () => {
    expect(competitionMedia({ competition: "champions_league" })?.badge).toContain("uefa-champions-league");
    expect(competitionMedia({ competitionLabel: "UCL" })?.badge).toContain("uefa-champions-league");
    expect(competitionMedia({ competition: "other" })).toBeNull();
    expect(clubMediaFromFixture("Unknown FC")).toBeNull();
  });
  it("deduplicates sources and rejects unsafe and arbitrary local paths", () => {
    expect(badgeSources("javascript:alert(1)", "/auth/token", "https://example.com/a.png", "https://example.com/a.png"))
      .toEqual(["https://example.com/a.png"]);
  });
});
