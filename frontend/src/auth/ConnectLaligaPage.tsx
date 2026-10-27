import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "../components/ui/Button";
import { PulseRing } from "../components/ui/PulseRing";
import { useAuth } from "./AuthProvider";
import "./AuthPages.css";

const helperCommand = "./scripts/connect-laliga.sh";

/** Guide a verified user through an enabled LaLiga linking method. */
export function ConnectLaligaPage() {
  const { status, user, accessToken, notice, linkOptions, linkOptionsError, connectLaliga,
    startManualLink, completeManualLink, cancelManualLink, reload } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const callbackFailed = new URLSearchParams(search).get("error") === "laliga_link_failed";
  const checking = useRef(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualExpiry, setManualExpiry] = useState<number | null>(null);
  const [callback, setCallback] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const [expired, setExpired] = useState(false);
  const manualOwner = useRef<string | null>(null);
  const manualBusyRef = useRef(false);
  const helper = linkOptions?.helperAvailable === true;
  const browser = linkOptions?.browserAvailable === true;
  const manual = linkOptions?.manualAvailable === true;
  const userId = user?.userId;
  const latestUserId = useRef(userId);
  latestUserId.current = userId;
  const isMac = typeof navigator !== "undefined" && /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
  useEffect(() => {
    if (manualOwner.current && manualOwner.current !== userId) {
      manualOwner.current = null;
      setManualExpiry(null);
      setCallback("");
      setManualError("");
    }
  }, [userId]);
  useEffect(() => {
    if (manualExpiry === null) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, manualExpiry * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [manualExpiry]);
  const beginManual = async () => {
    if (manualBusyRef.current || !userId) return;
    const tab = window.open("", "_blank");
    if (!tab) { setManualError("Allow the new LaLiga tab, then try again."); return; }
    tab.opener = null;
    manualBusyRef.current = true; setManualBusy(true); setManualError("");
    try {
      const result = await startManualLink();
      if (latestUserId.current !== userId) throw new Error("Session changed. Start again.");
      manualOwner.current = userId;
      setCallback(""); setExpired(false); setManualExpiry(result.expiresAt);
      tab.location.href = result.authorizeUrl;
    } catch {
      tab.close(); setManualError("LaLiga sign-in could not start. Try again.");
    } finally { manualBusyRef.current = false; setManualBusy(false); }
  };
  const submitManual = async (event: FormEvent) => {
    event.preventDefault();
    if (manualBusyRef.current || !manualExpiry || expired || manualOwner.current !== userId) return;
    manualBusyRef.current = true; setManualBusy(true); setManualError("");
    try {
      const linked = await completeManualLink(callback.trim());
      if (latestUserId.current !== userId) throw new Error("Session changed. Start again.");
      setCallback("");
      if (!linked) setManualError("Connection could not be confirmed. Start a new attempt.");
    } catch {
      setCallback(""); setManualError("The callback could not be used. Start a new attempt and copy its full URL.");
    } finally { manualBusyRef.current = false; setManualBusy(false); }
  };
  const cancelManual = async () => {
    if (manualBusyRef.current) return;
    manualBusyRef.current = true; setManualBusy(true);
    try { await cancelManualLink(); }
    catch { setManualError("Could not cancel the pending attempt. It will expire automatically."); }
    finally {
      manualOwner.current = null; setManualExpiry(null); setCallback("");
      manualBusyRef.current = false; setManualBusy(false);
    }
  };
  useEffect(() => {
    if (status === "ready") {
      void navigate("/", { replace: true });
      return;
    }
  }, [status, navigate]);

  const checkConnection = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setCheckingConnection(true);
    setCheckError(false);
    try { await reload(); }
    catch { setCheckError(true); }
    finally { checking.current = false; setCheckingConnection(false); }
  }, [reload]);
  useEffect(() => {
    if (!helper || !userId || manualExpiry !== null ||
      (status !== "unlinked" && status !== "needs-reauth")) return;
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkConnection();
    };
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [helper, userId, manualExpiry, status, checkConnection]);
  const signedOut = status === "signed-out";
  const failed = status === "unavailable" || !!notice || callbackFailed;
  const waiting = status === "loading" || (!!accessToken && !linkOptions && !linkOptionsError);
  return <section className="auth-page" aria-labelledby="connection-title">
    <header className="auth-heading">
      <p className="auth-eyebrow">LALIGA Fantasy Builder</p>
      <h1 id="connection-title">{signedOut ? "Sign in to continue" : "Connect your LaLiga account"}</h1>
      <p className="auth-description">{signedOut ? "Sign in to Fantasy Builder before connecting your team." : "Connect LaLiga to the Fantasy Builder account shown below."}</p>
    </header>
    {user && <p className="auth-feedback">Fantasy Builder account: <strong>{user.email ?? user.name ?? user.username ?? user.userId}</strong>. Check this account before connecting LaLiga.</p>}
    {failed && <div className="auth-feedback auth-feedback--error" role="alert"><p>{callbackFailed ? "LaLiga connection could not be completed. Try again." : notice ?? "Your connection could not be checked. Try again."}</p></div>}
    {!signedOut && waiting && <PulseRing label="Checking your session…" />}
    {!signedOut && !waiting && linkOptionsError && <div className="auth-feedback auth-feedback--error" role="alert">Linking methods could not be checked. Try again.</div>}
    {!signedOut && !waiting && !linkOptionsError && helper && <div className="auth-connection-guide">
      <h2>Connect with the Mac helper</h2>
      <p>On a Mac, get the helper from the <a href="https://github.com/andreshere00/LaLiga-Fantasy-Builder">Fantasy Builder repository</a>, then run this command in its folder. Sign in with the same Fantasy Builder account. The helper will guide you through LaLiga authorization.</p>
      {isMac ? <><code className="auth-helper-command">{helperCommand}</code><Button onClick={() => { void navigator.clipboard.writeText(helperCommand).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy command"}</Button></> : <p>This helper currently supports macOS. Open this page on your Mac to connect; you can use the app here afterward.</p>}
      <p>This page checks your connection when you return to it after signing in to LaLiga.</p>
      {checkError && <p role="alert">Connection could not be checked. Try again.</p>}
      <Button onClick={() => { void checkConnection(); }} disabled={checkingConnection}>{checkingConnection ? "Checking…" : "Check connection"}</Button>
      {status === "needs-reauth" && <p>Your LaLiga connection needs renewal. Run the helper again.</p>}
    </div>}
    {!signedOut && !waiting && !linkOptionsError && browser &&
      (status === "unlinked" || status === "needs-reauth") && !failed &&
      <div className="auth-connection-guide">
        <h2>Connect through LaLiga</h2>
        <p>Continue in the LaLiga website and return here after authorization.</p>
        <Button onClick={connectLaliga}>Continue to LaLiga</Button>
      </div>}
    {!signedOut && !waiting && !linkOptionsError && manual && (status === "unlinked" || status === "needs-reauth") && <div className="auth-connection-guide">
      <h2>Connect from a desktop browser</h2>
      <p>This method needs no installation. You will sign in to LaLiga in another tab and copy one return URL from your browser’s Network tools. Keep this tab open.</p>
      {!manualExpiry || expired ? <Button onClick={() => { void beginManual(); }} disabled={manualBusy}>
        {manualBusy ? "Starting…" : expired ? "Start a new attempt" : "Start LaLiga sign-in"}
      </Button> : <>
        <ol>
          <li>In the LaLiga tab, open DevTools → Network and enable Preserve log.</li>
          <li>Sign in with Google or your LaLiga method.</li>
          <li>Find the canceled request beginning <code>authredirect://com.lfp.laligafantasy</code>, copy its full URL, and paste it below.</li>
        </ol>
        <form onSubmit={event => { void submitManual(event); }} className="auth-form">
          <div className="auth-field"><label htmlFor="laliga-callback">LaLiga return URL</label>
            <input id="laliga-callback" value={callback} onChange={event => setCallback(event.target.value)}
              autoComplete="off" spellCheck={false} maxLength={4096} required
              placeholder="authredirect://com.lfp.laligafantasy?..." /></div>
          <p className="auth-field-hint">This one-time URL is sent only to Fantasy Builder. Do not share it elsewhere.</p>
          <Button type="submit" disabled={manualBusy || !callback.trim()}>{manualBusy ? "Connecting…" : "Complete connection"}</Button>
        </form>
        <Button onClick={() => { void cancelManual(); }} disabled={manualBusy}>Cancel attempt</Button>
      </>}
      {expired && <p role="status">This attempt expired. Start a new one.</p>}
      {manualError && <p role="alert">{manualError}</p>}
      {status === "needs-reauth" && <p>Repeat these steps to renew an expired LaLiga connection.</p>}
    </div>}
    {!signedOut && !waiting && !linkOptionsError && !helper && !browser && !manual && <p className="auth-feedback">LaLiga linking is not available in this installation yet. You can browse public player information while setup is completed.</p>}
    <div className="auth-continue-actions">
      {signedOut ? <Link className={buttonVariants()} to="/sign-in">Sign in</Link>
        : failed || linkOptionsError ? <Button onClick={() => {
          if (callbackFailed) void navigate("/connect-laliga", { replace: true });
          else if (status === "unavailable" || linkOptionsError) void checkConnection();
          else if (browser) connectLaliga();
        }}>Try again</Button> : null}
      <Link to="/players">Browse players for now</Link>
    </div>
  </section>;
}
