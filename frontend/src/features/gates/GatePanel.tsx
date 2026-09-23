import { useEffect } from "react";
import type { AuthStatus } from "../../auth/types";
import { useAuth } from "../../auth/AuthProvider";
import "./GatePanel.css";

const COPY: Record<
  Exclude<AuthStatus, "ready">,
  { title: string; body: string; action?: "login" | "laliga" }
> = {
  loading: {
    title: "Loading",
    body: "Checking your session.",
  },
  "signed-out": {
    title: "Sign in",
    body: "Log in to load your league, lineup, and ranking.",
    action: "login",
  },
  unlinked: {
    title: "Connect LaLiga",
    body:
      "Your session is active. Continue to LaLiga to link your account. " +
      "You will return to this app when sign-in finishes.",
    action: "laliga",
  },
  "needs-reauth": {
    title: "Reconnect LaLiga",
    body:
      "LaLiga needs to be connected again. Continue to LaLiga and you will " +
      "return to this app when sign-in finishes.",
    action: "laliga",
  },
};

const LALIGA_LOGIN_STARTED = "laliga-login-started";

export function GatePanel({ status }: { status: Exclude<AuthStatus, "ready"> }) {
  const { login, connectLaliga } = useAuth();
  const copy = COPY[status];

  useEffect(() => {
    if (copy.action !== "laliga") return;
    if (sessionStorage.getItem(LALIGA_LOGIN_STARTED) === "1") return;
    sessionStorage.setItem(LALIGA_LOGIN_STARTED, "1");
    connectLaliga();
  }, [connectLaliga, copy.action]);

  return (
    <section className="gate">
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {copy.action === "login" ? (
        <button type="button" onClick={login}>
          Log in
        </button>
      ) : null}
      {copy.action === "laliga" ? (
        <button type="button" onClick={connectLaliga}>
          Connect LaLiga
        </button>
      ) : null}
    </section>
  );
}
