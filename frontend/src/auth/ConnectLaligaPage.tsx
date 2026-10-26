import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "../components/ui/Button";
import { PulseRing } from "../components/ui/PulseRing";
import { useAuth } from "./AuthProvider";
import "./AuthPages.css";

/** Continue an explicit sign-in journey through LaLiga's own authorization. */
export function ConnectLaligaPage() {
  const { status, user, accessToken, notice, connectLaliga, reload } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const callbackFailed = new URLSearchParams(search).get("error") === "laliga_link_failed";
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (status === "ready") {
      void navigate("/", { replace: true });
      return;
    }
    if (!callbackFailed && (status === "unlinked" || status === "needs-reauth") && user && accessToken && startedFor.current !== user.userId) {
      startedFor.current = user.userId;
      connectLaliga();
    }
  }, [status, user, accessToken, navigate, connectLaliga, callbackFailed]);

  const signedOut = status === "signed-out";
  const failed = status === "unavailable" || !!notice || callbackFailed;
  return <section className="auth-page" aria-labelledby="connection-title">
    <header className="auth-heading">
      <p className="auth-eyebrow">LALIGA Fantasy Builder</p>
      <h1 id="connection-title">{signedOut ? "Sign in to continue" : "Connect your LaLiga account"}</h1>
      <p className="auth-description">{signedOut ? "Sign in to Fantasy Builder before connecting your team." : "We’re taking you to LaLiga to authorize access to your Fantasy team. You can use the sign-in options LaLiga offers there."}</p>
    </header>
    {failed && <div className="auth-feedback auth-feedback--error" role="alert"><p>{callbackFailed ? "LaLiga connection could not be completed. Try again." : notice ?? "Your connection could not be checked. Try again."}</p></div>}
    {!signedOut && !failed && <PulseRing label={status === "loading" ? "Checking your session…" : "Opening LaLiga…"} />}
    <div className="auth-continue-actions">
      {signedOut ? <Link className={buttonVariants()} to="/sign-in">Sign in</Link>
        : failed ? <Button onClick={() => {
          if (callbackFailed) { startedFor.current = null; void navigate("/connect-laliga", { replace: true }); }
          else if (status === "unavailable") { startedFor.current = null; void reload(); }
          else connectLaliga();
        }}>Try again</Button> : null}
      <Link to="/players">Browse players for now</Link>
    </div>
  </section>;
}
