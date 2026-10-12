import { Help } from "../../components/ui/Help";

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
  const display = formatTeamValue(evolution?.today ?? null);
  const requestHistory = () => onRequestHistory?.();

  return (
    <div className="value-box">
      <Help content={evolution ? <>
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
      </> : null} trigger={<span className="value-box-tooltip-wrap"
        onPointerEnter={requestHistory} onFocus={requestHistory} />}>
        <span className="value-box-text">{display}</span>
        <img className="value-box-icon" src={iconSrc} alt="" aria-hidden="true" />
      </Help>
    </div>
  );
}
