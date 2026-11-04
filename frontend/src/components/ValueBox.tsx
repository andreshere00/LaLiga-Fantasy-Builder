import { copy as localizeCopy, useLanguage } from "../i18n";
import { Help } from "./ui/Help";
import "./ValueBox.css";

type ValueBoxProps = { label: string; value: string; iconSrc?: string; iconAlt?: string;
  iconTitle?: string; tone?: "default" | "negative"; };

export function ValueBox({ label, value, iconSrc, iconAlt = "", iconTitle, tone = "default" }: ValueBoxProps) {
  useLanguage();
  return (
    <div className="value-box-block">
      <span className="value-box-block-label">{localizeCopy(label)}</span>
      <div className={"value-box-block-shell" + (tone === "negative" ? " is-negative" : "")}>
        <span className="value-box-block-text">{localizeCopy(value)}</span>
        {iconSrc ? <Help content={localizeCopy(iconTitle)}>
          <img className="value-box-block-icon" src={iconSrc} alt={localizeCopy(iconAlt)} aria-hidden={iconAlt === ""} />
        </Help> : null}
      </div>
    </div>
  );
}
