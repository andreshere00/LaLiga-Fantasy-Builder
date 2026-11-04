import { decimal } from "../../i18n/format";
import { locale } from "../../i18n";
import { copy as localizeCopy, useLanguage } from "../../i18n";
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

const money = (value: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
export const LINEUP_RECOMMENDATION_LIMIT = 7;

/** Read-only candidate comparisons and complete rule/transaction evidence. */
const ACQUISITION_SOURCES: Record<string, string> = {
  owned: "Your squad", market: "Market", opponent: "Opponent squad",
};

export function LineupBuilderResults({ result, playersById, canApply, onApply, ownedPlayerIds, onAcquire }: {
  result: LineupBuildDto;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
  canApply: (candidate: BuilderCandidate) => boolean;
  onApply: (candidate: BuilderCandidate) => void;
  ownedPlayerIds?: ReadonlySet<string>;
  onAcquire?: (player: BuilderCandidate["starters"][number]) => void;
}) {
  useLanguage();
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
  const playerName = (id: string) => names.get(id) ?? "Unknown player";
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
  return <section aria-label={localizeCopy("Lineup recommendations")} className="lineup-builder-results">
    <h3>{localizeCopy("Round ")}{result.target.week} · {localizeCopy(new Date(result.target.firstKickoff).toLocaleString(locale(), { timeZone: "Europe/Madrid" }))}</h3>
    <aside className="lineup-builder-notices" aria-label={localizeCopy("Recommendation notes")} role="status">
      <header className="lineup-builder-notices-header">
        <div className="lineup-builder-notices-heading">
          <h4>{localizeCopy("Recommendation notes")}</h4>
          <span className="lineup-builder-preview-badge">{localizeCopy("Preview only")}</span>
        </div>
        <p>{localizeCopy("Trades are conditional estimates at current market value. Nothing has been bought, sold or saved.")}</p>
      </header>
      {notices.length > 0 && <ul className="lineup-builder-notices-list">
        {notices.map((notice) => <li key={notice.title} data-tone={notice.tone}>
          <strong>{localizeCopy(notice.title)}</strong>
          <p>{localizeCopy(notice.detail)}</p>
        </li>)}
      </ul>}
    </aside>
    {exclusions.length > 0 && <details className="lineup-builder-exclusions">
      <summary><span>{exclusions.length} {localizeCopy(" source exclusions")}</span><span className="lineup-builder-exclusions-hint">{localizeCopy("View reasons")}</span></summary>
      <div className="lineup-builder-exclusions-scroll">
        <table aria-label={localizeCopy("Source exclusions")} className="lineup-builder-exclusions-table">
          <thead><tr><th scope="col">{localizeCopy("Player")}</th><th scope="col">{localizeCopy("Reason for exclusion")}</th></tr></thead>
          <tbody>{exclusions.map((item, i) => <tr key={`${item.playerId}-${item.code}-${i}`}>
            <th scope="row"><div className="lineup-builder-excluded-player">
              {item.playerId && <ProfilePhoto className="lineup-builder-option-photo"
                url={playersById.get(item.playerId)?.photoUrl ?? null} fallback={<PersonIcon />} />}
              <span>{item.playerId ? playerName(item.playerId) : "Source check"}</span>
            </div></th>
            <td>{localizeCopy(builderDiagnosticMessage(item.code))}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    <fieldset className="lineup-builder-result-filters">
      <legend>{localizeCopy("Lineup filter")}</legend>
      <div>
        {([
          ["owned", "Only current squad"], ["external", "Squad with external players"],
        ] as const).map(([value, label]) => <Button key={value} variant="outline" size="lg" shape="square"
          className="lineup-builder-result-filter" aria-pressed={group === value} onClick={() => setGroup(value)}>
          <span>{localizeCopy(label)}</span>
          <span className="lineup-builder-filter-count" aria-hidden="true">
            {recommendations.filter((candidate) => candidate.resourceGroup === value).length}
          </span>
        </Button>)}
      </div>
    </fieldset>
    <p role="status">{localizeCopy("Showing ")}{candidates.length} {localizeCopy(" of ")}{recommendations.length} {localizeCopy(" lineups.")}</p>
    {result.candidates.some((candidate) => candidate.resourceGroup === "owned") && <p className="fb-helper">
      {localizeCopy("External lineups must score higher than the best lineup using only your current squad.")}</p>}
    {candidates.length === 0 && <p role="status">{localizeCopy(group === "owned"
      ? "No lineup using only your current squad was found for these settings."
      : "No improving external lineups were found for these settings.")}</p>}
    {candidates.map(({ candidate, rank }) => <article key={candidate.candidateId} className="lineup-builder-candidate">
      <h4>{rank}. {localizeCopy(candidate.formation.replaceAll(",", "-"))} · {localizeCopy(candidate.resourceGroup === "owned" ? "Owned starting XI" : "Acquisitions required")}</h4>
      <p>{localizeCopy("Lineup score ")}{localizeCopy(decimal(candidate.totalLineupScore, 3))} {localizeCopy(" · Cash estimate ")}{localizeCopy(money(candidate.tradingPlan.projectedCash))} {localizeCopy(" · Squad ")}{candidate.tradingPlan.squadCount}{localizeCopy("/24 · Pending bid slots ")}{candidate.tradingPlan.reservedSquadSlots} {localizeCopy(" · Value ")}{localizeCopy(money(candidate.tradingPlan.squadValue))}</p>
      <div className="lineup-builder-preview" aria-label={localizeCopy("Starting XI preview")}>
        <PitchMarkings stretch />
        {[4, 3, 2, 1].map((position) => <div key={position}>{candidate.starters.filter((p) => p.position === position).map((player) => <Help key={player.playerId}
          className={"lineup-builder-preview-player" + (needsAcquisition(player) ? " is-not-owned" : "")}
          content={localizeCopy(needsAcquisition(player) ? "This player is not in your squad. Acquire them before using this lineup as a draft." : null)}>
          <ProfilePhoto key={playersById.get(player.playerId)?.photoUrl ?? "no-photo"}
            className="lineup-builder-player-photo" url={playersById.get(player.playerId)?.photoUrl ?? null}
            fallback={<PersonIcon />} />
          <span>{player.name}</span><small>
            <b className="lineup-builder-score" data-tone={builderScoreTone(player.lineupScore, "lineup")}>{localizeCopy(decimal(player.lineupScore, 3))}</b> · {localizeCopy(ACQUISITION_SOURCES[player.source] ?? player.source)}
          </small>
          {needsAcquisition(player) && <span className="lineup-builder-ownership-label">{localizeCopy("Not owned")}</span>}
          {needsAcquisition(player) && onAcquire && <Button size="sm" shape="square" variant="secondary"
            aria-label={localizeCopy(`Acquire ${player.name}`)} onClick={() => onAcquire(player)}>{localizeCopy("Acquire")}</Button>}
        </Help>)}</div>)}
      </div>
      <details><summary>{localizeCopy("Player scores and selection reasons")}</summary>
        <p className="fb-helper">{localizeCopy("These are suitability scores, not predicted Fantasy points. Higher scores rank better. Combined adds lineup and trading scores. Rule points are normalized within each category; lineup contributions also apply the category weight.")}</p>
        {candidate.starters.map((player) => <LineupBuilderScoreDetails key={player.playerId} player={player} />)}
      </details>
      <LineupBuilderTradeDetails plan={candidate.tradingPlan} target={result.target}
        playerName={playerName} playersById={playersById} />
      {result.explanations[candidate.candidateId] && <details><summary>{localizeCopy("Original generated explanation")}</summary><p lang="en">{result.explanations[candidate.candidateId]}</p></details>}
      <Button shape="square" disabled={!canApply(candidate)} onClick={() => onApply(candidate)}>{localizeCopy("Use as draft")}</Button>
      {!canApply(candidate) && <p className="fb-helper">{localizeCopy(candidate.resourceGroup === "external"
        ? "Proposal only: acquire these players first. Draft use requires every starter in your refreshed squad and the matching editable round."
        : "Draft use requires all players in your refreshed squad and the matching editable round.")}</p>}
    </article>)}
    {result.explanationStatus === "unavailable" && <p>{localizeCopy("Optional explanation is unavailable; deterministic scores are unchanged.")}</p>}
  </section>;
}
