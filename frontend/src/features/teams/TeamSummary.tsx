import { useState } from "react";
import { t, useTranslation } from "../../i18n";
import { widgetDescription, type TeamWidget } from "./teamSummaries";

/**
 * A one-sentence description of what the widget below it is, shown to everyone. It sits right
 * after the heading so it is read in order, and the widget's own list, table or group points back
 * to it with `aria-describedby`, so it is announced again when that element is entered.
 */
export function TeamSummary({ id, widget }: { id: string; widget: TeamWidget }) {
  useTranslation();
  return (
    <p className="team-summary" id={id}>
      <span className="team-summary-tag">
        <svg className="team-summary-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 3h12v1.6H2zm0 4.2h12v1.6H2zm0 4.2h7.5V13H2z" />
        </svg>
        <span className="team-summary-label">{t("About")}</span>
      </span>
      <span className="team-summary-text">{widgetDescription(widget)}</span>
    </p>
  );
}

/**
 * Several widgets described in one block, each line named by its widget. Collapsed it is a single
 * line naming the widgets; opened it shows every description. The descriptions stay in the page
 * either way, each with its own id, so the widget it belongs to can still point back to it with
 * `aria-describedby`.
 */
export function TeamAbout({ items }: { items: readonly { id: string; widget: TeamWidget; label: string }[] }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <section className="team-about" aria-labelledby="team-about-title">
      <h3 id="team-about-title" className="team-about-title">
        <button
          type="button"
          className="team-about-toggle"
          aria-expanded={open}
          aria-controls="team-about-list"
          onClick={() => setOpen((current) => !current)}
        >
          <svg className="team-summary-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M2 3h12v1.6H2zm0 4.2h12v1.6H2zm0 4.2h7.5V13H2z" />
          </svg>
          <span className="team-summary-label">{t("About")}</span>
          <span className="team-about-names">{items.map((item) => item.label).join(" · ")}</span>
          <span className="team-idle-chevron" aria-hidden="true" />
        </button>
      </h3>
      <dl id="team-about-list" className="team-about-list" hidden={!open}>
        {items.map((item) => (
          <div key={item.id}>
            <dt>{item.label}</dt>
            <dd id={item.id}>{widgetDescription(item.widget)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
