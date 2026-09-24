import type { AuthStatus } from "../../auth/types";
import { useAuth } from "../../auth/AuthProvider";
import "./GatePanel.css";

type GateCopy = {
  title: string;
  body: string;
  action?: "login" | "laliga" | "retry";
};

const COPY: Record<Exclude<AuthStatus, "ready">, GateCopy> = {
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
  unavailable: {
    title: "Connection check failed",
    body: "LaLiga connection could not be checked. Try again or log out.",
    action: "retry",
  },
};

export function GatePanel({ status }: { status: Exclude<AuthStatus, "ready"> }) {
  const { login, connectLaliga, reload } = useAuth();
  const copy = COPY[status];

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
      {copy.action === "retry" ? (
        <button type="button" onClick={() => void reload()}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
