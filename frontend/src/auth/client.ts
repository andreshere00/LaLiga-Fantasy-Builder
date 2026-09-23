import type { AccessToken, LaligaConnection, SessionView } from "./types";
import { MemoryTokenStore } from "./tokenStore";

export const LOGIN_PATH = "/auth/login";
export const LALIGA_LOGIN_PATH = "/laliga/login";
const REFRESH_SKEW_MS = 60_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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
  return connection.linked && !connection.needs_reauth;
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

  async currentSession(): Promise<SessionView | null> {
    const response = await this.fetchFn("/auth/me", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Unable to read the session");
    return (await response.json()) as SessionView;
  }

  async exchange(csrfToken: string): Promise<AccessToken> {
    const response = await this.fetchFn("/auth/token", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": csrfToken,
      },
    });
    if (!response.ok) throw new Error("Unable to exchange the session");
    const token = (await response.json()) as AccessToken;
    this.store.set(token.access_token);
    return token;
  }

  async logout(csrfToken: string): Promise<void> {
    const response = await this.fetchFn("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": csrfToken,
      },
    });
    if (!response.ok) throw new Error("Unable to log out");
    this.store.clear();
  }

  async connection(): Promise<LaligaConnection> {
    const response = await this.fetchFn("/laliga/connection", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Unable to read the LaLiga connection");
    return (await response.json()) as LaligaConnection;
  }
}
