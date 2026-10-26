import { z } from "zod";

const optionalSecret = z.string().min(1).optional();
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8003),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32),
  IDENTITY_DATABASE_URL: z.url(),
  INTERNAL_JWT_ISSUER: z.url().default("http://localhost:3000/auth"),
  LALIGA_AUTH_URL: z.url().default("http://localhost:8000"),
  SMTP_HOST: z.string().min(1).default("smtp.resend.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.enum(["true", "false"]).default("true"),
  SMTP_USER: optionalSecret,
  SMTP_PASSWORD: optionalSecret,
  MAIL_FROM: z.email().default("noreply@fantasybuilder.es"),
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
  const laligaAuth = new URL(cfg.LALIGA_AUTH_URL);
  if (laligaAuth.origin !== cfg.LALIGA_AUTH_URL || laligaAuth.username || laligaAuth.password) {
    throw new Error("LALIGA_AUTH_URL must be an exact origin without a path");
  }
  for (const keys of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"],
  ] as const) {
    if (keys.some(k => cfg[k]) && keys.some(k => !cfg[k])) {
      throw new Error(`Configure all provider fields: ${keys.join(", ")}`);
    }
  }
  if (Boolean(cfg.SMTP_USER) !== Boolean(cfg.SMTP_PASSWORD)) {
    throw new Error("Configure both SMTP_USER and SMTP_PASSWORD");
  }
  if (cfg.NODE_ENV !== "test" && (
    !cfg.SMTP_USER || !cfg.SMTP_PASSWORD || cfg.MAIL_FROM.endsWith(".test") ||
    ["localhost", "127.0.0.1", "mailpit"].includes(cfg.SMTP_HOST.toLowerCase())
  )) {
    throw new Error("Identity requires authenticated SMTP delivery to a real sender");
  }
  if (cfg.NODE_ENV === "production") {
    if (!env.LALIGA_AUTH_URL) throw new Error("Production identity requires LALIGA_AUTH_URL");
    if (origin.protocol !== "https:" || !cfg.INTERNAL_JWT_ISSUER.startsWith("https://")) {
      throw new Error("Production identity requires HTTPS origin and issuer");
    }
    if (cfg.BETTER_AUTH_SECRET.startsWith("development-")) throw new Error("Replace the development secret");
  }
  return cfg;
}
export type Config = ReturnType<typeof readConfig>;

/** Return only sign-in choices backed by complete server configuration. */
export function signInOptions(cfg: Config) {
  return {
    credentials: true,
    laligaSso: false,
    directProviders: {
      google: Boolean(cfg.GOOGLE_CLIENT_ID),
      facebook: Boolean(cfg.FACEBOOK_CLIENT_ID),
      apple: Boolean(cfg.APPLE_CLIENT_ID),
    },
  };
}
