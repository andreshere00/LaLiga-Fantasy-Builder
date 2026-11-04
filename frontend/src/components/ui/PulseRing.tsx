import { copy as localizeCopy, useLanguage } from "../../i18n";
type LoaderProps = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
};

export function PulseRing({ size = "lg", className = "", label = "Loading players…" }: LoaderProps) {
  useLanguage();
  return (
    <div className={`fb-loader ${className}`} role="status" aria-live="polite">
      <span className={`fb-pulse-ring fb-pulse-ring--${size}`} aria-hidden="true">
        <span className="fb-pulse-ring__outer" />
        <span className="fb-pulse-ring__inner" />
      </span>
      <span className="fb-helper">{localizeCopy(label)}</span>
    </div>
  );
}
