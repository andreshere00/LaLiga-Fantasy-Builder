import { z } from "zod";
import { authClient } from "./auth-client";
import { browserLoginResponseSchema, laligaConnectionSchema } from "./schemas";
import type { AccessToken, LaligaConnection } from "./types";
import { MemoryTokenStore } from "./tokenStore";

export const LOGIN_PATH = "/sign-in";
export const LALIGA_LOGIN_PATH = "/laliga/login";
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type AuthRequestOptions = { signal?: AbortSignal };

export function refreshDelayMs(expiresAtSeconds: number, nowMs: number): number {
  return Math.max(expiresAtSeconds * 1000 - nowMs - 60_000, 1000);
}
export function startLogin(navigate: (url: string) => void = url => window.location.assign(url)): void {
  navigate(LOGIN_PATH);
}
export function connectionReady(connection: LaligaConnection): boolean {
  return connection.linked && !connection.needsReauth;
}

/** Decoding is only for scheduling and stale-account rejection. Servers verify authorization. */
export function tokenMetadata(token: string, expectedUserId: string): AccessToken {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid token response");
  const claims = z.object({ exp: z.number().int(), iat: z.number().int(), sub: z.string() }).parse(
    JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))),
  );
  if (claims.sub !== expectedUserId || claims.exp * 1000 <= Date.now() || claims.exp - claims.iat > 900) {
    throw new Error("Session changed or token expired");
  }
  return { accessToken: token, tokenType: "Bearer", expiresAt: claims.exp, expiresIn: claims.exp - claims.iat };
}

export class AuthClient {
  constructor(private readonly fetchFn: FetchLike, private readonly store: MemoryTokenStore) {}
  clearToken(): void { this.store.clear(); }
  token(): string | null { return this.store.get(); }
  async exchange(userId: string, options: AuthRequestOptions = {}): Promise<AccessToken> {
    const { data, error } = await authClient.token({ fetchOptions: { signal: options.signal } });
    if (error || !data) throw new Error("Sign in again to continue");
    const token = tokenMetadata(data.token, userId);
    if (!options.signal?.aborted) this.store.set(token.accessToken);
    return token;
  }
  async connection(options: AuthRequestOptions = {}): Promise<LaligaConnection> {
    const response = await this.request("/laliga/connection", "GET", options);
    return laligaConnectionSchema.parse(await response.json());
  }
  async startLaligaLogin(options: AuthRequestOptions = {}): Promise<string> {
    const response = await this.request(LALIGA_LOGIN_PATH, "POST", options);
    const { authorizeUrl } = browserLoginResponseSchema.parse(await response.json());
    const url = new URL(authorizeUrl);
    if (url.protocol !== "https:" || url.hostname !== "login.laliga.es" || url.username || url.password) {
      throw new Error("Invalid LaLiga authorization URL");
    }
    return url.href;
  }
  async cancelPairings(token: string): Promise<void> {
    const response = await this.fetchFn("/laliga/pairings", {
      method: "DELETE", credentials: "omit", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Could not cancel pending LaLiga connections");
  }
  private async request(path: string, method: string, options: AuthRequestOptions = {}): Promise<Response> {
    const token = this.store.get();
    if (!token) throw new Error("Sign in again to continue");
    const response = await this.fetchFn(path, {
      method, credentials: "omit", signal: options.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (path === LALIGA_LOGIN_PATH) {
        const body = await response.clone().json().catch(() => null);
        if (z.object({ error: z.literal("browser_unavailable") }).safeParse(body).success) {
          throw new Error("Browser LaLiga linking needs a registered HTTPS callback. Use the CLI pairing helper until it is configured.");
        }
      }
      throw new Error("LaLiga connection request failed. Try again.");
    }
    return response;
  }
}
