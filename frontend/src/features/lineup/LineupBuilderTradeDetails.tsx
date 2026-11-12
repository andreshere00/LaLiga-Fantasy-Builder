import { locale } from "../../i18n";
import { t, useTranslation } from "../../i18n";
import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import { Button } from "../../components/ui/Button";
import type { BuilderSaleAction } from "./LineupBuilderSaleActions";

const euro = (value: number) => new Intl.NumberFormat(locale(), {
  style: "currency", currency: "EUR", maximumFractionDigits: 0,
}).format(value);
const date = (value: string) => new Date(value).toLocaleString(locale(), {
  dateStyle: "medium", timeStyle: "short",
});
const METHODS: Record<string, string> = {
  bid: "Market bid", clause: "Release clause", accepted_offer: "Accepted sale offer",
  accept_offer: "Accept an existing offer", immediate_sale: "Immediate sale to LaLiga",
};
/** Machine-readable step conditions from the planner, as user-facing copy. */
const CONDITIONS: Record<string, string> = {
  offer_acceptance_required: "The offer must still be pending when you accept it.",
  below_market_value: "This offer is below the player's market value.",
  loses_half_market_value: "Immediate sales pay half the market value.",
  cannot_be_undone: "An immediate sale cannot be undone.",
  refresh_before_transaction: "Refresh cash, ownership and restrictions before any manual transaction.",
  winning_bid_required: "Your bid must win and the player must be assigned before kickoff.",
  clause_paid_from_cash: "The release clause must be paid entirely from cash.",
  non_profitable: "The maximum profitable bid is below the minimum return, so the default bid is suggested.",
  insufficient_history: "Market history is incomplete, so the default bid is suggested.",
  seller_acceptance_required: "The owner must accept the offer.",
  not_counted_in_cash: "Not counted in the projected cash.",
};
const BID_STATUS: Record<string, string> = {
  default: "Market value, plus 1 € when other managers have bid",
  profitable: "Maximum profitable bid",
  non_profitable: "Not profitable: default bid",
  insufficient_history: "Incomplete history: default bid",
};

