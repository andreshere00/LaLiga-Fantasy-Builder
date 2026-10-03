import { useId } from "react";

import "./TooltipPanel.css";
import "./ValueBox.css";

type ValueBoxProps = {
  label: string;
  value: string;
  iconSrc?: string;
  iconAlt?: string;
  /** Shown in a hover/focus tooltip on the trailing icon (e.g. negative balance). */
  iconTitle?: string;
  tone?: "default" | "negative";
};

export function ValueBox({
  label,
  value,
  iconSrc,
  iconAlt = "",
  iconTitle,
  tone = "default",
}: ValueBoxProps) {
  const tooltipId = useId();
  const shellClass =
    tone === "negative"
      ? "value-box-block-shell is-negative"
      : "value-box-block-shell";
  const withTooltip = iconTitle != null && iconTitle !== "";

  return (
    <div className="value-box-block">
      <span className="value-box-block-label">{label}</span>
      <div
        className={
          withTooltip ? `${shellClass} has-hover-tooltip-panel` : shellClass
        }
      >
        <span className="value-box-block-text">{value}</span>
        {iconSrc ? (
          iconTitle ? (
            <button
              type="button"
              className="value-box-block-icon-btn"
              aria-label={iconTitle}
              aria-describedby={withTooltip ? tooltipId : undefined}
            >
              <img
                className="value-box-block-icon"
                src={iconSrc}
                alt=""
                aria-hidden
              />
            </button>
          ) : (
            <img
              className="value-box-block-icon"
              src={iconSrc}
              alt={iconAlt}
              aria-hidden={iconAlt === ""}
            />
          )
        ) : null}
        {withTooltip ? (
          <span
            id={tooltipId}
            className="hover-tooltip-panel is-align-end"
            role="tooltip"
          >
            {iconTitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
