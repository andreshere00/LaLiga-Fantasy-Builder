import { formatEuro } from "../../../api/format";
import shieldIconUrl from "../../../assets/button_shield.svg";
import { Help } from "../../../components/ui/Help";
import { clauseUnlockTooltip } from "../marketMessages";
import { protectionDescription } from "../model/protection";
import type { MarketRow } from "../model/row";
import { clauseUnlockCountdown, remainingLabel } from "../model/valueSeries";

export function ReleaseClauseDetail({ row, now }: { row: MarketRow; now: number }) {
  const protection = protectionDescription(row, now);
  const countdown = row.sellerKind === "laliga" ? null : clauseUnlockCountdown(row.clauseUnlockAt, now);
  const value = row.buyoutClause != null && row.buyoutClause > 0
    ? formatEuro(row.buyoutClause) : row.sellerKind === "laliga" ? "Not applicable" : "Unavailable";
  return (
    <span className="market-release-clause">
      <span className="market-clause-detail">
        {protection ? <Help content={protection}>
          <img className="market-clause-shield" src={shieldIconUrl} alt={protection} />
        </Help> : null}
        <span>Release clause: {value}</span>
      </span>
      {countdown != null ? <Help content={clauseUnlockTooltip(countdown)} className="market-clause-timer">
        <span aria-hidden="true">{remainingLabel(row.clauseUnlockAt, now)}</span>
      </Help> : null}
    </span>
  );
}
