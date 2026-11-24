import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createIdentity } from "./auth.js";
import { readConfig } from "./config.js";
import {
  assertLocalDatabase, assertMayModifyExisting, assertValidSeedPassword, DEFAULT_DEV_EMAIL,
} from "./devSeed.js";

/**
 * Create (or reset) a verified mock user for local development.
 *
 * Mail is never sent and no SMTP settings are needed. Refuses to run against a
 * non-local database or with NODE_ENV=production, and refuses to reset any existing
 * account other than the default dev user unless DEV_USER_FORCE=1.
 */
const email = (process.env.DEV_USER_EMAIL ?? DEFAULT_DEV_EMAIL).trim().toLowerCase();
const username = (process.env.DEV_USER_USERNAME ?? "devuser").trim().toLowerCase();
const name = process.env.DEV_USER_NAME ?? "Dev User";
const generated = !process.env.DEV_USER_PASSWORD;
const password = process.env.DEV_USER_PASSWORD ?? randomBytes(12).toString("hex");

const databaseURL = process.env.IDENTITY_DATABASE_URL;
assertLocalDatabase(databaseURL, process.env);
assertValidSeedPassword(password, username, email);

// The mail callback below drops all mail, so the real-SMTP requirement is skipped.
const config = readConfig(
  { ...process.env, SMTP_USER: undefined, SMTP_PASSWORD: undefined } as NodeJS.ProcessEnv,
  { skipSmtp: true },
);
const pool = new Pool({ connectionString: databaseURL, max: 2, connectionTimeoutMillis: 5000 });
const auth = createIdentity(config, pool, async () => {});

try {
  const context = await auth.$context;
  const existing = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  if (!existing.rowCount) {
    const created = await auth.api.signUpEmail({ body: { email, password, name, username } as never });
    try {
      await pool.query('UPDATE "user" SET "emailVerified" = true WHERE id = $1', [created.user.id]);
    } catch (error) {
      // Do not leave an unverified half-created user behind.
      await context.internalAdapter.deleteUser(created.user.id);
      throw error;
    }
  } else {
    assertMayModifyExisting(email, process.env);
    const id = existing.rows[0].id as string;
    const hash = await context.password.hash(password);
    const credential = await pool.query(
      'SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = $2', [id, "credential"],
    );
    if (credential.rowCount) {
      await context.internalAdapter.updatePassword(id, hash);
    } else {
      await context.internalAdapter.linkAccount({
        userId: id, providerId: "credential", accountId: id, password: hash,
      });
    }
    await pool.query(
      'UPDATE "user" SET "emailVerified" = true, name = $2, username = $3, "displayUsername" = $3 WHERE id = $1',
      [id, name, username],
    );
  }
  console.log(`Dev user ready: ${email} (username ${username}), email verified.`);
  console.log(generated ? `Password: ${password}` : "Password: the DEV_USER_PASSWORD you supplied.");
} finally {
  await pool.end();
}
