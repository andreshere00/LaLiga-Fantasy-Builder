import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client";
import { AuthClient, refreshDelayMs, startLogin } from "./client";
import { MemoryTokenStore } from "./tokenStore";
import type { AuthStatus, LaligaLinkOptions, SessionUser } from "./types";

type AuthContextValue = {
  status: AuthStatus; user: SessionUser | null; managerName: string | null;
  managerAvatar: string | null; accessToken: string | null; notice: string | null;
  linkOptions: LaligaLinkOptions | null; linkOptionsError: boolean;
  login: () => void; connectLaliga: () => void; logout: () => Promise<void>;
  reload: () => Promise<void>; forgetDeletedAccount: () => Promise<void>; markNeedsReauth: () => void;
  startManualLink: () => Promise<{ authorizeUrl: string; expiresAt: number }>;
  completeManualLink: (callback: string) => Promise<boolean>;
  cancelManualLink: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const empty = { accessToken: null, managerName: null, managerAvatar: null, notice: null, linkOptions: null, linkOptionsError: false };
type State = Pick<AuthContextValue, "status" | "accessToken" | "managerName" | "managerAvatar" | "notice" | "linkOptions" | "linkOptionsError">;

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const [client] = useState(() => new AuthClient(fetch.bind(globalThis), new MemoryTokenStore()));
  const [state, setState] = useState<State>({ ...empty, status: "loading" });
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const logoutToken = useRef<{ sessionId: string | undefined; token: string } | null>(null);
  const [blockedSessionId, setBlockedSessionId] = useState<string | null>(null);
  const loggingOut = useRef(false);
  const [revision, setRevision] = useState(0);
  const work = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const userId = session.data?.user.id;
  const sessionId = session.data?.session.id;
  const pending = session.isPending;
  const latestSessionId = useRef(sessionId);
  latestSessionId.current = sessionId;
  const clear = useCallback(() => {
    generation.current += 1;
    work.current?.abort();
    client.clearToken();
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [client, queryClient]);

  useEffect(() => {
    clear();
    const controller = new AbortController();
    work.current = controller;
    const currentGeneration = generation.current;
    const current = () => !controller.signal.aborted && currentGeneration === generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setActiveSessionId(sessionId);
    if (logoutToken.current?.sessionId !== sessionId) logoutToken.current = null;
    // A pending sign-out or its retry must never reacquire a token for this session.
    if (sessionId && blockedSessionId === sessionId) return () => controller.abort();
    setState({ ...empty, status: pending ? "loading" : userId ? "loading" : "signed-out" });
    if (!userId || pending) return () => controller.abort();
    const refresh = async () => {
      try {
        const token = await client.exchange(userId, { signal: controller.signal });
        if (!current()) return;
        setState(previous => ({ ...previous, accessToken: token.accessToken }));
        timer = setTimeout(() => { void refresh(); }, refreshDelayMs(token.expiresAt, Date.now()));
      } catch {
        if (!current()) return;
        clear();
        setState({ ...empty, status: "signed-out", notice: "Your session ended. Sign in again." });
      }
    };
    const connection = async () => {
      try {
        const result = await client.connection({ signal: controller.signal });
        if (!current()) return;
        const status = result.needsReauth ? "needs-reauth" : result.linked ? "ready" : "unlinked";
        setState(previous => ({ ...previous, status, managerName: result.managerName, managerAvatar: result.avatar, notice: null }));
      } catch {
        if (current()) setState(previous => ({ ...previous, status: "unavailable", notice: "LaLiga connection could not be checked." }));
      }
    };
    const options = async () => {
      try {
        const result = await client.linkOptions({ signal: controller.signal });
        if (current()) setState(previous => ({ ...previous, linkOptions: result, linkOptionsError: false }));
      } catch {
        if (current()) setState(previous => ({ ...previous, linkOptionsError: true }));
      }
    };
    void refresh().then(() => { if (current() && client.token()) { void connection(); void options(); } });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [userId, sessionId, blockedSessionId, pending, revision, clear, client]);

  const reload = useCallback(async () => { await session.refetch(); setRevision(value => value + 1); }, [session]);
  const forgetDeletedAccount = useCallback(async () => {
    setBlockedSessionId(sessionId ?? null);
    clear();
    setState({ ...empty, status: "signed-out" });
    try { await session.refetch(); } catch { /* The account is already deleted; local data stays cleared. */ }
  }, [clear, session, sessionId]);
  const logout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    const token = client.token();
    if (token) logoutToken.current = { sessionId, token };
    setBlockedSessionId(sessionId ?? null);
    clear();
    setState({ ...empty, status: "loading" });
    try {
      if (logoutToken.current) {
        try { await client.cancelPairings(logoutToken.current.token); }
        catch { /* Sign out even if the vault cannot cancel a pending challenge. */ }
      }
      if (latestSessionId.current !== sessionId) return;
      const result = await authClient.signOut();
      if (latestSessionId.current !== sessionId) return;
      if (result.error) throw new Error("Sign out failed");
      logoutToken.current = null;
      setState({ ...empty, status: "signed-out" });
    } catch {
      if (latestSessionId.current !== sessionId) return;
      setState({ ...empty, status: "unavailable", notice: "Sign out could not finish. Please try again." });
    } finally { loggingOut.current = false; }
  }, [clear, client, sessionId]);
  const connectLaliga = useCallback(() => {
    const active = generation.current;
    void client.startLaligaLogin({ signal: work.current?.signal }).then(url => {
      if (active === generation.current) window.location.assign(url);
    }).catch(error => {
      if (active !== generation.current) return;
      const notice = error instanceof Error && error.message.startsWith("Browser LaLiga linking")
        ? error.message : "LaLiga sign-in could not start. Try again.";
      setState(previous => ({ ...previous, notice }));
    });
  }, [client]);
  const startManualLink = useCallback(async () => {
    const active = generation.current;
    const result = await client.startManualLink({ signal: work.current?.signal });
    if (active !== generation.current) throw new Error("Session changed. Start again.");
    return result;
  }, [client]);
  const completeManualLink = useCallback(async (callback: string) => {
    const active = generation.current;
    await client.completeManualLink(callback, { signal: work.current?.signal });
    if (active !== generation.current) throw new Error("Session changed. Start again.");
    const connection = await client.connection({ signal: work.current?.signal });
    if (active !== generation.current) throw new Error("Session changed. Start again.");
    if (!connection.linked || connection.needsReauth) return false;
    setState(previous => ({ ...previous, status: "ready", managerName: connection.managerName,
      managerAvatar: connection.avatar, notice: null }));
    return true;
  }, [client]);
  const cancelManualLink = useCallback(async () => {
    await client.cancelManualLink({ signal: work.current?.signal });
  }, [client]);
  const value = useMemo<AuthContextValue>(() => ({
    ...(activeSessionId === sessionId ? state : { ...empty, status: pending || userId ? "loading" : "signed-out" }),
    user: session.data && state.status !== "signed-out" ? { userId: session.data.user.id, email: session.data.user.email, name: session.data.user.name, username: session.data.user.username ?? null } : null,
    login: () => startLogin(), connectLaliga, startManualLink, completeManualLink,
    cancelManualLink, logout, reload, forgetDeletedAccount,
    markNeedsReauth: () => setState(previous => ({ ...previous, status: "needs-reauth" })),
  }), [state, activeSessionId, sessionId, pending, userId, session.data, connectLaliga,
    startManualLink, completeManualLink, cancelManualLink, logout, reload, forgetDeletedAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
