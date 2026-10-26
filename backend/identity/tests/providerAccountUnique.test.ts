import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const databaseURL = process.env.IDENTITY_TEST_DATABASE_URL;
if (!databaseURL) throw new Error("Set IDENTITY_TEST_DATABASE_URL to a disposable PostgreSQL database");

test("one provider identity cannot be linked to two application users", async () => {
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseURL });
  const pool = new Pool({ connectionString: databaseURL, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await readFile(new URL("../migrations/schema.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../migrations/0002_provider_account_unique.sql", import.meta.url), "utf8"));
    for (const id of ["first", "second"]) {
      await pool.query('INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt") VALUES ($1, $1, $2, TRUE, NOW())', [id, `${id}@example.test`]);
    }
    await pool.query('INSERT INTO "account" (id, "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())', ["a1", "provider-subject", "google", "first"]);
    await assert.rejects(
      pool.query('INSERT INTO "account" (id, "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())', ["a2", "provider-subject", "google", "second"]),
      { code: "23505" },
    );
    await pool.query('INSERT INTO "account" (id, "accountId", "providerId", "userId", "updatedAt") VALUES ($1, $2, $3, $4, NOW())', ["a3", "provider-subject", "apple", "second"]);
    const result = await pool.query('SELECT id FROM "account" ORDER BY id');
    assert.deepEqual(result.rows.map(row => row.id), ["a1", "a3"]);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
