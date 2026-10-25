import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { readConfig } from "./config.js";
const pool = new Pool({ connectionString: readConfig().IDENTITY_DATABASE_URL, connectionTimeoutMillis: 5000 });

const sql = await readFile(new URL("../migrations/schema.sql", import.meta.url), "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(17394003)");
  await client.query("CREATE TABLE IF NOT EXISTS identity_migrations (version text PRIMARY KEY, checksum text NOT NULL)");
  const previous = await client.query("SELECT checksum FROM identity_migrations WHERE version = '0001'");
  if (previous.rowCount) {
    if (previous.rows[0].checksum !== checksum) throw new Error("Applied identity migration checksum mismatch");
  } else {
    await client.query(sql);
    await client.query("INSERT INTO identity_migrations VALUES ('0001', $1)", [checksum]);
  }
  await client.query("COMMIT");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); await pool.end(); }
