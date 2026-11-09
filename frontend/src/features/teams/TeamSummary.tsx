import { t, useTranslation } from "../../i18n";

/**
 * A one-sentence reading of the widget below it, shown to everyone. It sits right after the
 * heading so it is read in order, and the widget's own list, table or group points back to it
 * with `aria-describedby`, so it is announced again when that element is entered.
 */
export function TeamSummary({ id, text }: { id: string; text: string | null }) {
  useTranslation();
  if (!text) return null;
  return (
    <p className="team-summary" id={id}>
      <span className="team-summary-tag">
        <svg className="team-summary-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 3h12v1.6H2zm0 4.2h12v1.6H2zm0 4.2h7.5V13H2z" />
        </svg>
        <span className="team-summary-label">{t("Summary")}</span>
      </span>
      <span className="team-summary-text">{text}</span>
    </p>
  );
}
