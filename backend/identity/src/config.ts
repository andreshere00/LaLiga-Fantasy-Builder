import { z } from "zod";

const optionalSecret = z.string().min(1).optional();
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8003),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32),
  IDENTITY_DATABASE_URL: z.url(),
  INTERNAL_JWT_ISSUER: z.url().default("http://localhost:3000/auth"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: optionalSecret,
  SMTP_PASSWORD: optionalSecret,
  MAIL_FROM: z.email().default("accounts@localhost.test"),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  FACEBOOK_CLIENT_ID: optionalSecret,
  FACEBOOK_CLIENT_SECRET: optionalSecret,
  APPLE_CLIENT_ID: optionalSecret,
  APPLE_TEAM_ID: optionalSecret,
  APPLE_KEY_ID: optionalSecret,
  APPLE_PRIVATE_KEY: optionalSecret,
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  // Never include values (which can contain credentials) in configuration errors.
  if (!result.success) throw new Error(`Invalid identity configuration: ${result.error.issues.map(i => i.path.join(".")).join(", ")}`);
  const cfg = result.data;
  const origin = new URL(cfg.BETTER_AUTH_URL);
  if (origin.origin !== cfg.BETTER_AUTH_URL || origin.username || origin.password) {
    throw new Error("BETTER_AUTH_URL must be an exact origin without a path");
  }
  for (const keys of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"],
  ] as const) {
    if ((cfg.NODE_ENV === "production" || keys.some(k => cfg[k])) && keys.some(k => !cfg[k])) {
      throw new Error(`Configure all provider fields: ${keys.join(", ")}`);
    }
  }
  if (cfg.NODE_ENV === "production") {
    if (origin.protocol !== "https:" || !cfg.INTERNAL_JWT_ISSUER.startsWith("https://")) {
      throw new Error("Production identity requires HTTPS origin and issuer");
    }
    if (!cfg.SMTP_USER || !cfg.SMTP_PASSWORD || cfg.MAIL_FROM.endsWith(".test")) {
      throw new Error("Production requires an authenticated mail transport and sender");
    }
    if (cfg.BETTER_AUTH_SECRET.startsWith("development-")) throw new Error("Replace the development secret");
  }
  return cfg;
}
export type Config = ReturnType<typeof readConfig>;
