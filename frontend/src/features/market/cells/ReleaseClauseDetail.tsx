import { copy as localizeCopy, useLanguage } from "../../../i18n";
import { formatEuro } from "../../../api/format";
import shieldIconUrl from "../../../assets/button_shield.svg";
import { Help } from "../../../components/ui/Help";
import { clauseUnlockTooltip } from "../marketMessages";
import { protectionDescription, type ReleaseClauseData } from "../model/protection";
import { clauseUnlockCountdown, remainingLabel } from "../model/valueSeries";

export function ReleaseClauseDetail({ row, now }: { row: ReleaseClauseData; now: number }) {
  useLanguage();
  const protection = protectionDescription(row, now);
  const countdown = row.sellerKind === "laliga" ? null : clauseUnlockCountdown(row.clauseUnlockAt, now);
  const value = row.buyoutClause != null && row.buyoutClause > 0
    ? formatEuro(row.buyoutClause) : row.sellerKind === "laliga" ? "Not applicable" : "Unavailable";
  return (
    <span className="market-release-clause">
      <span className="market-clause-detail">
        {protection ? <Help content={localizeCopy(protection)} className="market-clause-protection">
          <img className="market-clause-shield" src={shieldIconUrl} alt={localizeCopy(protection)} />
        </Help> : null}
        <span>{localizeCopy("Release clause: ")}<span className={row.buyoutClause != null && row.buyoutClause > 0 ? "market-clause-amount" : undefined}>{localizeCopy(value)}</span></span>
      </span>
      {countdown != null ? <Help content={localizeCopy(clauseUnlockTooltip(countdown))} className="market-clause-timer">
        <span aria-hidden="true">{localizeCopy(remainingLabel(row.clauseUnlockAt, now))}</span>
      </Help> : null}
    </span>
  );
}
