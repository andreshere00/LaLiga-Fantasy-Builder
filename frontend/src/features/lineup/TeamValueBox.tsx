import { useId } from "react";

import { formatTeamValue } from "../../api/format";
import {
  formatMarketValueStat,
  formatMarketValueWithChange,
} from "../market/marketValueStats";
import type { TeamValueEvolutionSnapshot } from "./teamValueEvolution";

type TeamValueBoxProps = {
  iconSrc: string;
  evolution: TeamValueEvolutionSnapshot | null;
};

export function TeamValueBox({ iconSrc, evolution }: TeamValueBoxProps) {
  const tooltipId = useId();
  const display = formatTeamValue(evolution?.today ?? null);
  const withTooltip = evolution != null;

  return (
    <div className="value-box">
      <span
        className={
          withTooltip
            ? "value-box-tooltip-wrap has-hover-tooltip-panel"
            : "value-box-tooltip-wrap"
        }
        tabIndex={withTooltip ? 0 : undefined}
        aria-describedby={withTooltip ? tooltipId : undefined}
      >
        <span className="value-box-text">{display}</span>
        <img className="value-box-icon" src={iconSrc} alt="" aria-hidden="true" />
        {withTooltip ? (
          <span
            id={tooltipId}
            className="hover-tooltip-panel is-align-end team-value-tooltip"
            role="tooltip"
          >
            <span className="team-value-tooltip-line">
              Today team value: {formatMarketValueStat(evolution.today)}
            </span>
            <span className="team-value-tooltip-line">
              Yesterday team value:{" "}
              {formatMarketValueWithChange(evolution.yesterday, evolution.today)}
            </span>
            <span className="team-value-tooltip-line">
              Last 5 days team value:{" "}
              {formatMarketValueWithChange(evolution.fiveDaysAgo, evolution.today)}
            </span>
            <span className="team-value-tooltip-line">
              Last 14 days team value:{" "}
              {formatMarketValueWithChange(evolution.fourteenDaysAgo, evolution.today)}
            </span>
            <span className="team-value-tooltip-line">
              Last 30 days team value:{" "}
              {formatMarketValueWithChange(evolution.thirtyDaysAgo, evolution.today)}
            </span>
          </span>
        ) : null}
      </span>
    </div>
  );
}
