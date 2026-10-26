// ---- Mocks, fixtures & helpers ---- //
import { expect, it } from "vitest";
import { passwordIssues } from "./passwordPolicy";

const PERSONAL: string[] = ["alice", "alice@example.test"];

// ---- Happy path ---- //
it("passwordIssues_longUniquePassword_returnsNoIssues", () => {
  expect(passwordIssues("orange-lamp-river-42", PERSONAL)).toEqual([]);
});

// ---- Error paths ---- //
it("passwordIssues_shortPassword_reportsLength", () => {
  expect(passwordIssues("short1", PERSONAL)[0]).toContain("at least 12");
});

it("passwordIssues_commonPasswordWithDigits_reportsCommon", () => {
  expect(passwordIssues("password123456", PERSONAL)[0]).toContain("common");
});

it("passwordIssues_repeatedCharacters_reportsPattern", () => {
  expect(passwordIssues("aaaaaaaaaaaaaa", PERSONAL)[0]).toContain("repeated");
});

it("passwordIssues_sequentialCharacters_reportsPattern", () => {
  expect(passwordIssues("abcdefghijklmn", PERSONAL)[0]).toContain("sequential");
});

it("passwordIssues_containsUsername_reportsPersonalData", () => {
  expect(passwordIssues("Alice-loves-football", PERSONAL)).toContain(
    "Do not include your username or email.",
  );
});

// ---- Edge cases ---- //
it("passwordIssues_emptyPassword_returnsNoIssues", () => {
  expect(passwordIssues("", PERSONAL)).toEqual([]);
});

it("passwordIssues_shortPersonalTerms_areIgnored", () => {
  expect(passwordIssues("tiny-orange-river-42", ["al", ""])).toEqual([]);
});
