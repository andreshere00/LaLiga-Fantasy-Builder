import { decimal } from "../../i18n/format";
import { locale } from "../../i18n";
import { t, useTranslation } from "../../i18n";
import { useState } from "react";
import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { Button } from "../../components/ui/Button";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import { PitchMarkings } from "./PitchMarkings";
import { LineupBuilderScoreDetails } from "./LineupBuilderScoreDetails";
import { builderScoreTone } from "./builderScoreTone";
import { builderDiagnosticMessage } from "./builderDiagnosticCopy";
import { Help } from "../../components/ui/Help";
import { LineupBuilderTradeDetails } from "./LineupBuilderTradeDetails";
import type { BuilderSaleAction } from "./LineupBuilderSaleActions";

const money = (value: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
export const LINEUP_RECOMMENDATION_LIMIT = 7;

/** Read-only candidate comparisons and complete rule/transaction evidence. */
const ACQUISITION_SOURCES: Record<string, string> = {
  owned: "Your squad", market: "Market", opponent: "Opponent squad",
};

const FUNDING: Record<BuilderCandidate["tradingPlan"]["fundingStatus"], { title: string; detail: string } | null> = {
  funded: null,
  debt_within_limit: {
    title: "Ends in debt",
    detail: "The balance at kickoff stays below zero, within the 20% debt limit. Fantasy may not score a team that starts the round in debt.",
  },
  needs_sales: {
    title: "Needs more sales",
    detail: "Confirmed offers cannot bring the balance to zero. List the suggested players and accept offers before kickoff.",
  },
};

export function LineupBuilderResults({
  result, playersById, canApply, onApply, ownedPlayerIds, onAcquire,
  requireNonnegativeCash = false, availableCash = null, confirmedSales, onSaleAction,
}: {
  result: LineupBuildDto;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
  canApply: (candidate: BuilderCandidate) => boolean;
  onApply: (candidate: BuilderCandidate) => void;
  ownedPlayerIds?: ReadonlySet<string>;
  onAcquire?: (player: BuilderCandidate["starters"][number]) => void;
  /** The build required a balance of 0 or more at kickoff. */
  requireNonnegativeCash?: boolean;
  /** Refreshed cash minus pending bids, or null while unknown. */
  availableCash?: number | null;
  confirmedSales?: ReadonlySet<string>;
  onSaleAction?: (action: BuilderSaleAction) => void;
}) {
  useTranslation();
  const recommendations = result.candidates.slice(0, LINEUP_RECOMMENDATION_LIMIT);
  const [group, setGroup] = useState<BuilderCandidate["resourceGroup"]>(
    recommendations.some((candidate) => candidate.resourceGroup === "owned") ? "owned" : "external",
  );
  const candidates = recommendations.map((candidate, index) => ({ candidate, rank: index + 1 }))
    .filter(({ candidate }) => candidate.resourceGroup === group);
  const names = new Map([...playersById].map(([id, player]) => [id, player.name]));
  for (const candidate of result.candidates) {
    for (const player of [
      ...candidate.starters, ...candidate.tradingPlan.acquisitions,
      ...candidate.tradingPlan.tradingPurchases, ...candidate.tradingPlan.sales,
    ]) {
      names.set(player.playerId, player.name);
    }
  }
  const playerName = (id: string) => names.get(id) ?? t("Unknown player");
  const exclusions = result.diagnostics.filter((item) => item.playerId != null &&
    (item.code === "player_unavailable" || item.code === "opponent_protection_active_at_kickoff"));
  const needsAcquisition = (player: BuilderCandidate["starters"][number]) =>
    player.source !== "owned" && !ownedPlayerIds?.has(player.playerId);
  const diagnostics = new Set(result.diagnostics.map((item) => item.code));
  const notices = [
    { visible: diagnostics.has("recent_matches_previous_round"), title: "Previous-round form", tone: "info",
      detail: "The current round has started. Recent match analysis uses completed matches from previous rounds." },
    { visible: diagnostics.has("standings_unavailable"), title: "Standings unavailable", tone: "warning",
      detail: "Club standings could not be verified. Position criteria are omitted; recent matches use verified previous-round results." },
    { visible: !result.searchComplete, title: "Search incomplete", tone: "warning",
      detail: "Search is incomplete. These candidates are feasible estimates; better choices may remain." },
    { visible: diagnostics.has("cash_conservative_bid_reserve"), title: "Cash after pending bids", tone: "info",
      detail: "Cash projections use a conservative lower bound: pending bid amounts are deducted from the reported balance, even if Fantasy may already reserve them. Pending bids remain unchanged." },
  ].filter((notice) => notice.visible);
  return <section aria-label={t("Lineup recommendations")} className="lineup-builder-results">
    <h3>{t("Round ")}{result.target.week} · {new Date(result.target.firstKickoff).toLocaleString(locale(), { timeZone: "Europe/Madrid" })}</h3>
    <aside className="lineup-builder-notices" aria-label={t("Recommendation notes")} role="status">
      <header className="lineup-builder-notices-header">
        <div className="lineup-builder-notices-heading">
          <h4>{t("Recommendation notes")}</h4>
          <span className="lineup-builder-preview-badge">{t("Preview only")}</span>
        </div>
        <p>{t("Trades are conditional estimates at current market value. Nothing has been bought, sold or saved.")}</p>
      </header>
      {notices.length > 0 && <ul className="lineup-builder-notices-list">
        {notices.map((notice) => <li key={notice.title} data-tone={notice.tone}>
          <strong>{t(notice.title)}</strong>
          <p>{t(notice.detail)}</p>
        </li>)}
      </ul>}
    </aside>
    {exclusions.length > 0 && <details className="lineup-builder-exclusions">
      <summary><span>{t(exclusions.length === 1 ? "{{0}} source exclusion" : "{{0}} source exclusions", { 0: exclusions.length })}</span><span className="lineup-builder-exclusions-hint">{t("View reasons")}</span></summary>
      <div className="lineup-builder-exclusions-scroll">
        <table aria-label={t("Source exclusions")} className="lineup-builder-exclusions-table">
          <thead><tr><th scope="col">{t("Player")}</th><th scope="col">{t("Reason for exclusion")}</th></tr></thead>
          <tbody>{exclusions.map((item, i) => <tr key={`${item.playerId}-${item.code}-${i}`}>
            <th scope="row"><div className="lineup-builder-excluded-player">
              {item.playerId && <ProfilePhoto className="lineup-builder-option-photo"
                url={playersById.get(item.playerId)?.photoUrl ?? null} fallback={<PersonIcon />} />}
              <span>{item.playerId ? playerName(item.playerId) : t("Source check")}</span>
            </div></th>
            <td>{t(builderDiagnosticMessage(item.code))}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    <fieldset className="lineup-builder-result-filters">
      <legend>{t("Lineup filter")}</legend>
      <div>
        {([
          ["owned", "Only current squad"], ["external", "Squad with external players"],
        ] as const).map(([value, label]) => <Button key={value} variant="outline" size="lg" shape="square"
          className="lineup-builder-result-filter" aria-pressed={group === value} onClick={() => setGroup(value)}>
          <span>{t(label)}</span>
          <span className="lineup-builder-filter-count" aria-hidden="true">
            {recommendations.filter((candidate) => candidate.resourceGroup === value).length}
          </span>
        </Button>)}
      </div>
    </fieldset>
    <p role="status">{t("Showing {{0}} of {{1}} lineups.", { 0: candidates.length, 1: recommendations.length })}</p>
    {result.candidates.some((candidate) => candidate.resourceGroup === "owned") && <p className="fb-helper">
      {t("External lineups must score higher than the best lineup using only your current squad.")}</p>}
    {candidates.length === 0 && <p role="status">{group === "owned" ? t("No lineup using only your current squad was found for these settings.") : t("No improving external lineups were found for these settings.")}</p>}
    {candidates.map(({ candidate, rank }) => <article key={candidate.candidateId} className="lineup-builder-candidate">
      <h4>{rank}. {candidate.formation.replaceAll(",", "-")} · {candidate.resourceGroup === "owned" ? t("Owned starting XI") : t("Acquisitions required")}</h4>
      {FUNDING[candidate.tradingPlan.fundingStatus] && <p className="lineup-builder-funding" data-tone="warning" role="note">
        <strong>{t(FUNDING[candidate.tradingPlan.fundingStatus]!.title)}</strong>{" "}
        {t(FUNDING[candidate.tradingPlan.fundingStatus]!.detail)}
        {candidate.tradingPlan.shortfall > 0 && <> {t("Shortfall: {{0}}.", { 0: money(candidate.tradingPlan.shortfall) })}</>}
      </p>}
      <p>{t("Lineup score ")}{decimal(candidate.totalLineupScore, 3)} {t(" · Cash estimate ")}{money(candidate.tradingPlan.projectedCash)} {t(" · Squad ")}{candidate.tradingPlan.squadCount}{t("/24 · Pending bid slots ")}{candidate.tradingPlan.reservedSquadSlots} {t(" · Value ")}{money(candidate.tradingPlan.squadValue)}</p>
      <div className="lineup-builder-preview" aria-label={t("Starting XI preview")}>
        <PitchMarkings stretch />
        {[4, 3, 2, 1].map((position) => <div key={position}>{candidate.starters.filter((p) => p.position === position).map((player) => <Help key={player.playerId}
          className={"lineup-builder-preview-player" + (needsAcquisition(player) ? " is-not-owned" : "")}
          content={needsAcquisition(player) ? t("This player is not in your squad. Acquire them before using this lineup as a draft.") : null}>
          <ProfilePhoto key={playersById.get(player.playerId)?.photoUrl ?? "no-photo"}
            className="lineup-builder-player-photo" url={playersById.get(player.playerId)?.photoUrl ?? null}
            fallback={<PersonIcon />} />
          <span>{player.name}</span><small>
            <b className="lineup-builder-score" data-tone={builderScoreTone(player.lineupScore, "lineup")}>{decimal(player.lineupScore, 3)}</b> · {t(ACQUISITION_SOURCES[player.source] ?? player.source)}
          </small>
          {needsAcquisition(player) && <span className="lineup-builder-ownership-label">{t("Not owned")}</span>}
          {needsAcquisition(player) && onAcquire && <Button size="sm" shape="square" variant="secondary"
            aria-label={t("Acquire {{0}}", { 0: player.name })} onClick={() => onAcquire(player)}>{t("Acquire")}</Button>}
        </Help>)}</div>)}
      </div>
      <details><summary>{t("Player scores and selection reasons")}</summary>
        <p className="fb-helper">{t("These are suitability scores, not predicted Fantasy points. Higher scores rank better. Combined adds lineup and trading scores. Rule points are normalized within each category; lineup contributions also apply the category weight.")}</p>
        {candidate.starters.map((player) => <LineupBuilderScoreDetails key={player.playerId} player={player} />)}
      </details>
      <LineupBuilderTradeDetails plan={candidate.tradingPlan} target={result.target}
        playerName={playerName} playersById={playersById}
        confirmedSales={confirmedSales} onSaleAction={onSaleAction} />
      {result.explanations[candidate.candidateId] && <details><summary>{t("Original generated explanation")}</summary><p lang="en">{result.explanations[candidate.candidateId]}</p></details>}
      <Button shape="square" disabled={!canApply(candidate)} onClick={() => onApply(candidate)}>{t("Use as draft")}</Button>
      {!canApply(candidate) && candidate.resourceGroup === "owned" && requireNonnegativeCash
        && availableCash != null && availableCash < 0 && <p className="fb-helper" role="status">
        {t("Your balance after pending bids is {{0}}. Confirm the suggested sales to reach 0 before using this draft.", { 0: money(availableCash) })}</p>}
      {!canApply(candidate) && <p className="fb-helper">{candidate.resourceGroup === "external" ? t("Proposal only: acquire these players first. Draft use requires every starter in your refreshed squad and the matching editable round.") : t("Draft use requires all players in your refreshed squad and the matching editable round.")}</p>}
    </article>)}
    {result.explanationStatus === "unavailable" && <p>{t("Optional explanation is unavailable; deterministic scores are unchanged.")}</p>}
  </section>;
}
