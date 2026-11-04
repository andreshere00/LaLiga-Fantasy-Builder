import { t, useTranslation } from "../i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button, buttonVariants } from "../components/ui/Button";
import { authClient } from "./auth-client";
import { useAuth } from "./AuthProvider";
import { ProviderLogo, type SocialProvider } from "./ProviderLogo";
import "./AuthPages.css";

const providers: SocialProvider[] = ["google", "facebook", "apple"];
const providerNames = { google: "Google", facebook: "Facebook", apple: "Apple" };
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, digits or underscores.");
type Action = "username" | "email" | "password" | "delete";
type LinkedAccount = { id: string; providerId: string; accountId: string };

function checked(result: { error: { message?: string; code?: string } | null }) {
  if (result.error) throw new Error(result.error.message ?? "The change could not be saved. Try again.");
}

export function AccountPage() {
  useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; parameters?: Record<string, string | number>; error: boolean } | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [accountsFor, setAccountsFor] = useState<{ userId: string; accounts: LinkedAccount[] } | null>(null);
  const [available, setAvailable] = useState<Record<SocialProvider, boolean>>({ google: false, facebook: false, apple: false });
  const userId = auth.user?.userId;
  const accounts = accountsFor && accountsFor.userId === userId ? accountsFor.accounts : [];
  const methodsReady = accountsFor?.userId === userId;
  const hasPassword = accounts.some(account => account.providerId === "credential");

  useEffect(() => {
    setActive(null);
    setPendingEmail(null);
    setFeedback(null);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void authClient.listAccounts().then(result => {
      if (cancelled) return;
      if (result.error || !result.data) setFeedback({ text: "Sign-in methods could not be loaded. Reload the page to retry.", error: true });
      else setAccountsFor({ userId, accounts: result.data });
    });
    void fetch("/auth/sign-in-options").then(response => response.ok ? response.json() : null).then(value => {
      if (cancelled) return;
      const parsed = z.object({ directProviders: z.object({ google: z.boolean(), facebook: z.boolean(), apple: z.boolean() }) }).safeParse(value);
      if (parsed.success) setAvailable(parsed.data.directProviders);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try { await action(); }
    catch (error) { setFeedback({ text: error instanceof Error ? error.message : "The change could not be saved. Try again.", error: true }); }
    finally { setBusy(false); }
  }
  function select(action: Action) {
    setActive(current => current === action ? null : action);
    setFeedback(null);
  }
  function panel(action: Action, label: string, detail: string, disabled = false) {
    return <button type="button" className="auth-setting-trigger" aria-expanded={active === action} aria-controls={`setting-${action}`}
      disabled={busy || disabled} onClick={() => select(action)}><span><strong>{t(label)}</strong><small>{t(detail)}</small></span><span aria-hidden="true">{active === action ? "−" : "+"}</span></button>;
  }
  if (!auth.user) return <section className="auth-page" aria-labelledby="account-title"><h1 id="account-title">{t("Account settings")}</h1><p><Link to="/sign-in">{t("Sign in")}</Link> {t(" to manage your account.")}</p></section>;

  return <section className="auth-page auth-page--settings" aria-labelledby="account-title">
    <header className="auth-heading"><p className="auth-eyebrow">{t("LALIGA Fantasy Builder")}</p><h1 id="account-title">{t("Account settings")}</h1>
      <p className="auth-description">{t("Manage your Fantasy Builder details and sign-in methods.")}</p></header>
    {feedback && <div className={`auth-feedback${feedback.error ? " auth-feedback--error" : ""}`} role={feedback.error ? "alert" : "status"}><p>{t(feedback.text, feedback.parameters)}</p></div>}

    <section className="auth-settings-group" aria-labelledby="laliga-settings-title">
      <h2 id="laliga-settings-title">{t("LaLiga account")}</h2>
      <p>{t("Your LaLiga profile is managed by LaLiga, separately from this account.")}</p>
      <a className={buttonVariants({ variant: "outline", className: "auth-setting-link" })} href="https://miliga.laliga.com/">{t("Open LaLiga account ")}<span aria-hidden="true">↗</span></a>
    </section>

    <section className="auth-settings-group" aria-labelledby="profile-settings-title">
      <h2 id="profile-settings-title">{t("Profile and security")}</h2>
      <div className="auth-setting">{panel("username", "Change username", auth.user.username ? t("Current: {{0}}", { 0: auth.user.username }) : "Choose your sign-in username")}
        {active === "username" && <form id="setting-username" className="auth-setting-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const username = String(new FormData(event.currentTarget).get("username") ?? ""); void run(async () => {
          const parsed = usernameSchema.safeParse(username); if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
          if (parsed.data === auth.user?.username) throw new Error("Enter a different username.");
          checked(await authClient.updateUser({ username: parsed.data })); await auth.reload(); setActive(null); setFeedback({ text: "Username updated.", error: false });
        }); }}><div className="auth-field"><label htmlFor="new-username">{t("New username")}</label><input id="new-username" name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" autoComplete="username" defaultValue={auth.user.username ?? ""} /><p className="auth-field-hint">{t("3–30 letters, digits or underscores.")}</p></div><Button type="submit" loading={busy}>{t("Save username")}</Button></form>}
      </div>
      <div className="auth-setting">{panel("email", "Change email", t("Current: {{0}}", { 0: auth.user.email ?? "No email" }))}
        {active === "email" && <div id="setting-email" className="auth-setting-form">
          {!pendingEmail ? <form className="auth-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const newEmail = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase(); void run(async () => {
            if (!z.email().safeParse(newEmail).success) throw new Error("Enter a valid email address.");
            if (newEmail === auth.user?.email?.toLowerCase()) throw new Error("Enter a different email address.");
            checked(await authClient.emailOtp.requestEmailChange({ newEmail })); setPendingEmail(newEmail);
            setFeedback({ text: "We sent an eight-digit code to {{0}}. It expires in 10 minutes.", parameters: { 0: newEmail }, error: false });
          }); }}><div className="auth-field"><label htmlFor="new-email">{t("New email address")}</label><input id="new-email" name="email" type="email" autoComplete="email" required /></div><Button type="submit" loading={busy}>{t("Send verification code")}</Button></form>
          : <form className="auth-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const otp = String(new FormData(event.currentTarget).get("otp") ?? ""); void run(async () => {
            if (!/^[0-9]{8}$/.test(otp)) throw new Error("Enter the eight-digit code.");
            checked(await authClient.emailOtp.changeEmail({ newEmail: pendingEmail, otp })); await auth.reload(); setPendingEmail(null); setActive(null);
            setFeedback({ text: "Email updated and verified.", error: false });
          }); }}><p>{t("Enter the code sent to ")}<strong>{pendingEmail}</strong>.</p><div className="auth-field"><label htmlFor="email-code">{t("Verification code")}</label><input id="email-code" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required /></div><Button type="submit" loading={busy}>{t("Confirm new email")}</Button><button type="button" className="auth-text-action" disabled={busy} onClick={() => { setPendingEmail(null); setFeedback(null); }}>{t("Use another address")}</button></form>}
        </div>}
      </div>
      <div className="auth-setting">{panel("password", "Change password", !methodsReady ? "Loading sign-in methods…" : hasPassword ? "Update your password and sign out other sessions" : "Add a password through email recovery", !methodsReady)}
        {active === "password" && <div id="setting-password" className="auth-setting-form">{hasPassword ? <form className="auth-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const currentPassword = String(data.get("currentPassword") ?? ""); const newPassword = String(data.get("newPassword") ?? ""); void run(async () => {
          if (newPassword.length < 12 || newPassword.length > 128) throw new Error("Use a password between 12 and 128 characters.");
          checked(await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })); setActive(null); setFeedback({ text: "Password changed. Other sessions have been signed out.", error: false });
        }); }}><div className="auth-field"><label htmlFor="current-password">{t("Current password")}</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div><div className="auth-field"><label htmlFor="new-password">{t("New password")}</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></div><Button type="submit" loading={busy}>{t("Save password")}</Button></form>
          : <p>{t("Use ")}<Link to="/forgot-password">{t("password recovery")}</Link> {t(" to add a password to this account.")}</p>}</div>}
      </div>
    </section>

    <section className="auth-settings-group" aria-labelledby="methods-title"><h2 id="methods-title">{t("Sign-in methods")}</h2><p>{t("Link or unlink a provider. Sign in again if your session is older than ten minutes.")}</p>
      {methodsReady && !providers.some(provider => available[provider] || accounts.some(account => account.providerId === provider)) &&
        <p>{hasPassword ? t("Email or username and password is your current sign-in method.") : t("No other sign-in providers are available.")}</p>}
      {providers.filter(provider => available[provider] || accounts.some(account => account.providerId === provider)).map(provider => {
        const linked = accounts.find(account => account.providerId === provider);
        const alternative = accounts.some(account => account.id !== linked?.id && (account.providerId === "credential" || providers.some(other => other === account.providerId && available[other])));
        return <div className="auth-method" key={provider}><span className="auth-method-name"><ProviderLogo provider={provider} />{providerNames[provider]}</span><Button variant="outline" disabled={busy || accountsFor?.userId !== userId || (linked ? !alternative : !available[provider])} onClick={() => void run(async () => {
          if (linked) { checked(await authClient.unlinkAccount({ accountId: linked.id })); const result = await authClient.listAccounts(); checked(result); setAccountsFor({ userId: userId!, accounts: result.data ?? [] }); setFeedback({ text: "{{0}} unlinked.", parameters: { 0: providerNames[provider] }, error: false }); }
          else checked(await authClient.linkSocial({ provider, callbackURL: "/account", errorCallbackURL: "/account" }));
        })}>{linked ? t("Unlink") : t("Link")}</Button></div>;
      })}
    </section>

    <section className="auth-settings-group auth-settings-danger" aria-labelledby="delete-title"><h2 id="delete-title">{t("Delete account")}</h2>
      <p>{t("Permanently delete this Fantasy Builder account and remove its LaLiga connection. Your LaLiga account itself remains available at LaLiga.")}</p>
      {panel("delete", "Delete account", methodsReady ? "This cannot be undone" : "Loading sign-in methods…", !methodsReady)}
      {active === "delete" && <form id="setting-delete" className="auth-setting-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(async () => {
        if (data.get("confirmation") !== "DELETE") throw new Error("Type DELETE to confirm.");
        checked(await authClient.deleteUser({ ...(hasPassword ? { password: String(data.get("password") ?? "") } : {}) }));
        await auth.forgetDeletedAccount(); navigate("/sign-in?deleted=1", { replace: true });
      }); }}><p>{t("This removes your Fantasy Builder sign-in and disconnects LaLiga. It does not delete your LaLiga account.")}</p>
        <div className="auth-field"><label htmlFor="delete-confirmation">{t("Type DELETE to confirm")}</label><input id="delete-confirmation" name="confirmation" required autoComplete="off" /></div>
        {hasPassword && <div className="auth-field"><label htmlFor="delete-password">{t("Current password")}</label><input id="delete-password" name="password" type="password" autoComplete="current-password" required /></div>}
        {!hasPassword && <p className="auth-field-hint">{t("If your session is no longer recent, sign in again before deleting.")}</p>}
        <Button type="submit" loading={busy}>{t("Permanently delete account")}</Button>
      </form>}
    </section>
  </section>;
}
