import { afterEach, describe, expect, it } from "vitest";
import { t, i18n, resolveLanguage } from ".";
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
    expect(t("Market")).toBe("Mercado");
    expect(t("Rain")).toBe("Lluvia");
    expect(t("Bid for {{0}}", { 0: "Demo Manager" })).toBe("Pujar por Demo Manager");
    expect(t("Unlisted User Name")).toBe("Unlisted User Name");
  });
  it("uses exact keys without inferring whitespace or message patterns", () => {
    void i18n.changeLanguage("es");
    expect(t("Lineup ")).toBe("Alineación ");
    expect(t(" My bids ")).toBe(" Mis pujas ");
    expect(t("\tSeason\n")).toBe("\tSeason\n");
    expect(t(" Average ")).toBe(" Promedio ");
    expect(t("Average")).toBe("Media");
    expect(t(" Unlisted User Name ")).toBe(" Unlisted User Name ");
    void i18n.changeLanguage("en");
    expect(t("Lineup ")).toBe("Lineup ");
    expect(t(" My bids ")).toBe(" My bids ");
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
  const ts = await import("typescript");
  const root = `${process.cwd()}/src/`;
  const files = readdirSync(root, { recursive: true }).filter((file): file is string => typeof file === "string" && /\.tsx?$/.test(file) && !file.includes(".test."));
  const missing = new Set<string>();
  const check = (node: import("typescript").Node) => {
    if (ts.isStringLiteral(node)) {
      const key = node.text;
      if (!/[A-Za-z]/.test(key)) return;
      const catalogKey = key;
      if (!Object.hasOwn(en, catalogKey) || !Object.hasOwn(es, catalogKey)) missing.add(key);
    } else if (ts.isConditionalExpression(node)) {
      check(node.whenTrue);
      check(node.whenFalse);
    } else if (ts.isBinaryExpression(node)) {
      check(node.left);
      check(node.right);
    } else if (ts.isParenthesizedExpression(node)) {
      check(node.expression);
    }
  };
  const visit = (node: import("typescript").Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "t" && node.arguments[0]) {
      check(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  for (const file of files) {
    visit(ts.createSourceFile(file, readFileSync(root + file, "utf8"), ts.ScriptTarget.Latest, true));
  }
  expect([...missing]).toEqual([]);
});
