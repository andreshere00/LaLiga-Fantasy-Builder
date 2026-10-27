import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "../components/ui/Button";
import { PulseRing } from "../components/ui/PulseRing";
import { useAuth } from "./AuthProvider";
import "./AuthPages.css";

const helperCommand = "./scripts/connect-laliga.sh";

/** Guide a verified user through an enabled LaLiga linking method. */
export function ConnectLaligaPage() {
  const { status, user, accessToken, notice, linkOptions, linkOptionsError, connectLaliga, reload } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const callbackFailed = new URLSearchParams(search).get("error") === "laliga_link_failed";
  const startedFor = useRef<string | null>(null);
  const checking = useRef(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [copied, setCopied] = useState(false);
  const helper = linkOptions?.helperAvailable === true;
  const browser = linkOptions?.browserAvailable === true;
  const isMac = typeof navigator !== "undefined" && /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
  useEffect(() => {
    if (status === "ready") {
      void navigate("/", { replace: true });
      return;
    }
    if (browser && !helper && !callbackFailed && (status === "unlinked" || status === "needs-reauth") && user && accessToken && startedFor.current !== user.userId) {
      startedFor.current = user.userId;
      connectLaliga();
    }
  }, [status, user, accessToken, navigate, connectLaliga, callbackFailed, browser, helper]);

  const checkConnection = async () => {
    if (checking.current) return;
    checking.current = true;
    setCheckingConnection(true);
    try { await reload(); }
    finally { checking.current = false; setCheckingConnection(false); }
  };
  const signedOut = status === "signed-out";
  const failed = status === "unavailable" || !!notice || callbackFailed;
  const waiting = status === "loading" || (!!accessToken && !linkOptions && !linkOptionsError);
  return <section className="auth-page" aria-labelledby="connection-title">
    <header className="auth-heading">
      <p className="auth-eyebrow">LALIGA Fantasy Builder</p>
      <h1 id="connection-title">{signedOut ? "Sign in to continue" : "Connect your LaLiga account"}</h1>
      <p className="auth-description">{signedOut ? "Sign in to Fantasy Builder before connecting your team." : "Connect LaLiga to the Fantasy Builder account shown below."}</p>
    </header>
    {user && <p className="auth-feedback">Fantasy Builder account: <strong>{user.email ?? user.name ?? user.username ?? user.userId}</strong>. Use this same account in the helper.</p>}
    {failed && <div className="auth-feedback auth-feedback--error" role="alert"><p>{callbackFailed ? "LaLiga connection could not be completed. Try again." : notice ?? "Your connection could not be checked. Try again."}</p></div>}
    {!signedOut && waiting && <PulseRing label="Checking your session…" />}
    {!signedOut && !waiting && linkOptionsError && <div className="auth-feedback auth-feedback--error" role="alert">Linking methods could not be checked. Try again.</div>}
    {!signedOut && !waiting && !linkOptionsError && helper && <div className="auth-connection-guide">
      <p>On a Mac, get the helper from the <a href="https://github.com/andreshere00/LaLiga-Fantasy-Builder">Fantasy Builder repository</a>, then run this command in its folder. Sign in with the same Fantasy Builder account. The helper will guide you through LaLiga authorization.</p>
      {isMac ? <><code className="auth-helper-command">{helperCommand}</code><Button onClick={() => { void navigator.clipboard.writeText(helperCommand).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy command"}</Button></> : <p>This helper currently supports macOS. Open this page on your Mac to connect; you can use the app here afterward.</p>}
      <Button onClick={() => { void checkConnection(); }} disabled={checkingConnection}>{checkingConnection ? "Checking…" : "Check connection"}</Button>
      {status === "needs-reauth" && <p>Your LaLiga connection needs renewal. Run the helper again.</p>}
    </div>}
    {!signedOut && !waiting && !linkOptionsError && !helper && browser && !failed && <PulseRing label="Opening LaLiga…" />}
    {!signedOut && !waiting && !linkOptionsError && !helper && !browser && <p className="auth-feedback">LaLiga linking is not available in this installation yet. You can browse public player information while setup is completed.</p>}
    <div className="auth-continue-actions">
      {signedOut ? <Link className={buttonVariants()} to="/sign-in">Sign in</Link>
        : failed || linkOptionsError ? <Button onClick={() => {
          if (callbackFailed) { startedFor.current = null; void navigate("/connect-laliga", { replace: true }); }
          else if (status === "unavailable" || linkOptionsError) void checkConnection();
          else if (browser) connectLaliga();
        }}>Try again</Button> : null}
      <Link to="/players">Browse players for now</Link>
    </div>
  </section>;
}
