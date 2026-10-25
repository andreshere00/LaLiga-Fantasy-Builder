import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button, buttonVariants } from "../components/ui/Button";
import { authClient } from "./auth-client";
import { useAuth } from "./AuthProvider";
import { ProviderLogo, type SocialProvider } from "./ProviderLogo";
import "./AuthPages.css";

const providers = ["google", "facebook", "apple"] as const;
const names = { google: "Google", facebook: "Facebook", apple: "Apple" };
const signInOptionsSchema = z.object({
  credentials: z.boolean(),
  laligaSso: z.boolean(),
  directProviders: z.object({ google: z.boolean(), facebook: z.boolean(), apple: z.boolean() }),
});
const titles: Record<string, string> = {
  "/sign-in": "Sign in", "/register": "Create your account", "/verify-email": "Verify your email",
  "/forgot-password": "Reset your password", "/reset-password": "Choose a new password", "/account": "Sign-in methods",
};
const descriptions: Record<string, string> = {
  "/sign-in": "Your leagues, your squad, your next move.",
  "/register": "Choose how you want to sign in to Fantasy Builder.",
  "/verify-email": "Enter the eight-digit code from your inbox. It expires in ten minutes.",
  "/forgot-password": "We’ll email you a link to choose a new password.",
  "/reset-password": "Choose a strong password you haven’t used before.",
  "/account": "Manage the ways you sign in to Fantasy Builder.",
};
const errors: Record<string, string> = {
  PROVIDER_NOT_FOUND: "This sign-in provider is not configured for this installation. Use username or email sign-in, or create an account.",
  oauth_provider_not_found: "This sign-in provider is not configured for this installation. Use username or email sign-in, or create an account.",
  email_not_found: "This provider did not supply an email address. Allow email access or use another sign-in method.",
  account_not_linked: "This email already has an account. Sign in using its existing method, then link this provider in Sign-in methods.",
  access_denied: "Sign-in was cancelled. You can try again or choose another method.",
  FRESH_SESSION_REQUIRED: "Sign out and sign in again before changing your sign-in methods.",
  EMAIL_NOT_VERIFIED: "Verify your email before signing in. Check your inbox or request another verification email.",
};
function checked(result: { error: { message?: string; code?: string } | null }) {
  if (result.error) throw new Error(errors[result.error.code ?? ""] ?? result.error.message ?? "Unable to complete this request. Try again.");
}

