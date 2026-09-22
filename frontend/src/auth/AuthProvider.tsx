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

import { AuthClient, refreshDelayMs, startLogin } from "./client";
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
  const epochRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armRefreshRef = useRef<(csrfToken: string, token: AccessToken) => void>(() => {});
  armRefreshRef.current = (csrfToken: string, token: AccessToken) => {
    setAccessToken(token.access_token);
    clearTimer();
    const delay = refreshDelayMs(token.expires_at, Date.now());
    timerRef.current = window.setTimeout(() => {
      void client.exchange(csrfToken).then(
        (next) => armRefreshRef.current(csrfToken, next),
        () => {
          client.clearToken();
          if (!mountedRef.current) return;
          setAccessToken(null);
          setUser(null);
          setManagerName(null);
          setStatus("signed-out");
        },
      );
    }, delay);
  };

  const loadRef = useRef<(epoch: number) => Promise<void>>(async () => {});
  loadRef.current = async (epoch: number) => {
    const current = () => mountedRef.current && epochRef.current === epoch;
    setStatus("loading");
    setNotice(null);
    try {
      const session = await client.currentSession();
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
      const token = await client.exchange(session.csrf_token);
      if (!current()) return;
      armRefreshRef.current(session.csrf_token, token);
      try {
        const connection = await client.connection();
        if (!current()) return;
        setManagerName(connection.manager_name);
        setStatus(resolveGate({ session, connection, needsReauth: false }));
      } catch {
        if (!current()) return;
        setStatus("unlinked");
        setNotice("LaLiga connection could not be checked.");
      }
    } catch {
      if (!current()) return;
      client.clearToken();
      clearTimer();
      setAccessToken(null);
      setStatus("signed-out");
      setNotice("The auth service could not be reached.");
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    void loadRef.current(epoch);
    return () => {
      mountedRef.current = false;
      epochRef.current += 1;
      clearTimer();
    };
  }, [clearTimer]);

  const login = useCallback(() => {
    startLogin();
  }, []);

  const logout = useCallback(async () => {
    const csrfToken = csrfRef.current;
    epochRef.current += 1;
    try {
      if (csrfToken) await client.logout(csrfToken);
      else client.clearToken();
      csrfRef.current = null;
      clearTimer();
      queryClient.clear();
      setAccessToken(null);
      setUser(null);
      setManagerName(null);
      setNotice(null);
      setStatus("signed-out");
    } catch {
      setNotice("Log out failed. Try again.");
    }
  }, [clearTimer, client, queryClient]);

  const reload = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    await loadRef.current(epoch);
  }, []);

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
