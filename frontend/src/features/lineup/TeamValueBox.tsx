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
  historyLoading?: boolean;
  onRequestHistory?: () => void;
};

function lookbackLine(
  reference: number | null,
  current: number | null,
  loading: boolean,
): string {
  if (loading) return "Loading…";
  return formatMarketValueWithChange(reference, current);
}

export function TeamValueBox({
  iconSrc,
  evolution,
  historyLoading = false,
  onRequestHistory,
}: TeamValueBoxProps) {
  const tooltipId = useId();
  const display = formatTeamValue(evolution?.today ?? null);
  const withTooltip = evolution != null;
  const requestHistory = () => onRequestHistory?.();

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
        onPointerEnter={requestHistory}
        onFocus={requestHistory}
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
              {lookbackLine(evolution.yesterday, evolution.today, historyLoading)}
            </span>
            <span className="team-value-tooltip-line">
              Last 5 days team value:{" "}
              {lookbackLine(evolution.fiveDaysAgo, evolution.today, historyLoading)}
            </span>
            <span className="team-value-tooltip-line">
              Last 14 days team value:{" "}
              {lookbackLine(evolution.fourteenDaysAgo, evolution.today, historyLoading)}
            </span>
            <span className="team-value-tooltip-line">
              Last 30 days team value:{" "}
              {lookbackLine(evolution.thirtyDaysAgo, evolution.today, historyLoading)}
            </span>
          </span>
        ) : null}
      </span>
    </div>
  );
}
