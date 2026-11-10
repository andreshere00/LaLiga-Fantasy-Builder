import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import { predictabilityLabel, rotationsLabel, substituteRiskLabel } from "./teamLineupLabels";

afterEach(() => { void i18n.changeLanguage("en"); });

describe("teamLineupLabels", () => {
  it("predictabilityLabel_published_words_are_translated_with_a_tone", () => {
    expect(predictabilityLabel("Poco previsible")).toEqual({ label: "Hard to predict", tone: "warn" });
    expect(predictabilityLabel("Muy previsible")?.tone).toBe("good");
    expect(predictabilityLabel("Algo nuevo")).toBeNull();
  });
  it("rotationsLabel_known_phrases_only", () => {
    expect(rotationsLabel("Sin rotaciones")).toBe("No rotations");
    expect(rotationsLabel("Muchas rotaciones")).toBe("Many rotations");
    expect(rotationsLabel("Puede rotar a dos jugadores")).toBeNull();
  });
  it("substituteRiskLabel_converts_the_abbreviated_count", () => {
    expect(substituteRiskLabel("2.64 jugs")).toBe("2.64 players");
    expect(substituteRiskLabel("2,5 jug.")).toBe("2.5 players");
    expect(substituteRiskLabel("alto")).toBeNull();
  });
  it("labels_follow_the_selected_language", async () => {
    await i18n.changeLanguage("es");
    expect(rotationsLabel("Sin rotaciones")).toBe("Sin rotaciones");
  });
});
