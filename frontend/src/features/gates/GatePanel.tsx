import { t, useTranslation } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { PulseRing } from "../../components/ui/PulseRing";
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
    body: "Checking your session...",
  },
  "signed-out": {
    title: "Sign in",
    body: "Log in to operate within LaLiga Fantasy application by using a web interface.",
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
  useTranslation();
  const { login, connectLaliga, reload } = useAuth();
  const copy = COPY[status];

  return (
    <section className="gate">
      {status === "loading" ? (
        <PulseRing label={t("Checking your session…")} />
      ) : null}
      <h1>{t(copy.title)}</h1>
      <p>{t(copy.body)}</p>
      {copy.action === "login" ? (
        <Button type="button" shape="square" onClick={login}>
          {t("Log in")}</Button>
      ) : null}
      {copy.action === "laliga" ? (
        <Button type="button" onClick={connectLaliga}>
          {t("Connect LaLiga")}</Button>
      ) : null}
      {copy.action === "retry" ? (
        <Button type="button" onClick={() => void reload()}>
          {t("Retry")}</Button>
      ) : null}
    </section>
  );
}
