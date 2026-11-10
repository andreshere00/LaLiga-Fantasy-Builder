import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n";
import en from "../../i18n/en.json";
import es from "../../i18n/es.json";
import { widgetDescription, type TeamWidget } from "./teamSummaries";

// ---- Mocks, fixtures & helpers ---- //

afterEach(() => { void i18n.changeLanguage("en"); });

const WIDGETS: TeamWidget[] = [
  "overview", "previous", "upcoming", "mvps", "squad", "hierarchy",
  "starters", "coach", "alternatives", "injuries", "news",
];

describe("widgetDescription", () => {
  // ---- Happy path ---- //

  it("widgetDescription_every_widget_returns_a_short_sentence", () => {
    for (const widget of WIDGETS) {
      const text = widgetDescription(widget);
      expect(text.length).toBeGreaterThan(20);
      expect(text.endsWith(".")).toBe(true);
    }
  });

  it("widgetDescription_is_fixed_text_that_never_carries_a_result", () => {
    for (const widget of WIDGETS) {
      expect(widgetDescription(widget)).not.toMatch(/\d/);
    }
  });

  it("widgetDescription_spanish_translates_every_widget", () => {
    void i18n.changeLanguage("es");
    for (const widget of WIDGETS) {
      const text = widgetDescription(widget);
      expect(text).not.toBe("");
      expect(Object.values(en)).not.toContain(text);
      expect(Object.values(es)).toContain(text);
    }
  });
});
