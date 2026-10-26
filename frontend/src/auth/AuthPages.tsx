import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button, buttonVariants } from "../components/ui/Button";
import { authClient } from "./auth-client";
import { useAuth } from "./AuthProvider";
import { passwordIssues } from "./passwordPolicy";
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
  "/forgot-password": "Reset your password", "/reset-password": "Choose a new password",
};
const descriptions: Record<string, string> = {
  "/sign-in": "Your leagues, your squad, your next move.",
  "/register": "Choose how you want to sign in to Fantasy Builder.",
  "/verify-email": "Enter the eight-digit code from your inbox. It expires in ten minutes.",
  "/forgot-password": "We’ll email you a link to choose a new password.",
  "/reset-password": "Choose a strong password you haven’t used before.",
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
const VERIFICATION_EMAIL_KEY = "lfb-pending-verification-email";
const SIGN_IN_IDENTIFIER_KEY = "lfb-pending-sign-in-identifier";
const VERIFIED_NOTICE = "Your email is verified. Sign in to continue.";

function isEmailAddress(value: string): boolean {
  return z.email().safeParse(value).success;
}

function readVerificationEmail(): string {
  try {
    const value = sessionStorage.getItem(VERIFICATION_EMAIL_KEY) ?? "";
    return isEmailAddress(value) ? value : "";
  } catch {
    return "";
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function writeVerificationEmail(email: string | null): void {
  writeStored(VERIFICATION_EMAIL_KEY, email);
}

function readSignInIdentifier(): string {
  try {
    return sessionStorage.getItem(SIGN_IN_IDENTIFIER_KEY) ?? "";
  } catch {
    return "";
  }
}

function emailFromNavigation(state: unknown): string {
  if (typeof state !== "object" || state === null || !("email" in state)) return "";
  const email = state.email;
  return typeof email === "string" && isEmailAddress(email) ? email : "";
}

function signInHandoff(state: unknown): { identifier: string; verified: boolean } {
  if (typeof state !== "object" || state === null) return { identifier: "", verified: false };
  const identifier = "identifier" in state && typeof state.identifier === "string"
    ? state.identifier : "";
  return { identifier, verified: "verified" in state && state.verified === true };
}

function checked(result: { error: { message?: string; code?: string } | null }) {
  if (result.error) throw new Error(errors[result.error.code ?? ""] ?? result.error.message ?? "Unable to complete this request. Try again.");
}

export function AuthPage() {
  const { pathname, search, state: navigationState } = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState(readVerificationEmail);
  const [busyProvider, setBusyProvider] = useState<SocialProvider | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordProblems, setPasswordProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  const [signInOptions, setSignInOptions] = useState<z.infer<typeof signInOptionsSchema> | null>(null);
  const [optionsUnavailable, setOptionsUnavailable] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const params = new URLSearchParams(search);
  const callbackError = params.get("error");
  const errorMessage = callbackError ? errors[callbackError] ?? "Sign-in could not be completed. Please try again." : null;
  const deleted = pathname === "/sign-in" && params.get("deleted") === "1";
  const navigationEmail = emailFromNavigation(navigationState);
  const pendingVerificationEmail = pathname === "/verify-email"
    ? navigationEmail || rememberedEmail
    : "";
  const handoff = pathname === "/sign-in" ? signInHandoff(navigationState) : null;
  useEffect(() => {
    heading.current?.focus(); setMessage(null); setShowPassword(false); setPasswordProblems([]);
  }, [pathname]);
  useEffect(() => {
    if (!navigationEmail) return;
    writeVerificationEmail(navigationEmail);
    setRememberedEmail(navigationEmail);
  }, [navigationEmail]);
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
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage(null); setFailure(false);
    try { await action(); } catch (error) {
      setFailure(true); setMessage(error instanceof Error ? error.message : "Request failed. Try again.");
    } finally { setBusy(false); }
  }
  function problemsFor(data: FormData): string[] {
    if (pathname !== "/register" && pathname !== "/reset-password") return [];
    const personal = [data.get("username"), data.get("email")].map(value => String(value ?? ""));
    return passwordIssues(String(data.get("password") ?? ""), personal);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "");
    await run(async () => {
      const problems = problemsFor(data);
      if (problems.length) {
        setPasswordProblems(problems);
        throw new Error(`Choose a stronger password. ${problems[0]}`);
      }
      if (pathname === "/sign-in") {
        const identifier = field("identifier").trim();
        const result = identifier.includes("@")
          ? await authClient.signIn.email({ email: identifier, password: field("password") })
          : await authClient.signIn.username({ username: identifier, password: field("password") });
        if (result.error?.code === "EMAIL_NOT_VERIFIED") {
          writeStored(SIGN_IN_IDENTIFIER_KEY, identifier);
          if (isEmailAddress(identifier)) {
            writeVerificationEmail(identifier);
            setRememberedEmail(identifier);
          }
        }
        checked(result);
        await auth.reload(); navigate("/connect-laliga");
      } else if (pathname === "/register") {
        const registration = z.object({ name: z.string().trim().min(1).max(100), username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, digits or underscores."), email: z.email(), password: z.string().min(12).max(128) }).safeParse({ name: field("name"), username: field("username"), email: field("email"), password: field("password") });
        if (!registration.success) throw new Error(registration.error.issues[0]?.message);
        checked(await authClient.signUp.email({ ...registration.data, callbackURL: "/verify-email" }));
        writeVerificationEmail(registration.data.email);
        writeStored(SIGN_IN_IDENTIFIER_KEY, registration.data.username);
        setRememberedEmail(registration.data.email);
        navigate("/verify-email", { state: { email: registration.data.email } });
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
        const verifiedEmail = field("email");
        const identifier = readSignInIdentifier() || verifiedEmail;
        writeVerificationEmail(null);
        writeStored(SIGN_IN_IDENTIFIER_KEY, null);
        setRememberedEmail("");
        navigate("/sign-in", { state: { identifier, verified: true } });
      }
    });
  }
  const social = pathname === "/sign-in" || pathname === "/register";
  const availableProviders = providers.filter(provider => signInOptions?.directProviders[provider]);
  const password = ["/sign-in", "/register", "/reset-password"].includes(pathname);
  const email = ["/register", "/forgot-password", "/verify-email"].includes(pathname);
  return <section className="auth-page" aria-labelledby="auth-title">
    <header className="auth-heading">
      <p className="auth-eyebrow">LALIGA Fantasy Builder</p>
      <h1 id="auth-title" tabIndex={-1} ref={heading}>{titles[pathname]}</h1>
      <p className="auth-description">{descriptions[pathname]}</p>
      {pathname === "/verify-email" &&
        <p className="auth-description">Check your inbox for the code. If it is missing, check your spam folder.</p>}
    </header>
    {handoff?.verified && !message && !errorMessage && <div className="auth-feedback" role="status">
      <p>{VERIFIED_NOTICE}</p>
    </div>}
    {(message || errorMessage || deleted) && <div className={`auth-feedback ${failure || errorMessage ? "auth-feedback--error" : ""}`} role={failure || errorMessage ? "alert" : "status"}>
      <p>{message || errorMessage || "Your Fantasy Builder account was deleted."}</p>
      {message === errors.EMAIL_NOT_VERIFIED && <Link to="/verify-email"
        state={rememberedEmail ? { email: rememberedEmail } : undefined}>Verify your email</Link>}
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
    <form key={pathname} className="auth-form" onSubmit={submit}
      onInput={event => setPasswordProblems(problemsFor(new FormData(event.currentTarget)))}>
        <fieldset disabled={busy}>
        <legend className="visually-hidden">{titles[pathname]} with {social ? "email or username" : "your account"}</legend>
        {pathname === "/register" && <>
          <div className="auth-field"><label htmlFor="name">Name</label><input id="name" name="name" required autoComplete="name" maxLength={100} /></div>
          <div className="auth-field"><label htmlFor="username">Username</label><input id="username" name="username" required autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" aria-describedby="username-hint" /><p id="username-hint" className="auth-field-hint">3–30 letters, digits or underscores.</p></div>
        </>}
        {pathname === "/sign-in" && <div className="auth-field"><label htmlFor="identifier">Username or email</label><input id="identifier" name="identifier" required autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={handoff?.identifier} /></div>}
        {email && <div className="auth-field"><label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            defaultValue={pendingVerificationEmail} /></div>}
        {pathname === "/verify-email" && <div className="auth-field"><label htmlFor="otp">Verification code</label><input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" required minLength={8} maxLength={8} /></div>}
        {password && <div className="auth-field">
          <div className="auth-label-row"><label htmlFor="password">{pathname === "/sign-in" ? "Password" : "New password (at least 12 characters)"}</label>{pathname === "/sign-in" && <Link to="/forgot-password">Forgot password?</Link>}</div>
          <div className="auth-password"><input id="password" name="password" type={showPassword ? "text" : "password"} required minLength={pathname === "/sign-in" ? 1 : 12} maxLength={128} autoComplete={pathname === "/sign-in" ? "current-password" : "new-password"} aria-describedby={pathname === "/sign-in" ? undefined : "password-hint"} aria-invalid={passwordProblems.length > 0 || undefined} />
            <button type="button" className="auth-password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
          </div>
          {pathname !== "/sign-in" && <p id="password-hint" className="auth-field-hint" aria-live="polite">
            {passwordProblems[0] ?? "Longer is better. A few random words work well."}</p>}
        </div>}
        <Button type="submit" className="auth-submit" loading={busy && !busyProvider}>{pathname === "/verify-email" ? "Verify email" : titles[pathname]}</Button>
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
      </form>
    <nav className="auth-help" aria-label="Account help">
      {pathname === "/sign-in" ? <p>New to Fantasy Builder? <Link to="/register">Create account</Link></p>
        : pathname === "/register" ? <><p>Already have an account?</p><Link to="/sign-in" className={buttonVariants({ variant: "outline", className: "auth-sign-in-link" })}>Sign in</Link></>
          : <><Link to="/sign-in">Back to sign in</Link>{pathname !== "/forgot-password" && <Link to="/forgot-password">Forgot password?</Link>}</>}
    </nav>
    {social && <aside className="auth-connection-note"><span className="auth-note-mark" aria-hidden="true">↗</span><p><strong>Next: connect your LaLiga account</strong><br />After sign-in, we’ll take you to LaLiga to authorize access to your Fantasy team.</p></aside>}
  </section>;
}
