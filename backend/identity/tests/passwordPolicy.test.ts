import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordIssues } from "../src/passwordPolicy.js";

const personal = ["alice", "alice@example.test"];

test("passwordIssues_longUniquePassword_returnsNoIssues", () => {
  assert.deepEqual(passwordIssues("orange-lamp-river-42", personal), []);
});

test("passwordIssues_shortPassword_reportsLength", () => {
  assert.match(passwordIssues("short1", personal)[0], /at least 12/);
});

test("passwordIssues_commonPasswordWithDigits_reportsCommon", () => {
  assert.match(passwordIssues("password123456", personal)[0], /common/);
});

test("passwordIssues_repeatedCharacters_reportsPattern", () => {
  assert.match(passwordIssues("aaaaaaaaaaaaaa", personal)[0], /repeated/);
});

test("passwordIssues_sequentialCharacters_reportsPattern", () => {
  assert.match(passwordIssues("abcdefghijklmn", personal)[0], /sequential/);
});

test("passwordIssues_containsUsername_reportsPersonalData", () => {
  assert.ok(passwordIssues("Alice-loves-football", personal).includes("Do not include your username or email."));
});

test("passwordIssues_emptyPassword_returnsNoIssues", () => {
  assert.deepEqual(passwordIssues("", personal), []);
});

test("passwordIssues_shortPersonalTerms_areIgnored", () => {
  assert.deepEqual(passwordIssues("tiny-orange-river-42", ["al", ""]), []);
});
