import { test } from "node:test";
import assert from "node:assert/strict";
import { emailChangeMail, passwordResetMail, verificationMail } from "../src/mailTemplates.js";

test("verification email keeps the code and destination usable in HTML and plain text", () => {
  const mail = verificationMail("12345678", "https://fantasybuilder.es");
  assert.equal(mail.subject, "Verify your email");
  assert.match(mail.text, /12345678/);
  assert.match(mail.html, /12345678/);
  assert.match(mail.text, /https:\/\/fantasybuilder\.es\/verify-email/);
  assert.match(mail.html, /href="https:\/\/fantasybuilder\.es\/verify-email"/);
  assert.match(mail.html, /background:#FF4B44/);
  assert.match(mail.html, /expires in 10 minutes/);
});

test("email change code is sent with the same branded HTML and text fallback", () => {
  const mail = emailChangeMail("87654321");
  assert.match(mail.text, /87654321/);
  assert.match(mail.html, /87654321/);
  assert.match(mail.html, /Account settings/);
  assert.match(mail.html, /expires in 10 minutes/);
});

test("password recovery link is escaped in HTML and preserved in plain text", () => {
  const url = 'https://fantasybuilder.es/reset-password?token=a&next="b"';
  const mail = passwordResetMail(url);
  assert.equal(mail.subject, "Reset your password");
  assert.ok(mail.text.includes(url));
  assert.ok(mail.html.includes('href="https://fantasybuilder.es/reset-password?token=a&amp;next=&quot;b&quot;"'));
  assert.ok(!mail.html.includes('href="https://fantasybuilder.es/reset-password?token=a&next="b""'));
  assert.match(mail.html, /expires in 30 minutes/);
});
