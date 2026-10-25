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
  assert.throws(() => readConfig({ ...base, SMTP_PASSWORD: undefined }), /SMTP_USER/);
  assert.throws(() => readConfig({ ...base, SMTP_USER: undefined }), /SMTP_USER/);
});

test("development requires real authenticated mail delivery", () => {
  const development = { ...base, NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" };
  assert.throws(() => readConfig({ ...development, SMTP_USER: undefined,
    SMTP_PASSWORD: undefined }), /authenticated SMTP/);
  assert.throws(() => readConfig({ ...development, SMTP_HOST: "mailpit" }), /authenticated SMTP/);
  assert.throws(() => readConfig({ ...development, MAIL_FROM: "accounts@localhost.test" }), /authenticated SMTP/);
});
