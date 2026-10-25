import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { emailOTP, jwt, username } from "better-auth/plugins";
import { decodeJwt, importPKCS8, SignJWT } from "jose";
import { z } from "zod";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { emailChangeMail, passwordResetMail, verificationMail, type MailContent } from "./mailTemplates.js";

export type Mail = MailContent & { to: string };
export type SendMail = (mail: Mail) => Promise<void>;
export type DisconnectLaliga = (token: string) => Promise<void>;

export function createIdentity(cfg: Config, database: Pool, send: SendMail, disconnectLaliga: DisconnectLaliga = async token => {
  const response = await fetch(`${cfg.LALIGA_AUTH_URL}/laliga/connection`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("LaLiga connection removal failed");
}) {
  // Provider IDs are trusted only after the framework validates the provider response.
  // Reuse an existing account's profile if a returning provider omits email/name.
  const returningProfile = (provider: string) => async (profile: { id?: unknown; sub?: unknown; email?: unknown; name?: unknown }) => {
    const subject = provider === "facebook" ? profile.id : profile.sub;
    if (typeof subject !== "string" || !subject || (profile.email && profile.name)) return {};
    const result = await database.query(
      'SELECT u.email, u.name FROM "account" a JOIN "user" u ON u.id = a."userId" WHERE a."providerId" = $1 AND a."accountId" = $2', [provider, subject],
    );
    const saved = result.rows[0] as { email: string; name: string } | undefined;
    return saved ? { ...(!profile.email ? { email: saved.email } : {}), ...(!profile.name ? { name: saved.name } : {}) } : {};
  };
  const auth = betterAuth({
    appName: "LaLiga Fantasy Builder",
    // Framework error objects can contain OAuth state or provider response bodies.
    logger: { level: "warn", log: level => { console.warn(JSON.stringify({ service: "identity", event: "auth_event", level })); } },
    baseURL: cfg.BETTER_AUTH_URL,
    basePath: "/auth",
    secret: cfg.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [cfg.BETTER_AUTH_URL, ...(cfg.APPLE_CLIENT_ID ? ["https://appleid.apple.com"] : [])],
    advanced: {
      useSecureCookies: cfg.BETTER_AUTH_URL.startsWith("https://"),
      trustedProxyHeaders: false,
      // Only the trusted ingress may reach this service; it replaces this header.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    session: {
      expiresIn: 86400,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      freshAge: 600,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await send({ to: user.email, ...passwordResetMail(url) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,

    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user, request) => {
          if (!request) throw new Error("Account deletion requires an authenticated request");
          const response = await auth.handler(new Request(`${cfg.BETTER_AUTH_URL}/auth/token`, { headers: request.headers }));
          if (!response.ok) throw new Error("Account deletion requires an application token");
          const { token } = z.object({ token: z.string().min(1) }).parse(await response.json());
          if (decodeJwt(token).sub !== user.id) throw new Error("Account deletion subject mismatch");
          await disconnectLaliga(token);
        },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        allowUnlinkingAll: false,
      },
    },
    disabledPaths: ["/get-access-token", "/refresh-token", "/account-info", "/verify-email",
      "/sign-in/email-otp", "/email-otp/request-password-reset", "/forget-password/email-otp",
      "/email-otp/reset-password"],
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100, customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/sign-up/*": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 5 },
    } },
    socialProviders: {
      ...(cfg.GOOGLE_CLIENT_ID ? { google: { clientId: cfg.GOOGLE_CLIENT_ID, clientSecret: cfg.GOOGLE_CLIENT_SECRET!, mapProfileToUser: returningProfile("google") } } : {}),
      ...(cfg.FACEBOOK_CLIENT_ID ? { facebook: { clientId: cfg.FACEBOOK_CLIENT_ID, clientSecret: cfg.FACEBOOK_CLIENT_SECRET!, mapProfileToUser: returningProfile("facebook") } } : {}),
      ...(cfg.APPLE_CLIENT_ID ? { apple: async () => ({
        clientId: cfg.APPLE_CLIENT_ID!,
        mapProfileToUser: returningProfile("apple"),
        // Renew on every provider resolution; no expiring static client-secret file.
        clientSecret: await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: cfg.APPLE_KEY_ID! })
          .setIssuer(cfg.APPLE_TEAM_ID!).setSubject(cfg.APPLE_CLIENT_ID!)
          .setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("1h")
          .sign(await importPKCS8(cfg.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"), "ES256")),
      }) } : {}),
    },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path === "/link-social") {
          const session = await getSessionFromCtx(ctx);
          if (!session || Date.now() - session.session.createdAt.getTime() > 600_000) {
            throw new APIError("UNAUTHORIZED", { code: "FRESH_SESSION_REQUIRED", message: "Sign in again before linking a sign-in method." });
          }
        }
      }),
    },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true, storeOTP: "hashed", expiresIn: 600,
        otpLength: 8, allowedAttempts: 5, changeEmail: { enabled: true },
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === "email-verification") await send({ to: email, ...verificationMail(otp, cfg.BETTER_AUTH_URL) });
          else if (type === "change-email") await send({ to: email, ...emailChangeMail(otp) });
          else throw new Error("Unsupported email operation");
        },
      }),
      username({ validationOrder: { username: "pre-normalization" }, minUsernameLength: 3, maxUsernameLength: 30, usernameNormalization: value => value.trim().toLowerCase(), usernameValidator: value => /^[a-z0-9_]{3,30}$/.test(value.trim().toLowerCase()) }),
      jwt({
        jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" }, rotationInterval: 604800, gracePeriod: 86400 },
        jwt: { issuer: cfg.INTERNAL_JWT_ISSUER, audience: "fantasy-api", expirationTime: "15m", definePayload: ({ user }) => ({ name: user.name }) },
      }),
    ],
  });
  return auth;
}
