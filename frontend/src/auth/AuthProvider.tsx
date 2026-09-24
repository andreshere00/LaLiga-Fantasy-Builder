import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AuthClient, connectionReady, refreshDelayMs, startLaligaLogin, startLogin } from "./client";
import { resolveGate } from "./gate";
import { MemoryTokenStore } from "./tokenStore";
import type { AccessToken, AuthStatus, SessionUser } from "./types";

type AuthContextValue = {
  status: AuthStatus;
  user: SessionUser | null;
  managerName: string | null;
  accessToken: string | null;
  notice: string | null;
  login: () => void;
  connectLaliga: () => void;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  markNeedsReauth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() => new AuthClient(fetch, new MemoryTokenStore()));
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const csrfRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const sessionAbortRef = useRef(new AbortController());

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const invalidateSessionWork = useCallback(() => {
    sessionAbortRef.current.abort();
    sessionAbortRef.current = new AbortController();
    generationRef.current += 1;
    clearTimer();
    return {
      generation: generationRef.current,
      signal: sessionAbortRef.current.signal,
    };
  }, [clearTimer]);

  const armRefresh = useCallback(
    (csrfToken: string, token: AccessToken, refreshGeneration: number) => {
      setAccessToken(token.access_token);
      clearTimer();
      const delay = refreshDelayMs(token.expires_at, Date.now());
      timerRef.current = window.setTimeout(() => {
        if (generationRef.current !== refreshGeneration) return;
        const signal = sessionAbortRef.current.signal;
        void client.exchange(csrfToken, { signal }).then(
          (next) => {
            if (generationRef.current !== refreshGeneration) {
              client.clearToken();
              return;
            }
            armRefresh(csrfToken, next, generationRef.current);
          },
          () => {
            if (generationRef.current !== refreshGeneration) return;
            client.clearToken();
            if (!mountedRef.current) return;
            setAccessToken(null);
            setUser(null);
            setManagerName(null);
            setStatus("signed-out");
          },
        );
      }, delay);
    },
    [clearTimer, client],
  );

  const load = useCallback(
    async (generation: number, signal: AbortSignal) => {
      const current = () => mountedRef.current && generationRef.current === generation;
      setStatus("loading");
      setNotice(null);
      try {
        const session = await client.currentSession({ signal });
        if (!current()) return;
        if (!session) {
          client.clearToken();
          clearTimer();
          setAccessToken(null);
          setUser(null);
          setManagerName(null);
          csrfRef.current = null;
          setStatus("signed-out");
          return;
        }
        setUser(session.user);
        csrfRef.current = session.csrf_token;
        const token = await client.exchange(session.csrf_token, { signal });
        if (!current()) return;
        armRefresh(session.csrf_token, token, generation);
        try {
          const connection = await client.connection({ signal });
          if (!current()) return;
          setManagerName(connection.manager_name);
          setStatus(resolveGate({ session, connection, needsReauth: false }));
        } catch {
          if (!current()) return;
          setStatus("unavailable");
          setNotice("LaLiga connection could not be checked.");
        }
      } catch {
        if (!current()) return;
        if (signal.aborted) return;
        client.clearToken();
        clearTimer();
        setAccessToken(null);
        setStatus("signed-out");
        setNotice("The auth service could not be reached.");
      }
    },
    [armRefresh, clearTimer, client],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    mountedRef.current = true;
    const { generation, signal } = invalidateSessionWork();
    void loadRef.current(generation, signal);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      sessionAbortRef.current.abort();
      sessionAbortRef.current = new AbortController();
      clearTimer();
    };
  }, [clearTimer, invalidateSessionWork]);

  const login = useCallback(() => {
    startLogin();
  }, []);

  const connectLaliga = useCallback(() => {
    startLaligaLogin();
  }, []);

  const logout = useCallback(async () => {
    const csrfToken = csrfRef.current;
    const { signal } = invalidateSessionWork();
    try {
      if (csrfToken) await client.logout(csrfToken, { signal });
      else client.clearToken();
      csrfRef.current = null;
      queryClient.clear();
      setAccessToken(null);
      setUser(null);
      setManagerName(null);
      setNotice(null);
      setStatus("signed-out");
    } catch {
      setNotice("Log out failed. Try again.");
      const { generation, signal: reloadSignal } = invalidateSessionWork();
      await load(generation, reloadSignal);
    }
  }, [client, invalidateSessionWork, load, queryClient]);

  const reload = useCallback(async () => {
    const { generation, signal } = invalidateSessionWork();
    await load(generation, signal);
  }, [invalidateSessionWork, load]);

  useEffect(() => {
    if (status !== "unlinked" && status !== "needs-reauth") return;
    const pollAbort = new AbortController();
    let cancelled = false;
    const timer = window.setInterval(() => {
      void client.connection({ signal: pollAbort.signal }).then(
        (connection) => {
          if (cancelled || pollAbort.signal.aborted) return;
          if (connectionReady(connection)) void reload();
        },
        () => undefined,
      );
    }, 3000);
    return () => {
      cancelled = true;
      pollAbort.abort();
      window.clearInterval(timer);
    };
  }, [status, client, reload]);

  const markNeedsReauth = useCallback(() => {
    setStatus((current) => (current === "needs-reauth" ? current : "needs-reauth"));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      managerName,
      accessToken,
      notice,
      login,
      connectLaliga,
      logout,
      reload,
      markNeedsReauth,
    }),
    [
      status,
      user,
      managerName,
      accessToken,
      notice,
      login,
      connectLaliga,
      logout,
      reload,
      markNeedsReauth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
