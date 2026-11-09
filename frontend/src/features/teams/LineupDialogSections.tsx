import type { Ref } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { t, useTranslation } from "../../i18n";
import { formatEuro } from "../../api/format";
import { Button } from "../../components/ui/Button";
import { PlayerRadarChart } from "../players/radar/PlayerRadarChart";
import { radarMetric } from "../players/radar/radarLocalization";
import { usePlayerRadar } from "../players/radar/usePlayerRadar";
import {
  resolveMarketActionOffers,
  type MarketActionContext,
} from "../market/actions/marketActions";
import type { MarketActionsApi } from "../market/actions/useMarketActions";
import type { MarketRow } from "../market/model/row";
import { useRecentMatches, type MatchStatKey } from "./useRecentPoints";

const STAT_LABELS: Record<MatchStatKey, string> = {
  minutesPlayed: "Minutes played",
  goals: "Goals",
  assists: "Assists",
  bigChancesCreated: "Big chances",
  ballsIntoBox: "Balls into box",
  shots: "Shots",
  successfulDribbles: "Successful dribbles",
  recoveries: "Recoveries",
  clearances: "Clearances",
  saves: "Saves",
  penaltiesWon: "Penalties won",
  penaltiesSaved: "Penalties saved",
  penaltiesCommitted: "Penalties committed",
  penaltiesMissed: "Penalties missed",
  ownGoals: "Own goals",
  goalsConceded: "Goals conceded",
  yellowCards: "Yellow cards",
  redCard: "Red cards",
  ballsLost: "Balls lost",
};

/** Every market option the listing offers, as visible buttons with the reason when one is off. */
export function LineupMarketActions({
  row,
  context,
  actions,
}: {
  row: MarketRow;
  context: MarketActionContext;
  actions: MarketActionsApi;
}) {
  useTranslation();
  const offers = resolveMarketActionOffers(row, context).filter((offer) => offer.type !== "immediate-sell");
  if (offers.length === 0) return null;
  return (
    <section className="team-detail-market" aria-labelledby="team-detail-market-title">
      <h4 id="team-detail-market-title">{t("Market options")}</h4>
      <ul>
        {offers.map((offer) => {
          const key = offer.type === "bid" ? `bid-${offer.kind}` : offer.type;
          const run = () => {
            if (offer.type === "bid") actions.openBid(row, offer.kind);
            else if (offer.type === "cancel-bid") actions.cancelBid(row);
            else if (offer.type === "withdraw") actions.openWithdraw(row);
            else if (offer.type === "pay-clause") actions.openClause(row, offer.amount);
          };
          const primary = offer.type === "bid" || offer.type === "pay-clause";
          return (
            <li key={key}>
              <Button
                variant={primary ? "default" : "outline"}
                disabled={!offer.enabled || actions.actionPending}
                onClick={run}
              >
                {t(offer.label)}
                {offer.type === "pay-clause" ? ` · ${formatEuro(offer.amount)}` : ""}
              </Button>
              {!offer.enabled && offer.disabledReason
                ? <p className="team-xi-status">{t(offer.disabledReason)}</p>
                : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Percentile radar for one player; the table beside it carries the exact values. */
export function LineupRadar({ playerId, name }: { playerId: string; name: string }) {
  useTranslation();
  const radar = usePlayerRadar(playerId);
  const displayed = radar.displayed;
  const published = (displayed?.axes ?? []).some((axis) => axis.percentile != null);
  return (
    <section className="team-detail-radar" ref={radar.section as Ref<HTMLElement>}>
      <h4>{t("Radar percentiles")}</h4>
      {published && displayed ? (
        <>
          <PlayerRadarChart radar={displayed} compact />
          <table className="visually-hidden">
            <caption>{t("Percentiles for ")}{name}</caption>
            <tbody>
              {displayed.axes.filter((axis) => axis.percentile != null).map((axis) => (
                <tr key={axis.key}>
                  <th scope="row">{radarMetric(axis).label}</th>
                  <td>{Math.round(axis.percentile ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="team-xi-status">
          {radar.query?.isPending ? t("Loading radar.") : t("Radar is not published for this player.")}
        </p>
      )}
    </section>
  );
}

/** The last five LaLiga matches, newest first, behind one disclosure so the dialog stays short. */
export function LineupMatches({ playerId }: { playerId: string }) {
  useTranslation();
  const { matches, loading, failed } = useRecentMatches(playerId);
  const shown = [...matches].reverse();
  return (
    <Collapsible.Root className="team-detail-matches">
      <Collapsible.Trigger className="team-alt-trigger">
        <span className="team-alt-title">{t("Last 5 matches in detail")}</span>
        <span className="team-alt-chevron" aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {loading ? <p className="team-xi-status" role="status">{t("Loading match stats.")}</p> : null}
        {failed ? <p className="team-xi-status" role="alert">{t("Match stats are unavailable.")}</p> : null}
        {!loading && !failed && shown.length === 0
          ? <p className="team-xi-status">{t("No stats published for this match.")}</p>
          : null}
        <ol className="team-match-list">
          {shown.map((match, index) => (
            <li key={`${match.matchweek ?? "x"}-${index}`}>
              <header>
                <strong>{match.matchweek != null ? t("Matchweek {{0}}", { 0: match.matchweek }) : "—"}</strong>
                <span>
                  {[match.opponent, match.isHome == null ? null : t(match.isHome ? "Home" : "Away"), match.score]
                    .filter(Boolean).join(" · ")}
                </span>
                <span className="team-match-points">{match.points ?? "—"}</span>
              </header>
              {match.stats.length > 0 ? (
                <dl>
                  {match.stats.map((stat) => (
                    <div key={stat.key}>
                      <dt>{t(STAT_LABELS[stat.key])}</dt>
                      <dd>
                        {stat.count ?? "—"}
                        {stat.points != null && stat.points !== 0
                          ? <span data-sign={stat.points < 0 ? "negative" : "positive"}> {stat.points > 0 ? "+" : ""}{stat.points}</span>
                          : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="team-xi-status">{t("No stats published for this match.")}</p>}
            </li>
          ))}
        </ol>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
