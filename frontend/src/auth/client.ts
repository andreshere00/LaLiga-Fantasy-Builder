import type { AccessToken, LaligaConnection, SessionView } from "./types";
import {
  accessTokenSchema,
  authErrorSchema,
  csrfTokenInputSchema,
  laligaConnectionSchema,
  okResponseSchema,
  sessionViewSchema,
} from "./schemas";
import { MemoryTokenStore } from "./tokenStore";

export const LOGIN_PATH = "/auth/login";
export const LALIGA_LOGIN_PATH = "/laliga/login";
const REFRESH_SKEW_MS = 60_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AuthRequestOptions = {
  signal?: AbortSignal;
};

async function validateAuthErrorBody(response: Response): Promise<void> {
  try {
    authErrorSchema.parse(await response.json());
  } catch {
    // Keep malformed error bodies from changing the caller's safe status handling.
  }
}

async function throwAuthFailure(response: Response, fallback: string): Promise<never> {
  await validateAuthErrorBody(response);
  throw new Error(fallback);
}

export function refreshDelayMs(expiresAtSeconds: number, nowMs: number): number {
  return Math.max(expiresAtSeconds * 1000 - nowMs - REFRESH_SKEW_MS, 0);
}

export function startLogin(navigate: (url: string) => void = defaultNavigate): void {
  navigate(LOGIN_PATH);
}

export function startLaligaLogin(navigate: (url: string) => void = defaultNavigate): void {
  navigate(LALIGA_LOGIN_PATH);
}

export function connectionReady(connection: LaligaConnection): boolean {
  return connection.linked && !connection.needsReauth;
}

function defaultNavigate(url: string): void {
  window.location.assign(url);
}

export class AuthClient {
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike, private readonly store: MemoryTokenStore) {
    this.fetchFn = fetchFn.bind(globalThis);
  }

  loginPath(): string {
    return LOGIN_PATH;
  }

  token(): string | null {
    return this.store.get();
  }

  clearToken(): void {
    this.store.clear();
  }

  async currentSession(options: AuthRequestOptions = {}): Promise<SessionView | null> {
    const response = await this.fetchFn("/auth/me", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    if (response.status === 401) {
      await validateAuthErrorBody(response);
      return null;
    }
    if (!response.ok) return throwAuthFailure(response, "Unable to read the session");
    return sessionViewSchema.parse(await response.json());
  }

  async exchange(csrfToken: string, options: AuthRequestOptions = {}): Promise<AccessToken> {
    const checkedCsrfToken = csrfTokenInputSchema.parse(csrfToken);
    const response = await this.fetchFn("/auth/token", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": checkedCsrfToken,
      },
      signal: options.signal,
    });
    if (!response.ok) return throwAuthFailure(response, "Unable to exchange the session");
    const token = accessTokenSchema.parse(await response.json());
    if (options.signal?.aborted) return token;
    this.store.set(token.accessToken);
    return token;
  }

  async logout(csrfToken: string, options: AuthRequestOptions = {}): Promise<void> {
    const checkedCsrfToken = csrfTokenInputSchema.parse(csrfToken);
    const response = await this.fetchFn("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": checkedCsrfToken,
      },
      signal: options.signal,
    });
    if (!response.ok) return throwAuthFailure(response, "Unable to log out");
    okResponseSchema.parse(await response.json());
    this.store.clear();
  }

  async connection(options: AuthRequestOptions = {}): Promise<LaligaConnection> {
    const response = await this.fetchFn("/laliga/connection", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    if (!response.ok) {
      return throwAuthFailure(response, "Unable to read the LaLiga connection");
    }
    return laligaConnectionSchema.parse(await response.json());
  }
}