/** Present the projected squad, deadlines and ordered conditional transactions. */
export function LineupBuilderTradeDetails({
  plan, target, playerName, playersById, confirmedSales, onSaleAction,
}: {
  plan: BuilderCandidate["tradingPlan"];
  target: LineupBuildDto["target"];
  playerName: (id: string) => string;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
  /** ``kind:playerId`` keys of sales the manager already confirmed. */
  confirmedSales?: ReadonlySet<string>;
  onSaleAction?: (action: BuilderSaleAction) => void;
}) {
  useTranslation();
  const photo = (id: string) => <ProfilePhoto className="lineup-builder-option-photo"
    url={playersById.get(id)?.photoUrl ?? null} fallback={<PersonIcon />} />;
  return <details className="lineup-builder-trades">
    <summary><span>{t("Required trades and whole-squad projection")}</span>
      <span className="lineup-builder-trade-count">{t(plan.steps.length === 1 ? "{{0}} trade" : "{{0}} trades", { 0: plan.steps.length })}</span>
    </summary>
    <div className="lineup-builder-trades-body">
      <dl className="lineup-builder-projection">
        <div><dt>{t("Projected cash")}</dt><dd>{euro(plan.projectedCash)}</dd></div>
        <div><dt>{t("Squad after trades")}</dt><dd>{plan.squadCount}<small> {t(" / 24 players")}</small></dd></div>
        <div><dt>{t("Squad value")}</dt><dd>{euro(plan.squadValue)}</dd></div>
        <div><dt>{t("Pending bid slots")}</dt><dd>{plan.reservedSquadSlots}</dd></div>
      </dl>
      <dl className="lineup-builder-deadlines">
        <div><dt>{t("Sales must settle by")}</dt><dd><time dateTime={target.salesDeadline}>{date(target.salesDeadline)}</time></dd></div>
        <div><dt>{t("Release clauses close")}</dt><dd><time dateTime={target.clausesDeadline}>{date(target.clausesDeadline)}</time></dd></div>
      </dl>
      <section className="lineup-builder-trade-section" aria-label={t("Squad retained")}>
        <h5>{t("Players retained ")}<span>{plan.retainedPlayerIds.length}</span></h5>
        {plan.retainedPlayerIds.length ? <ul className="lineup-builder-retained" aria-label={t("Players retained")}>
          {plan.retainedPlayerIds.map((id) => <li key={id}>{photo(id)}<span>{playerName(id)}</span></li>)}
        </ul> : <p className="fb-helper">{t("No players retained.")}</p>}
      </section>
      <section className="lineup-builder-trade-section" aria-label={t("Trading purchases")}>
        <h5>{t("Trading-only purchases ")}<span>{plan.tradingPurchases.length}</span></h5>
        {plan.tradingPurchases.length ? <ul className="lineup-builder-retained" aria-label={t("Trading-only purchases")}>
          {plan.tradingPurchases.map((player) => <li key={player.playerId}>{photo(player.playerId)}
            <span>{player.name}<small>{euro(player.marketValue)}</small></span></li>)}
        </ul> : <p className="fb-helper">{t("No additional purchases for trading.")}</p>}
      </section>
      {plan.listingSuggestions.length > 0 && <section className="lineup-builder-trade-section" aria-label={t("Listing suggestions")}>
        <h5>{t("Players to list ")}<span>{plan.listingSuggestions.length}</span></h5>
        <p className="fb-helper">{t("Listings are not counted in the projected cash until someone makes an offer you accept. Shortfall: {{0}}.", { 0: euro(plan.shortfall) })}</p>
        <ul className="lineup-builder-retained" aria-label={t("Listing suggestions")}>
          {plan.listingSuggestions.map((listing) => <li key={listing.playerId}>{photo(listing.playerId)}
            <span>{playerName(listing.playerId)}<small>{euro(listing.suggestedPrice)}{listing.reason === "listed_without_offer" ? t(" · already listed, no offer yet") : ""}</small></span>
            {onSaleAction && (confirmedSales?.has(`listing:${listing.playerId}`)
              ? <small role="status">{t("Listed")}</small>
              : <Button size="sm" shape="square" variant="secondary" onClick={() => onSaleAction({
                kind: "listing", playerId: listing.playerId, playerTeamId: listing.playerTeamId,
                name: playerName(listing.playerId), amount: listing.suggestedPrice, marketValue: listing.suggestedPrice,
              })}>{t("List for sale")}</Button>)}
          </li>)}
        </ul>
      </section>}
      <section className="lineup-builder-trade-section" aria-label={t("Planned transactions")}>
        <h5>{t("Transaction plan")}</h5>
        {plan.steps.length ? <ol className="lineup-builder-transactions">
          {plan.steps.map((step, index) => <li key={`${step.action}-${step.playerId}-${index}`}>
            <div className="lineup-builder-transaction-heading">
              <span className="lineup-builder-transaction-number" aria-hidden="true">{index + 1}</span>
              {photo(step.playerId)}
              <div><h6>{step.action === "buy" ? t("Buy") : t("Sell")} {playerName(step.playerId)}</h6>
                <span className="fb-helper">{t(METHODS[step.method] ?? step.method.replaceAll("_", " "))}</span></div>
              <div className="lineup-builder-transaction-estimate"><small>{step.action === "buy" ? t("Estimated cost") : t("Estimated proceeds")}</small><strong>{euro(step.estimate)}</strong></div>
            </div>
            <p className="lineup-builder-settlement">{t("Expected settlement ")}<time dateTime={step.settlementAt}>{date(step.settlementAt)}</time></p>
            <dl className="lineup-builder-transaction-balances">
              <div><dt>{t("Cash after")}</dt><dd>{euro(step.cashAfter)}</dd></div>
              <div><dt>{t("Squad after")}</dt><dd>{step.squadCountAfter} / 24</dd></div>
              <div><dt>{t("Squad value")}</dt><dd>{euro(step.squadValueAfter)}</dd></div>
              <div><dt>{t("Debt limit")}</dt><dd>{euro(step.debtLimit)}</dd></div>
            </dl>
            {step.bidSuggestion && <p className="fb-helper">
              {t("Suggested bid {{0}} · {{1}}", { 0: euro(step.bidSuggestion.amount), 1: t(BID_STATUS[step.bidSuggestion.status] ?? step.bidSuggestion.status) })}
              {step.bidSuggestion.returnRate != null && t(" · expected return {{0}}%", { 0: (step.bidSuggestion.returnRate * 100).toFixed(1) })}
              {step.bidSuggestion.competingBids > 0 && t(" · {{0}} competing bids", { 0: step.bidSuggestion.competingBids })}
            </p>}
            {step.alternatives.map((alternative) => <p key={alternative.method} className="fb-helper">
              {t("Alternative: direct offer of {{0}} to the owner (not counted in cash).", { 0: euro(alternative.suggestedAmount) })}
            </p>)}
            {step.conditions.length > 0 && <div className="lineup-builder-trade-conditions"><span>{t("Conditions")}</span>
              <ul>{step.conditions.map((condition, i) => <li key={i}>{t(CONDITIONS[condition] ?? condition)}</li>)}</ul>
            </div>}
            {onSaleAction && step.action === "sell" && step.playerTeamId
              && (step.method === "accept_offer" || step.method === "immediate_sale") && (
              confirmedSales?.has(`${step.method}:${step.playerId}`)
                ? <p role="status" className="fb-helper">{t("Sale confirmed. Your squad and cash were refreshed.")}</p>
                : <Button size="sm" shape="square" variant={step.method === "immediate_sale" ? "destructive" : "secondary"}
                  onClick={() => onSaleAction(step.method === "accept_offer"
                    ? { kind: "accept_offer", playerId: step.playerId, playerTeamId: step.playerTeamId!, name: playerName(step.playerId),
                      amount: step.estimate, marketValue: step.marketValue ?? step.estimate, offerId: step.offerId, marketId: step.offerMarketId }
                    : { kind: "immediate_sale", playerId: step.playerId, playerTeamId: step.playerTeamId!, name: playerName(step.playerId),
                      amount: step.estimate, marketValue: step.marketValue ?? step.estimate * 2 })}>
                  {step.method === "accept_offer" ? t("Accept offer ({{0}})", { 0: euro(step.estimate) }) : t("Sell now ({{0}})", { 0: euro(step.estimate) })}
                </Button>)}
          </li>)}
        </ol> : <p className="fb-helper">{t("No trades are needed for this lineup.")}</p>}
      </section>
    </div>
  </details>;
}