export function AuthPage() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const [accountsFor, setAccountsFor] = useState<{ userId: string; accounts: { id: string; providerId: string; accountId: string }[] } | null>(null);
  const [signInOptions, setSignInOptions] = useState<z.infer<typeof signInOptionsSchema> | null>(null);
  const [optionsUnavailable, setOptionsUnavailable] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const params = new URLSearchParams(search);
  const callbackError = params.get("error");
  const errorMessage = callbackError ? errors[callbackError] ?? "Sign-in could not be completed. Please try again." : null;
  useEffect(() => { heading.current?.focus(); setMessage(null); setShowPassword(false); }, [pathname]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/auth/sign-in-options", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Sign-in options unavailable");
        return signInOptionsSchema.parse(await response.json());
      })
      .then(setSignInOptions)
      .catch(() => { if (!controller.signal.aborted) setOptionsUnavailable(true); });
    return () => controller.abort();
  }, []);
  const accountUserId = auth.user?.userId;
  const accounts = accountsFor?.userId === accountUserId ? accountsFor?.accounts ?? [] : [];
  useEffect(() => {
    if (pathname !== "/account" || !accountUserId) return;
    let cancelled = false;
    void authClient.listAccounts().then(result => {
      if (cancelled) return;
      if (result.data) setAccountsFor({ userId: accountUserId, accounts: result.data });
      else { setFailure(true); setMessage("Sign-in methods could not be loaded. Reload this page to retry."); }
    });
    return () => { cancelled = true; };
  }, [pathname, accountUserId]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage(null); setFailure(false);
    try { await action(); } catch (error) {
      setFailure(true); setMessage(error instanceof Error ? error.message : "Request failed. Try again.");
    } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "");
    await run(async () => {
      if (pathname === "/sign-in") {
        const identifier = field("identifier").trim();
        checked(identifier.includes("@")
          ? await authClient.signIn.email({ email: identifier, password: field("password") })
          : await authClient.signIn.username({ username: identifier, password: field("password") }));
        await auth.reload(); navigate("/connect-laliga");
      } else if (pathname === "/register") {
        const registration = z.object({ name: z.string().trim().min(1).max(100), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, digits or underscores."), email: z.email(), password: z.string().min(12).max(128) }).safeParse({ name: field("name"), username: field("username"), email: field("email"), password: field("password") });
        if (!registration.success) throw new Error(registration.error.issues[0]?.message);
        checked(await authClient.signUp.email({ ...registration.data, callbackURL: "/verify-email" }));
        navigate("/verify-email");
      } else if (pathname === "/forgot-password") {
        checked(await authClient.requestPasswordReset({ email: field("email"), redirectTo: "/reset-password" }));
        setMessage("If this address has an account, you will receive a password reset link.");
      } else if (pathname === "/reset-password") {
        const token = params.get("token");
        if (!token) throw new Error("This link is incomplete. Request a new password reset email.");
        checked(await authClient.resetPassword({ token, newPassword: field("password") }));
        setMessage("Your password has changed. Sign in with your new password.");
      } else if (pathname === "/verify-email") {
        checked(await authClient.emailOtp.verifyEmail({ email: field("email"), otp: field("otp") }));
        setMessage("Your email is verified. You can now sign in.");
      } else if (pathname === "/account") {
        checked(await authClient.changePassword({ currentPassword: field("currentPassword"), newPassword: field("password"), revokeOtherSessions: true }));
        setMessage("Password changed. Other sessions have been signed out.");
      }
    });
  }
  const social = pathname === "/sign-in" || pathname === "/register";
  const availableProviders = providers.filter(provider => signInOptions?.directProviders[provider]);
  const accountProviders = providers.filter(provider => signInOptions?.directProviders[provider]
    || accounts.some(item => item.providerId === provider));
  const password = ["/sign-in", "/register", "/reset-password", "/account"].includes(pathname);
  const email = ["/register", "/forgot-password", "/verify-email"].includes(pathname);
  const account = pathname === "/account";
  return <section className="auth-page" aria-labelledby="auth-title">
    <header className="auth-heading">
      <p className="auth-eyebrow">LALIGA Fantasy Builder</p>
      <h1 id="auth-title" tabIndex={-1} ref={heading}>{titles[pathname]}</h1>
      <p className="auth-description">{descriptions[pathname]}</p>
      {pathname === "/verify-email" &&
        <p className="auth-description">Check your inbox for the code. If it is missing, check your spam folder.</p>}
    </header>
    {(message || errorMessage) && <div className={`auth-feedback ${failure || errorMessage ? "auth-feedback--error" : ""}`} role={failure || errorMessage ? "alert" : "status"}>
      <p>{message || errorMessage}</p>
      {message === errors.EMAIL_NOT_VERIFIED && <Link to="/verify-email">Verify your email</Link>}
    </div>}
    {social && optionsUnavailable && <p className="auth-field-hint" role="status">Other sign-in options could not be checked. You can still use your username or email.</p>}
    {social && availableProviders.length > 0 && <>
      <div className="auth-social" role="group" aria-label="Sign in with a provider">
        {availableProviders.map(provider => <Button key={provider} disabled={busy} loading={busyProvider === provider}
          loadingLabel={`Connecting to ${names[provider]}…`} variant="outline" className={`auth-provider auth-provider--${provider}`}
          icon={<ProviderLogo provider={provider} />} onClick={() => {
            setBusyProvider(provider);
            void run(async () => {
              checked(await authClient.signIn.social({ provider, callbackURL: "/connect-laliga", errorCallbackURL: "/sign-in" }));
            }).finally(() => setBusyProvider(null));
          }}>Continue with {names[provider]}</Button>)}
      </div>
      <p className="auth-social-hint">{pathname === "/register" ? "No new password needed with a provider." : "Use the account you already know."}</p>
      <div className="auth-divider"><span>or continue with {pathname === "/sign-in" ? "your password" : "email"}</span></div>
    </>}
    {account && !auth.user ? <p><Link to="/sign-in">Sign in</Link> to manage your account.</p> : <>
      {account && <>
        <p>Link another provider to this account. Sign in again first if your session is older than ten minutes.</p>
        {accountProviders.map(provider => {
          const linked = accounts.find(item => item.providerId === provider);
          const configured = signInOptions?.directProviders[provider] ?? false;
          const alternative = accounts.some(item => item.id !== linked?.id &&
            (item.providerId === "credential" || providers.some(other =>
              other === item.providerId && signInOptions?.directProviders[other])));
          return <div className="auth-method" key={provider}><span className="auth-method-name"><ProviderLogo provider={provider} />{names[provider]}</span><Button variant="outline" disabled={busy || accountsFor?.userId !== accountUserId || (linked ? !alternative : !configured)} onClick={() => void run(async () => {
            if (linked) {
              checked(await authClient.unlinkAccount({ accountId: linked.id }));
              const result = await authClient.listAccounts(); checked(result); setAccountsFor({ userId: accountUserId!, accounts: result.data ?? [] });
            } else checked(await authClient.linkSocial({ provider, callbackURL: "/account", errorCallbackURL: "/account" }));
          })}>{linked ? "Unlink" : "Link"}</Button>{!configured && <span className="auth-field-hint">Currently unavailable</span>}</div>;
        })}
        {!accounts.some(item => item.providerId === "credential") && <p>To add a password, <Link to="/forgot-password">request a recovery email</Link> and follow its verification link.</p>}
      </>}
      {(!account || accounts.some(item => item.providerId === "credential")) && <form key={pathname} className="auth-form" onSubmit={submit}>
        <fieldset disabled={busy}>
        <legend className="visually-hidden">{titles[pathname]} with {social ? "email or username" : "your account"}</legend>
        {pathname === "/register" && <>
          <div className="auth-field"><label htmlFor="name">Name</label><input id="name" name="name" required autoComplete="name" maxLength={100} /></div>
          <div className="auth-field"><label htmlFor="username">Username</label><input id="username" name="username" required autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" aria-describedby="username-hint" /><p id="username-hint" className="auth-field-hint">3–30 letters, digits or underscores.</p></div>
        </>}
        {pathname === "/sign-in" && <div className="auth-field"><label htmlFor="identifier">Username or email</label><input id="identifier" name="identifier" required autoComplete="username" autoCapitalize="none" spellCheck={false} /></div>}
        {email && <div className="auth-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" /></div>}
        {pathname === "/verify-email" && <div className="auth-field"><label htmlFor="otp">Verification code</label><input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} /></div>}
        {account && <div className="auth-field"><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>}
        {password && <div className="auth-field">
          <div className="auth-label-row"><label htmlFor="password">{pathname === "/sign-in" ? "Password" : "New password (at least 12 characters)"}</label>{pathname === "/sign-in" && <Link to="/forgot-password">Forgot password?</Link>}</div>
          <div className="auth-password"><input id="password" name="password" type={showPassword ? "text" : "password"} required minLength={pathname === "/sign-in" ? 1 : 12} maxLength={128} autoComplete={pathname === "/sign-in" ? "current-password" : "new-password"} />
            <button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
          </div>
        </div>}
        <Button type="submit" className="auth-submit" loading={busy && !busyProvider}>{pathname === "/verify-email" ? "Verify email" : account ? "Change password" : titles[pathname]}</Button>
        {pathname === "/verify-email" && <Button variant="outline" disabled={busy} onClick={(event) => {
          const form = event.currentTarget.closest("form");
          const email = String(new FormData(form!).get("email") ?? "");
          void run(async () => {
            if (!z.email().safeParse(email).success) throw new Error("Enter your email first.");
            checked(await authClient.sendVerificationEmail({ email }));
            setMessage("If verification is needed, a new code will arrive shortly.");
          });
        }}>Send a new code</Button>}
        </fieldset>
      </form>}
    </>}
    <nav className="auth-help" aria-label="Account help">
      {pathname === "/sign-in" ? <p>New to Fantasy Builder? <Link to="/register">Create account</Link></p>
        : pathname === "/register" ? <><p>Already have an account?</p><Link to="/sign-in" className={buttonVariants({ variant: "outline", className: "auth-sign-in-link" })}>Sign in</Link></>
          : <><Link to="/sign-in">Back to sign in</Link>{pathname !== "/forgot-password" && <Link to="/forgot-password">Forgot password?</Link>}</>}
    </nav>
    {social && <aside className="auth-connection-note"><span className="auth-note-mark" aria-hidden="true">↗</span><p><strong>Next: connect your LaLiga account</strong><br />After sign-in, we’ll take you to LaLiga to authorize access to your Fantasy team.</p></aside>}
  </section>;
}
