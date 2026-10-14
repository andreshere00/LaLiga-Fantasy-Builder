import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";

const euro = (value: number) => new Intl.NumberFormat("en-IE", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
}).format(value);
const date = (value: string) => new Date(value).toLocaleString(undefined, {
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
  const photo = (id: string) => <ProfilePhoto className="lineup-builder-option-photo"
    url={playersById.get(id)?.photoUrl ?? null} fallback={<PersonIcon />} />;
  return <details className="lineup-builder-trades">
    <summary><span>Required trades and whole-squad projection</span>
      <span className="lineup-builder-trade-count">{plan.steps.length} {plan.steps.length === 1 ? "trade" : "trades"}</span>
    </summary>
    <div className="lineup-builder-trades-body">
      <dl className="lineup-builder-projection">
        <div><dt>Projected cash</dt><dd>{euro(plan.projectedCash)}</dd></div>
        <div><dt>Squad after trades</dt><dd>{plan.squadCount}<small> / 24 players</small></dd></div>
        <div><dt>Squad value</dt><dd>{euro(plan.squadValue)}</dd></div>
        <div><dt>Pending bid slots</dt><dd>{plan.reservedSquadSlots}</dd></div>
      </dl>
      <dl className="lineup-builder-deadlines">
        <div><dt>Sales must settle by</dt><dd><time dateTime={target.salesDeadline}>{date(target.salesDeadline)}</time></dd></div>
        <div><dt>Release clauses close</dt><dd><time dateTime={target.clausesDeadline}>{date(target.clausesDeadline)}</time></dd></div>
      </dl>
      <section className="lineup-builder-trade-section" aria-label="Squad retained">
        <h5>Players retained <span>{plan.retainedPlayerIds.length}</span></h5>
        {plan.retainedPlayerIds.length ? <ul className="lineup-builder-retained" aria-label="Players retained">
          {plan.retainedPlayerIds.map((id) => <li key={id}>{photo(id)}<span>{playerName(id)}</span></li>)}
        </ul> : <p className="fb-helper">No players retained.</p>}
      </section>
      <section className="lineup-builder-trade-section" aria-label="Trading purchases">
        <h5>Trading-only purchases <span>{plan.tradingPurchases.length}</span></h5>
        {plan.tradingPurchases.length ? <ul className="lineup-builder-retained" aria-label="Trading-only purchases">
          {plan.tradingPurchases.map((player) => <li key={player.playerId}>{photo(player.playerId)}
            <span>{player.name}<small>{euro(player.marketValue)}</small></span></li>)}
        </ul> : <p className="fb-helper">No additional purchases for trading.</p>}
      </section>
      <section className="lineup-builder-trade-section" aria-label="Planned transactions">
        <h5>Transaction plan</h5>
        {plan.steps.length ? <ol className="lineup-builder-transactions">
          {plan.steps.map((step, index) => <li key={`${step.action}-${step.playerId}-${index}`}>
            <div className="lineup-builder-transaction-heading">
              <span className="lineup-builder-transaction-number" aria-hidden="true">{index + 1}</span>
              {photo(step.playerId)}
              <div><h6>{step.action === "buy" ? "Buy" : "Sell"} {playerName(step.playerId)}</h6>
                <span className="fb-helper">{METHODS[step.method] ?? step.method.replaceAll("_", " ")}</span></div>
              <div className="lineup-builder-transaction-estimate"><small>Estimated {step.action === "buy" ? "cost" : "proceeds"}</small><strong>{euro(step.estimate)}</strong></div>
            </div>
            <p className="lineup-builder-settlement">Expected settlement <time dateTime={step.settlementAt}>{date(step.settlementAt)}</time></p>
            <dl className="lineup-builder-transaction-balances">
              <div><dt>Cash after</dt><dd>{euro(step.cashAfter)}</dd></div>
              <div><dt>Squad after</dt><dd>{step.squadCountAfter} / 24</dd></div>
              <div><dt>Squad value</dt><dd>{euro(step.squadValueAfter)}</dd></div>
              <div><dt>Debt limit</dt><dd>{euro(step.debtLimit)}</dd></div>
            </dl>
            {step.conditions.length > 0 && <div className="lineup-builder-trade-conditions"><span>Conditions</span>
              <ul>{step.conditions.map((condition, i) => <li key={i}>{condition}</li>)}</ul>
            </div>}
          </li>)}
        </ol> : <p className="fb-helper">No trades are needed for this lineup.</p>}
      </section>
    </div>
  </details>;
}
