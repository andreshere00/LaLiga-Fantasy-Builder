import { locale } from "../../i18n";
import { copy as localizeCopy, useLanguage } from "../../i18n";
import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";

const euro = (value: number) => new Intl.NumberFormat(locale(), {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
}).format(value);
const date = (value: string) => new Date(value).toLocaleString(locale(), {
  dateStyle: "medium", timeStyle: "short",
});
const METHODS: Record<string, string> = {
  bid: "Market bid", clause: "Release clause", accepted_offer: "Accepted sale offer",
};

/** Present the projected squad, deadlines and ordered conditional transactions. */
export function LineupBuilderTradeDetails({ plan, target, playerName, playersById }: {
  plan: BuilderCandidate["tradingPlan"];
  target: LineupBuildDto["target"];
  playerName: (id: string) => string;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
}) {
  useLanguage();
  const photo = (id: string) => <ProfilePhoto className="lineup-builder-option-photo"
    url={playersById.get(id)?.photoUrl ?? null} fallback={<PersonIcon />} />;
  return <details className="lineup-builder-trades">
    <summary><span>{localizeCopy("Required trades and whole-squad projection")}</span>
      <span className="lineup-builder-trade-count">{plan.steps.length} {localizeCopy(plan.steps.length === 1 ? "trade" : "trades")}</span>
    </summary>
    <div className="lineup-builder-trades-body">
      <dl className="lineup-builder-projection">
        <div><dt>{localizeCopy("Projected cash")}</dt><dd>{localizeCopy(euro(plan.projectedCash))}</dd></div>
        <div><dt>{localizeCopy("Squad after trades")}</dt><dd>{plan.squadCount}<small> {localizeCopy(" / 24 players")}</small></dd></div>
        <div><dt>{localizeCopy("Squad value")}</dt><dd>{localizeCopy(euro(plan.squadValue))}</dd></div>
        <div><dt>{localizeCopy("Pending bid slots")}</dt><dd>{plan.reservedSquadSlots}</dd></div>
      </dl>
      <dl className="lineup-builder-deadlines">
        <div><dt>{localizeCopy("Sales must settle by")}</dt><dd><time dateTime={target.salesDeadline}>{localizeCopy(date(target.salesDeadline))}</time></dd></div>
        <div><dt>{localizeCopy("Release clauses close")}</dt><dd><time dateTime={target.clausesDeadline}>{localizeCopy(date(target.clausesDeadline))}</time></dd></div>
      </dl>
      <section className="lineup-builder-trade-section" aria-label={localizeCopy("Squad retained")}>
        <h5>{localizeCopy("Players retained ")}<span>{plan.retainedPlayerIds.length}</span></h5>
        {plan.retainedPlayerIds.length ? <ul className="lineup-builder-retained" aria-label={localizeCopy("Players retained")}>
          {plan.retainedPlayerIds.map((id) => <li key={id}>{photo(id)}<span>{playerName(id)}</span></li>)}
        </ul> : <p className="fb-helper">{localizeCopy("No players retained.")}</p>}
      </section>
      <section className="lineup-builder-trade-section" aria-label={localizeCopy("Trading purchases")}>
        <h5>{localizeCopy("Trading-only purchases ")}<span>{plan.tradingPurchases.length}</span></h5>
        {plan.tradingPurchases.length ? <ul className="lineup-builder-retained" aria-label={localizeCopy("Trading-only purchases")}>
          {plan.tradingPurchases.map((player) => <li key={player.playerId}>{photo(player.playerId)}
            <span>{player.name}<small>{localizeCopy(euro(player.marketValue))}</small></span></li>)}
        </ul> : <p className="fb-helper">{localizeCopy("No additional purchases for trading.")}</p>}
      </section>
      <section className="lineup-builder-trade-section" aria-label={localizeCopy("Planned transactions")}>
        <h5>{localizeCopy("Transaction plan")}</h5>
        {plan.steps.length ? <ol className="lineup-builder-transactions">
          {plan.steps.map((step, index) => <li key={`${step.action}-${step.playerId}-${index}`}>
            <div className="lineup-builder-transaction-heading">
              <span className="lineup-builder-transaction-number" aria-hidden="true">{index + 1}</span>
              {photo(step.playerId)}
              <div><h6>{localizeCopy(step.action === "buy" ? "Buy" : "Sell")} {playerName(step.playerId)}</h6>
                <span className="fb-helper">{localizeCopy(METHODS[step.method] ?? step.method.replaceAll("_", " "))}</span></div>
              <div className="lineup-builder-transaction-estimate"><small>{localizeCopy(step.action === "buy" ? "Estimated cost" : "Estimated proceeds")}</small><strong>{localizeCopy(euro(step.estimate))}</strong></div>
            </div>
            <p className="lineup-builder-settlement">{localizeCopy("Expected settlement ")}<time dateTime={step.settlementAt}>{localizeCopy(date(step.settlementAt))}</time></p>
            <dl className="lineup-builder-transaction-balances">
              <div><dt>{localizeCopy("Cash after")}</dt><dd>{localizeCopy(euro(step.cashAfter))}</dd></div>
              <div><dt>{localizeCopy("Squad after")}</dt><dd>{step.squadCountAfter} / 24</dd></div>
              <div><dt>{localizeCopy("Squad value")}</dt><dd>{localizeCopy(euro(step.squadValueAfter))}</dd></div>
              <div><dt>{localizeCopy("Debt limit")}</dt><dd>{localizeCopy(euro(step.debtLimit))}</dd></div>
            </dl>
            {step.conditions.length > 0 && <div className="lineup-builder-trade-conditions"><span>{localizeCopy("Conditions")}</span>
              <ul>{step.conditions.map((condition, i) => <li key={i}>{localizeCopy(condition)}</li>)}</ul>
            </div>}
          </li>)}
        </ol> : <p className="fb-helper">{localizeCopy("No trades are needed for this lineup.")}</p>}
      </section>
    </div>
  </details>;
}
