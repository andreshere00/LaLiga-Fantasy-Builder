import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, signInOptions } from "../src/config.js";

const base = {
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://example.test",
  INTERNAL_JWT_ISSUER: "https://example.test/auth",
  BETTER_AUTH_SECRET: "x".repeat(32),
  IDENTITY_DATABASE_URL: "postgresql://identity:fixture@localhost:5432/identity",
  SMTP_USER: "mailer",
  SMTP_PASSWORD: "fixture",
  MAIL_FROM: "accounts@example.com",
};

test("production accepts credentials without direct social providers", () => {
  const config = readConfig(base);
  assert.deepEqual(signInOptions(config), {
    credentials: true,
    laligaSso: false,
    directProviders: { google: false, facebook: false, apple: false },
  });
});

test("each optional provider needs complete credentials before it is offered", () => {
  assert.throws(() => readConfig({ ...base, GOOGLE_CLIENT_ID: "partial" }), /provider/);
  const config = readConfig({ ...base, GOOGLE_CLIENT_ID: "google-fixture",
    GOOGLE_CLIENT_SECRET: "secret" });
  assert.deepEqual(signInOptions(config).directProviders,
    { google: true, facebook: false, apple: false });
});

test("production still requires HTTPS and authenticated mail", () => {
  assert.throws(() => readConfig({ ...base, BETTER_AUTH_URL: "http://example.test" }), /HTTPS/);
  assert.throws(() => readConfig({ ...base, SMTP_PASSWORD: undefined }), /mail transport/);
});
