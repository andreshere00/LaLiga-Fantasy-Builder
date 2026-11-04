import { afterEach, describe, expect, it } from "vitest";
import { copy, i18n, resolveLanguage } from ".";
import en from "./en.json";
import es from "./es.json";
import { formatIntegerAmount, parseIntegerAmount } from "../api/format";

afterEach(() => { void i18n.changeLanguage("en"); });
describe("Spanish and English localization", () => {
  it("resolves only supported languages and honors an explicit preference", () => {
    expect(resolveLanguage("es", ["en-GB"])).toBe("es");
    expect(resolveLanguage(null, ["fr", "es-MX"])).toBe("es");
    expect(resolveLanguage("fr", ["de"])).toBe("en");
  });
  it("keeps catalog keys and interpolation parameters in parity", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const key of Object.keys(en)) {
      expect((es[key as keyof typeof es].match(/\{\{\d+\}\}/g) ?? []).sort()).toEqual((key.match(/\{\{\d+\}\}/g) ?? []).sort());
    }
  });
  it("localizes labels and leaves interpolated identities untouched", () => {
    void i18n.changeLanguage("es");
    expect(copy("Market")).toBe("Mercado");
    expect(copy("Rain")).toBe("Lluvia");
    expect(copy("Bid for Demo Manager")).toBe("Pujar por Demo Manager");
    expect(copy("Unlisted User Name")).toBe("Unlisted User Name");
  });
  it("does not reinterpret whole-euro drafts across language changes", () => {
    void i18n.changeLanguage("es");
    const draft = formatIntegerAmount(1234567);
    expect(draft).toBe("1.234.567");
    void i18n.changeLanguage("en");
    expect(formatIntegerAmount(1234567)).toBe("1,234,567");
    expect(parseIntegerAmount(draft)).toBe(1234567);
    expect(parseIntegerAmount("1,234,567")).toBe(1234567);
    for (const invalid of ["1,23", "12.34", "1,234.567", "1e6", "-1", "Infinity"]) expect(parseIntegerAmount(invalid)).toBeNull();
  });
});

it("includes every literal presentation key in both bundled catalogs", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const root = `${process.cwd()}/src/`;
  const files = readdirSync(root, { recursive: true }).filter((file): file is string => typeof file === "string" && file.endsWith(".tsx") && !file.includes(".test."));
  const missing = new Set<string>();
  for (const file of files) {
    const source = readFileSync(root + file, "utf8");
    for (const match of source.matchAll(/\b(?:copy|localizeCopy)\(("(?:[^"\\]|\\.)*")\)/g)) {
      const key: string = JSON.parse(match[1]);
      if (!Object.hasOwn(en, key) || !Object.hasOwn(es, key)) missing.add(key);
    }
  }
  expect([...missing]).toEqual([]);
});
