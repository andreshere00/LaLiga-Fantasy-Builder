import { Pool } from "pg";
import nodemailer from "nodemailer";
import { createIdentity } from "./auth.js";
import { readConfig } from "./config.js";

export const config = readConfig();
export const pool = new Pool({ connectionString: config.IDENTITY_DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
export const mailer = nodemailer.createTransport({
  host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE === "true",
  requireTLS: config.NODE_ENV === "production" && config.SMTP_SECURE !== "true",
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  connectionTimeout: 10000, socketTimeout: 15000,
});
export const auth = createIdentity(config, pool, async mail => {
  await mailer.sendMail({ ...mail, from: config.MAIL_FROM });
});
