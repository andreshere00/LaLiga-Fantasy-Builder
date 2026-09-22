import type { AuthStatus } from "../../auth/types";
import { useAuth } from "../../auth/AuthProvider";
import "./GatePanel.css";

const COPY: Record<
  Exclude<AuthStatus, "ready">,
  { title: string; body: string; action?: "login" | "reload" }
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
      "Your session is active, but league data needs a paired LaLiga account. " +
      "Finish pairing with the auth helper, then check again. " +
      "This app never receives a LaLiga token.",
    action: "reload",
  },
  "needs-reauth": {
    title: "Reconnect LaLiga",
    body:
      "LaLiga needs to be connected again before lineup data can load. " +
      "Finish pairing with the auth helper, then check again.",
    action: "reload",
  },
};

export function GatePanel({ status }: { status: Exclude<AuthStatus, "ready"> }) {
  const { login, reload } = useAuth();
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
      {copy.action === "reload" ? (
        <button type="button" onClick={() => void reload()}>
          Check again
        </button>
      ) : null}
    </section>
  );
}
