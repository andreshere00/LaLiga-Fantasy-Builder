import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createIdentity } from "./auth.js";
import { readConfig } from "./config.js";

/**
 * Create (or reset) a verified mock user for local development.
 *
 * Mail is never sent and no SMTP settings are needed. Refuses to run against a
 * non-local database or with NODE_ENV=production.
 */
const email = (process.env.DEV_USER_EMAIL ?? "dev@example.com").trim().toLowerCase();
const username = (process.env.DEV_USER_USERNAME ?? "devuser").trim().toLowerCase();
const name = process.env.DEV_USER_NAME ?? "Dev User";
const generated = !process.env.DEV_USER_PASSWORD;
const password = process.env.DEV_USER_PASSWORD ?? randomBytes(12).toString("hex");

const databaseURL = process.env.IDENTITY_DATABASE_URL;
if (!databaseURL) throw new Error("Set IDENTITY_DATABASE_URL (see backend/identity/.env.example)");
const host = new URL(databaseURL).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]", "postgres"].includes(host) || process.env.NODE_ENV === "production") {
  throw new Error("seed:dev-user only runs against a local development database");
}

// NODE_ENV=test skips the real-SMTP requirement; the mail callback below drops all mail.
const config = readConfig({
  ...process.env, NODE_ENV: "test", SMTP_USER: undefined, SMTP_PASSWORD: undefined,
} as NodeJS.ProcessEnv);
const pool = new Pool({ connectionString: databaseURL, max: 2, connectionTimeoutMillis: 5000 });
const auth = createIdentity(config, pool, async () => {});

try {
  const existing = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  if (!existing.rowCount) {
    await auth.api.signUpEmail({ body: { email, password, name, username } as never });
  } else {
    const context = await auth.$context;
    await context.internalAdapter.updatePassword(existing.rows[0].id, await context.password.hash(password));
  }
  await pool.query('UPDATE "user" SET "emailVerified" = true WHERE email = $1', [email]);
  console.log(`Dev user ready: ${email} (username ${username}), email verified.`);
  console.log(generated ? `Password: ${password}` : "Password: the DEV_USER_PASSWORD you supplied.");
} finally {
  await pool.end();
}
