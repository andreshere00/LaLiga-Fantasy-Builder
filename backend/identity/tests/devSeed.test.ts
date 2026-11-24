import { test } from "node:test";
import assert from "node:assert/strict";
import { assertLocalDatabase, assertMayModifyExisting, assertValidSeedPassword } from "../src/devSeed.js";

const local = "postgresql://u:p@localhost:5432/identity";

test("assertLocalDatabase accepts loopback hosts", () => {
  for (const url of [local, "postgresql://u:p@127.0.0.1/db", "postgresql://u:p@[::1]:5432/db"]) {
    assert.doesNotThrow(() => assertLocalDatabase(url, {}));
  }
});

test("assertLocalDatabase rejects remote hosts and missing or invalid URLs", () => {
  assert.throws(() => assertLocalDatabase("postgresql://u:p@db.example.com/db", {}), /local development/);
  assert.throws(() => assertLocalDatabase(undefined, {}), /IDENTITY_DATABASE_URL/);
  assert.throws(() => assertLocalDatabase("not a url", {}), /valid URL/);
});

test("assertLocalDatabase requires an explicit opt-in for the Compose postgres host", () => {
  const url = "postgresql://u:p@postgres:5432/db";
  assert.throws(() => assertLocalDatabase(url, {}), /ALLOW_DEV_SEED/);
  assert.doesNotThrow(() => assertLocalDatabase(url, { ALLOW_DEV_SEED: "1" }));
});

test("assertLocalDatabase refuses production even for a local host", () => {
  assert.throws(() => assertLocalDatabase(local, { NODE_ENV: "production" }), /production/);
  assert.throws(
    () => assertLocalDatabase("postgresql://u:p@postgres/db", { NODE_ENV: "production", ALLOW_DEV_SEED: "1" }),
    /production/,
  );
});

test("assertMayModifyExisting only allows the default dev user unless forced", () => {
  assert.doesNotThrow(() => assertMayModifyExisting("dev@example.com", {}));
  assert.throws(() => assertMayModifyExisting("someone@gmail.com", {}), /Refusing/);
  assert.doesNotThrow(() => assertMayModifyExisting("someone@gmail.com", { DEV_USER_FORCE: "1" }));
});

test("assertValidSeedPassword applies the Identity password policy", () => {
  assert.doesNotThrow(() => assertValidSeedPassword("k9Vx-2mQ-pLw7-zT", "devuser", "dev@example.com"));
  assert.throws(() => assertValidSeedPassword("abc", "devuser", "dev@example.com"), /at least 12/);
  assert.throws(() => assertValidSeedPassword("devuser-secret-1", "devuser", "dev@example.com"), /username or email/);
  assert.throws(() => assertValidSeedPassword("x7Q".repeat(50), "devuser", "dev@example.com"), /at most 128/);
  assert.throws(() => assertValidSeedPassword("", "devuser", "dev@example.com"), /empty/);
});
