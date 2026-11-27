// ---- Mocks, fixtures & helpers ---- //
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import type { PlayerRow } from "./model/playerRow";
import { applyPlayersFilters, ownerLabel } from "./playersFilters";
import { createEmptyPlayersFilters } from "./playersSearchParams";

function row(name: string, ownedBy: string): PlayerRow {
  return {
    playerId: name, name, teamName: "Club", positionId: 3, photoUrl: null, teamBadgeUrl: null,
    points: null, form: null, formRecent: [], formRecentWeeks: [], averagePoints: null,
    marketValue: null, availability: "available", ownedBy, ownerTeamId: null, ownership: null,
  };
}

const rows = [row("Free", "Free Agent"), row("Owned", "Unavailable Manager")];

afterEach(() => { void i18n.changeLanguage("en"); });

describe("players owner filters", () => {
  // ---- Happy path ---- //
  it("ownerLabel_spanishPlaceholder_isTranslated", () => {
    void i18n.changeLanguage("es");

    expect(ownerLabel("Free Agent")).toBe("Agente libre");
  });

  it("applyPlayersFilters_spanishFreeAgentQuery_matchesFreeAgents", () => {
    void i18n.changeLanguage("es");

    const matches = applyPlayersFilters(rows, { ...createEmptyPlayersFilters(), query: "agente libre" });

    expect(matches.map((match) => match.name)).toEqual(["Free"]);
  });

  it("applyPlayersFilters_englishOwnerFilter_stillMatchesInSpanish", () => {
    void i18n.changeLanguage("es");

    const matches = applyPlayersFilters(rows, { ...createEmptyPlayersFilters(), owner: "Free Agent" });

    expect(matches.map((match) => match.name)).toEqual(["Free"]);
  });

  // ---- Edge cases ---- //
  it("ownerLabel_managerName_staysVerbatim", () => {
    void i18n.changeLanguage("es");

    expect(ownerLabel("Unavailable Manager")).toBe("Unavailable Manager");
  });
});
