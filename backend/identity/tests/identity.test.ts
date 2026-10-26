import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createIdentity, type Mail } from "../src/auth.js";
import { readConfig } from "../src/config.js";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";

const databaseURL = process.env.IDENTITY_TEST_DATABASE_URL;
if (!databaseURL) throw new Error("Set IDENTITY_TEST_DATABASE_URL to a disposable PostgreSQL database");
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: databaseURL });
const pool = new Pool({ connectionString: databaseURL, options: `-c search_path=${schema}` });
const outbox: Mail[] = [];
const appleKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = readConfig({ GOOGLE_CLIENT_ID: "google-fixture", GOOGLE_CLIENT_SECRET: "fixture", FACEBOOK_CLIENT_ID: "facebook-fixture", FACEBOOK_CLIENT_SECRET: "fixture", APPLE_CLIENT_ID: "apple-fixture", APPLE_TEAM_ID: "team-fixture", APPLE_KEY_ID: "apple-key", APPLE_PRIVATE_KEY: appleKey, NODE_ENV: "test", BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters", IDENTITY_DATABASE_URL: databaseURL });
let auth: ReturnType<typeof createIdentity>;
let disconnectLaliga: (token: string) => Promise<void> = async () => {};
const origin = "http://localhost:3000";
let cookie = "";
async function request(path: string, body?: unknown, session = cookie, extra: Record<string, string> = {}) {
  return auth.handler(new Request(`${origin}/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Real-IP": "192.0.2.8", "Content-Type": "application/json", Origin: origin, Cookie: session, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  }));
}
function sessionCookie(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}
function latestLink() {
  const match = outbox.at(-1)?.text.match(/https?:\/\/[^\s]+/);
  assert.ok(match); return match[0];
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(new URL("../migrations/schema.sql", import.meta.url), "utf8"));
  auth = createIdentity(config, pool, async mail => { outbox.push(mail); }, token => disconnectLaliga(token));
});
after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });

test("account settings verify email changes and block deletion until LaLiga is disconnected", async () => {
  const email = "settings@example.test";
  const password = "orange-lamp-river-12345";
  let response = await request("/sign-up/email", { name: "Settings", username: "settings", email, password }, "");
  assert.equal(response.status, 200);
  const signupCode = outbox.at(-1)!.text.match(/code is ([0-9]{8})/)![1];
  assert.equal((await request("/email-otp/verify-email", { email, otp: signupCode }, "")).status, 200);
  response = await request("/sign-in/email", { email, password }, "");
  assert.equal(response.status, 200);
  const settingsCookie = sessionCookie(response);

  response = await request("/update-user", { username: "updated_settings" }, settingsCookie);
  assert.equal(response.status, 200);
  const session = await (await request("/get-session", undefined, settingsCookie)).json();
  assert.equal(session.user.username, "updated_settings");

  const newEmail = "updated-settings@example.test";
  response = await request("/email-otp/request-email-change", { newEmail }, settingsCookie);
  assert.equal(response.status, 200);
  const changeCode = outbox.at(-1)!.text.match(/code is ([0-9]{8})/)![1];
  assert.equal(outbox.at(-1)!.to, newEmail);
  assert.equal((await request("/get-session", undefined, settingsCookie)).status, 200);
  response = await request("/email-otp/change-email", { newEmail, otp: "00000000" }, settingsCookie);
  assert.ok(response.status >= 400);
  response = await request("/email-otp/change-email", { newEmail, otp: changeCode }, settingsCookie);
  assert.equal(response.status, 200);
  assert.equal((await (await request("/get-session", undefined, settingsCookie)).json()).user.email, newEmail);

  disconnectLaliga = async () => { throw new Error("unavailable"); };
  response = await request("/delete-user", { password }, settingsCookie);
  assert.ok(response.status >= 400);
  assert.ok((await (await request("/get-session", undefined, settingsCookie)).json()).user);

  let disconnectedSubject = "";
  disconnectLaliga = async token => { disconnectedSubject = decodeJwt(token).sub ?? ""; };
  response = await request("/delete-user", { password }, settingsCookie);
  assert.equal(response.status, 200);
  assert.equal(disconnectedSubject, session.user.id);
  assert.equal(await (await request("/get-session", undefined, settingsCookie)).json(), null);
  disconnectLaliga = async () => {};
});

test("verified credentials, username, real Ed25519 JWT, recovery, revocation and isolation", async () => {
  const email = "alice@example.test";
  const password = "a-long-fixture-password-123";
  let response = await request("/sign-up/email", { name: "Alice", username: "ALICE", email, password });
  assert.equal(response.status, 200);

  response = await request("/sign-in/username", { username: "alice", password });
  assert.equal(response.status, 403);
  response = await request("/sign-in/email", { email, password });
  assert.equal(response.status, 403);
  const otp = outbox.at(-1)!.text.match(/code is ([0-9]{8})/)![1];
  assert.ok(outbox.at(-1)!.html.includes(otp));
  response = await request("/email-otp/verify-email", { email, otp }, "");
  assert.ok(response.status < 400);
  assert.ok((await request("/email-otp/verify-email", { email, otp }, "")).status >= 400);
  response = await request("/sign-in/username", { username: "ALICE", password });
  assert.equal(response.status, 200);
  cookie = sessionCookie(response);
  assert.ok(cookie.includes("session_token"));
  const sessionResponse = await request("/get-session");
  const session = await sessionResponse.json();
  assert.equal(session.user.username, "alice");
  assert.equal(session.user.emailVerified, true);
  response = await request("/token");
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const jwks = await (await request("/jwks")).json();
  const verified = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: config.INTERNAL_JWT_ISSUER, audience: "fantasy-api", algorithms: ["EdDSA"] });
  assert.equal(verified.payload.sub, session.user.id);
  assert.equal(verified.payload.exp! - verified.payload.iat!, 900);
  assert.equal(verified.payload.email, undefined);
  if (process.env.IDENTITY_INTEROP_OUTPUT) await writeFile(process.env.IDENTITY_INTEROP_OUTPUT, JSON.stringify({ token, jwks, subject: session.user.id }));
  response = await request("/get-access-token", { providerId: "google" });
  assert.equal(response.status, 404);
  response = await request("/sign-out", {}, cookie, { Origin: "https://attacker.test" });
  assert.equal(response.status, 403);
  response = await request("/unlink-account", { accountId: "credential" });
  assert.equal(response.status, 400);
  // No implicit cross-account linking, no stale-session linking, and no sliding renewal.
  assert.equal(auth.options.account?.accountLinking?.disableImplicitLinking, true);
  await pool.query('UPDATE "session" SET "createdAt" = NOW() - INTERVAL \'11 minutes\'');
  response = await request("/link-social", { provider: "google" });
  assert.equal(response.status, 401);
  const oldCookie = cookie;
  response = await request("/request-password-reset", { email, redirectTo: "/reset-password" }, "");
  assert.equal(response.status, 200);
  assert.match(outbox.at(-1)!.html, /Reset password/);
  const resetURL = latestLink();
  const redirect = await auth.handler(new Request(resetURL));
  const resetToken = new URL(redirect.headers.get("location")!, origin).searchParams.get("token");
  assert.ok(resetToken);
  response = await request("/reset-password", { token: resetToken, newPassword: "replacement-fixture-password-456" }, "");
  assert.equal(response.status, 200);
  response = await request("/reset-password", { token: resetToken, newPassword: "replayed-fixture-password-789" }, "");
  assert.ok(response.status >= 400);
  assert.equal(await (await request("/get-session", undefined, oldCookie)).json(), null);
  assert.equal((await request("/token", undefined, oldCookie)).status, 401);
  // Session revocation deliberately does not revoke an already issued API JWT.
  await jwtVerify(token, createLocalJWKSet(jwks));
  response = await request("/sign-in/email", { email, password: "replacement-fixture-password-456" }, "");
  assert.equal(response.status, 200);
  cookie = sessionCookie(response);
  await request("/sign-out", {});
  assert.equal(await (await request("/get-session")).json(), null);
});

test("provider callbacks bind state, preserve stable accounts, reject replay and require explicit linking", async () => {
  const context = await auth.$context;
  // Mock only the external provider exchange/profile boundary. Better Auth owns state,
  // callback processing, account resolution, session creation and encrypted persistence.
  let profile: Record<string, unknown> = {};
  for (const provider of context.socialProviders) {
    provider.validateAuthorizationCode = async input => {
      assert.ok(input.codeVerifier);
      assert.ok(input.redirectURI.endsWith(`/auth/callback/${provider.id}`));
      if (input.code !== "fixture-code") throw new Error("provider denied");
      return { accessToken: "provider-secret", refreshToken: "provider-refresh", scopes: ["email"] };
    };
    provider.getUserInfo = async () => ({
      user: { name: profile.name, email: profile.email, emailVerified: true,
        ...await provider.options.mapProfileToUser?.(profile) }, data: profile,
    });
  }
  async function social(provider: string, session = "", link = false, callbackError?: string) {
    const start = await request(link ? "/link-social" : "/sign-in/social", {
      provider, callbackURL: "/", errorCallbackURL: "/sign-in", disableRedirect: true,
    }, session);
    assert.equal(start.status, 200, await start.clone().text());
    const url = new URL((await start.json()).url);
    const state = url.searchParams.get("state");
    assert.ok(state);
    const callbackURL = `${origin}/auth/callback/${provider}?state=${state}&${callbackError ? `error=${callbackError}` : "code=fixture-code"}`;
    const cookies = `${session}; ${sessionCookie(start)}`;
    const result = await auth.handler(new Request(callbackURL, { headers: { Cookie: cookies, "X-Real-IP": "192.0.2.9" } }));
    return { result, callbackURL, cookies };
  }
  for (const provider of ["google", "facebook", "apple"]) {
    profile = { id: `${provider}-id`, sub: `${provider}-id`, name: `${provider} person`, email: `${provider}@example.test` };
    const first = await social(provider);
    assert.equal(first.result.headers.get("location"), "/");
    const savedSession = await (await request("/get-session", undefined, sessionCookie(first.result))).json();
    assert.ok(savedSession.user.id);
    const replay = await auth.handler(new Request(first.callbackURL, { headers: { Cookie: first.cookies } }));
    assert.match(replay.headers.get("location")!, /error=/);
    const stored = await pool.query('SELECT "accessToken" FROM "account" WHERE "providerId" = $1', [provider]);
    assert.notEqual(stored.rows[0].accessToken, "provider-secret");
    // Returning providers may omit email and first-login profile; resolve by provider ID.
    profile = { id: `${provider}-id`, sub: `${provider}-id` };
    const returning = await social(provider);
    const returningSession = await (await request("/get-session", undefined, sessionCookie(returning.result))).json();
    assert.equal(returningSession.user.id, savedSession.user.id);
    assert.equal(returningSession.user.name, `${provider} person`);
  }
  profile = { id: "new-facebook", sub: "new-facebook", name: "No email" };
  const missing = await social("facebook");
  assert.match(missing.result.headers.get("location")!, /email_not_found/);
  profile = { id: "collision", sub: "collision", email: "alice@example.test", name: "Collision" };
  const collision = await social("google");
  assert.match(collision.result.headers.get("location")!, /account_not_linked/);
  const denied = await social("facebook", "", false, "access_denied");
  assert.match(denied.result.headers.get("location")!, /access_denied/);
  const login = await request("/sign-in/email", { email: "alice@example.test", password: "replacement-fixture-password-456" }, "");
  assert.equal(login.status, 200);
  const aliceCookie = sessionCookie(login);
  const alice = await (await request("/get-session", undefined, aliceCookie)).json();
  profile = { id: "explicit-different-email", sub: "explicit-different-email", name: "Relay", email: "relay@example.test" };
  const linked = await social("google", aliceCookie, true);
  assert.equal(linked.result.headers.get("location"), "/");
  const linkedAccount = await pool.query('SELECT "userId" FROM "account" WHERE "accountId" = $1', ["explicit-different-email"]);
  assert.equal(linkedAccount.rows[0].userId, alice.user.id);
});

test("credential enrollment requires recovery proof and expired sessions cannot issue tokens", async () => {
  const response = await request("/request-password-reset", { email: "apple@example.test", redirectTo: "/reset-password" }, "");
  assert.equal(response.status, 200);
  const redirect = await auth.handler(new Request(latestLink()));
  const resetToken = new URL(redirect.headers.get("location")!, origin).searchParams.get("token");
  assert.ok(resetToken);
  const password = "social-enrollment-password-123";
  assert.equal((await request("/reset-password", { token: "forged", newPassword: password }, "")).status, 400);
  assert.equal((await request("/reset-password", { token: resetToken, newPassword: password }, "")).status, 200);
  const login = await request("/sign-in/email", { email: "apple@example.test", password }, "");
  assert.equal(login.status, 200);
  const enrolledCookie = sessionCookie(login);
  const enrolled = await (await request("/get-session", undefined, enrolledCookie)).json();
  const providers = await pool.query('SELECT "providerId" FROM "account" WHERE "userId" = $1', [enrolled.user.id]);
  assert.deepEqual(providers.rows.map(row => row.providerId).sort(), ["apple", "credential"]);
  await pool.query('UPDATE "session" SET "expiresAt" = NOW() - INTERVAL \'1 second\' WHERE "userId" = $1', [enrolled.user.id]);
  assert.equal((await request("/token", undefined, enrolledCookie)).status, 401);
});

test("weak passwords are rejected by sign-up and reset endpoints", async () => {
  const weak = { name: "Weak", username: "weakling", email: "weak@example.test" };
  for (const password of ["short1", "password123456", "aaaaaaaaaaaaaa", "weakling-is-here-1"]) {
    const response = await request("/sign-up/email", { ...weak, password }, "", { "X-Real-IP": "192.0.2.77" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "WEAK_PASSWORD");
  }
  const other = { "X-Real-IP": "192.0.2.78" };
  const reset = await request("/reset-password", { token: "forged", newPassword: "abcdefghijklmn" }, "", other);
  assert.equal((await reset.json()).code, "WEAK_PASSWORD");
});

test("verification expiry, username uniqueness, wrong passwords and shared rate limits fail closed", async () => {
  await pool.query('DELETE FROM "rateLimit"');
  const email = "expiry@example.test";
  const password = "stale-fixture-password-123";
  assert.equal((await request("/sign-up/email", { email, password, name: "Expiry", username: "expiry" }, "")).status, 200);
  const otp = outbox.at(-1)!.text.match(/code is ([0-9]{8})/)![1];
  await pool.query('UPDATE "verification" SET "expiresAt" = NOW() - INTERVAL \'1 second\'');
  assert.ok((await request("/email-otp/verify-email", { email, otp }, "")).status >= 400);
  const account = await pool.query('SELECT "emailVerified" FROM "user" WHERE email = $1', [email]);
  assert.equal(account.rows[0].emailVerified, false);
  const sentBeforeRetry = outbox.length;
  const retry = await request("/send-verification-email", { email, callbackURL: "/verify-email" }, "");
  assert.equal(retry.status, 200);
  assert.equal(outbox.length, sentBeforeRetry + 1);
  assert.match(outbox.at(-1)!.text, /code is [0-9]{8}/);
  assert.ok((await request("/sign-up/email", { email: "other@example.test", password, name: "Other", username: "EXPIRY" }, "")).status >= 400);
  assert.equal((await request("/sign-in/email", { email: "alice@example.test", password: "wrong-password-123" }, "")).status, 401);
  const secondWorker = createIdentity(config, pool, async mail => { outbox.push(mail); });
  let limited = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const worker = attempt % 2 ? auth : secondWorker;
    const response = await worker.handler(new Request(`${origin}/auth/sign-in/email`, {
      method: "POST", headers: { "X-Real-IP": "192.0.2.77", "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: "nobody@example.test", password: "incorrect-password-123" }),
    }));
    if (response.status === 429) { limited = true; break; }
  }
  assert.equal(limited, true, "database rate limits must apply across identity workers");
});

test("mail transport failure cannot create a verified account or authenticated session", async () => {
  const failingMailer = createIdentity(config, pool, async () => { throw new Error("synthetic SMTP failure"); });
  const response = await failingMailer.handler(new Request(`${origin}/auth/sign-up/email`, {
    method: "POST", headers: { "X-Real-IP": "192.0.2.88", "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: "mail-failure@example.test", password: "transport-fixture-password-123", name: "Mail", username: "mail_failure" }),
  }));
  // Verification delivery is deliberately non-fatal in Better Auth; the account
  // remains unverified and the user can retry delivery from /verify-email.
  assert.equal(response.status, 200);
  assert.equal(sessionCookie(response).includes("session_token="), false);
  const account = await pool.query('SELECT "emailVerified" FROM "user" WHERE email = $1', ["mail-failure@example.test"]);
  assert.ok(account.rows.length === 0 || account.rows[0].emailVerified === false);
});
