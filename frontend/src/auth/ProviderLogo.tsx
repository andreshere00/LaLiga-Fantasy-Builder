export type SocialProvider = "google" | "facebook" | "apple";

/** Decorative marks; the adjacent button text supplies its accessible name. */
export function ProviderLogo({ provider }: { provider: SocialProvider }) {
  if (provider === "google") {
    return <img className="auth-provider-logo" src="/providers/google.png" width={20} height={20} alt="" />;
  }
  if (provider === "facebook") {
    return <img className="auth-provider-logo" src="/providers/facebook.png" width={20} height={20} alt="" />;
  }
  return <span className="auth-apple-logo" aria-hidden="true">
    <img className="auth-apple-logo--light" src="/providers/apple-white.svg" alt="" />
    <img className="auth-apple-logo--dark" src="/providers/apple-black.svg" alt="" />
  </span>;
}
