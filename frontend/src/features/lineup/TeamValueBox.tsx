import { copy as localizeCopy, useLanguage } from "../../i18n";
import { Help } from "../../components/ui/Help";

import { formatTeamValue } from "../../api/format";
import {
  formatMarketValueStat,
  formatMarketValueWithChange,
} from "../market/marketValueStats";
import type { TeamValueEvolutionSnapshot } from "./teamValueEvolution";

type TeamValueBoxProps = {
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
  evolution,
  historyLoading = false,
  onRequestHistory,
}: TeamValueBoxProps) {
  useLanguage();
  const display = formatTeamValue(evolution?.today ?? null);
  const requestHistory = () => onRequestHistory?.();

  return (
    <div className="value-box">
      <Help content={evolution ? <>
            <span className="team-value-tooltip-line">
              {localizeCopy("Today team value: ")}{localizeCopy(formatMarketValueStat(evolution.today))}
            </span>
            <span className="team-value-tooltip-line">
              {localizeCopy("Yesterday team value:")}{" "}
              {localizeCopy(lookbackLine(evolution.yesterday, evolution.today, historyLoading))}
            </span>
            <span className="team-value-tooltip-line">
              {localizeCopy("Last 5 days team value:")}{" "}
              {localizeCopy(lookbackLine(evolution.fiveDaysAgo, evolution.today, historyLoading))}
            </span>
            <span className="team-value-tooltip-line">
              {localizeCopy("Last 14 days team value:")}{" "}
              {localizeCopy(lookbackLine(evolution.fourteenDaysAgo, evolution.today, historyLoading))}
            </span>
            <span className="team-value-tooltip-line">
              {localizeCopy("Last 30 days team value:")}{" "}
              {localizeCopy(lookbackLine(evolution.thirtyDaysAgo, evolution.today, historyLoading))}
            </span>
      </> : null} trigger={<span className="value-box-tooltip-wrap"
        tabIndex={evolution ? 0 : undefined}
        onPointerEnter={requestHistory} onFocus={requestHistory} />}>
        <span className="value-box-text">{localizeCopy(display)}</span>
      </Help>
    </div>
  );
}
