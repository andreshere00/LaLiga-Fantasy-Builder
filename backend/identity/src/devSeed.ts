import { passwordIssues } from "./passwordPolicy.js";

export const DEFAULT_DEV_EMAIL = "dev@example.com";
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const PASSWORD_MAX_LENGTH = 128;

/**
 * Refuse any database that is not a local development one.
 *
 * Loopback hosts are always accepted. The Compose service name `postgres` is also
 * the hostname on the deployed VM, so it needs an explicit `ALLOW_DEV_SEED=1`.
 */
export function assertLocalDatabase(databaseURL: string | undefined, env: NodeJS.ProcessEnv): void {
  if (!databaseURL) throw new Error("Set IDENTITY_DATABASE_URL (see backend/identity/.env.example)");
  if (env.NODE_ENV === "production") throw new Error("seed:dev-user refuses NODE_ENV=production");
  let host: string;
  try {
    host = new URL(databaseURL).hostname.toLowerCase();
  } catch {
    throw new Error("IDENTITY_DATABASE_URL is not a valid URL");
  }
  // node-postgres lets these query parameters (and multi-host URLs) override the hostname.
  const params = new URL(databaseURL).searchParams;
  if (params.has("host") || params.has("hostaddr") || (databaseURL.split("@").pop() ?? "").split("/")[0]?.includes(",")) {
    throw new Error("seed:dev-user refuses database URLs that override the host (host, hostaddr or several hosts)");
  }
  if (LOOPBACK_HOSTS.includes(host)) return;
  if (host === "postgres" && env.ALLOW_DEV_SEED === "1") return;
  throw new Error(
    "seed:dev-user only runs against a local development database "
    + "(set ALLOW_DEV_SEED=1 to use the Compose `postgres` host)",
  );
}

/** Refuse to reset an existing account unless it is the default dev user or forced. */
export function assertMayModifyExisting(email: string, env: NodeJS.ProcessEnv): void {
  if (email === DEFAULT_DEV_EMAIL || env.DEV_USER_FORCE === "1") return;
  throw new Error(
    `Refusing to modify existing user ${email}; set DEV_USER_FORCE=1 to reset a non-default account`,
  );
}

/** Apply the Identity password policy to the seeded password before any write. */
export function assertValidSeedPassword(password: string, username: string, email: string): void {
  const issues = passwordIssues(password, [username, email]);
  if (!password) issues.push("Password must not be empty.");
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (issues.length) throw new Error(`Invalid DEV_USER_PASSWORD: ${issues.join(" ")}`);
}
