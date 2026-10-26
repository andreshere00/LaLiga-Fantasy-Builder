import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth, config, mailer, pool } from "./runtime.js";
import { signInOptions } from "./config.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.get("/health/live", (_req, res) => { res.json({ status: "ok" }); });
const MAIL_CHECK_TTL_MS = 60_000;
let mailCheckedAt = 0;
app.get("/health/ready", async (_req, res) => {
  try {
    await pool.query('SELECT 1 FROM "user" LIMIT 1');
    if (Date.now() - mailCheckedAt > MAIL_CHECK_TTL_MS) {
      await mailer.verify();
      mailCheckedAt = Date.now();
    }
    res.json({ status: "ok" });
  } catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/auth/sign-in-options", (_req, res) => { res.json(signInOptions(config)); });
// Express must not parse the body before Better Auth reads it (including Apple POST callbacks).
app.all("/auth/{*path}", toNodeHandler(auth));
const server = app.listen(config.PORT, "0.0.0.0");
server.requestTimeout = 30000;
server.headersTimeout = 15000;
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  server.close(() => { void pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
});
