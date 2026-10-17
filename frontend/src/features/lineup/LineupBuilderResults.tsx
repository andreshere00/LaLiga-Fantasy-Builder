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

const money = (value: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

/** Read-only candidate comparisons and complete rule/transaction evidence. */
export function LineupBuilderResults({ result, playersById, canApply, onApply, ownedPlayerIds, onAcquire }: {
  result: LineupBuildDto;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
  canApply: (candidate: BuilderCandidate) => boolean;
  onApply: (candidate: BuilderCandidate) => void;
  ownedPlayerIds?: ReadonlySet<string>;
  onAcquire?: (player: BuilderCandidate["starters"][number]) => void;
}) {
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
  return <section aria-label="Lineup recommendations" className="lineup-builder-results">
    <h3>Round {result.target.week} · {new Date(result.target.firstKickoff).toLocaleString()}</h3>
    {result.diagnostics.some((d) => d.code === "recent_matches_previous_round") && <p role="status">The current round has started. Recent match analysis uses completed matches from previous rounds.</p>}
    {result.diagnostics.some((d) => d.code === "standings_unavailable") && <p role="status">Club standings could not be verified. Position criteria are omitted; recent matches use verified previous-round results.</p>}
    {!result.searchComplete && <p role="status">Search is incomplete. These candidates are feasible estimates; better choices may remain.</p>}
    <p>Trades are conditional estimates at current market value. Nothing has been bought, sold or saved.</p>
    {result.diagnostics.some((d) => d.code === "cash_conservative_bid_reserve") && <p role="status">Cash projections use a conservative lower bound: pending bid amounts are deducted from the reported balance, even if Fantasy may already reserve them. Pending bids remain unchanged.</p>}
    {exclusions.length > 0 && <details className="lineup-builder-exclusions">
      <summary><span>{exclusions.length} source exclusions</span><span className="lineup-builder-exclusions-hint">View reasons</span></summary>
      <div className="lineup-builder-exclusions-scroll">
        <table aria-label="Source exclusions" className="lineup-builder-exclusions-table">
          <thead><tr><th scope="col">Player</th><th scope="col">Reason for exclusion</th></tr></thead>
          <tbody>{exclusions.map((item, i) => <tr key={`${item.playerId}-${item.code}-${i}`}>
            <th scope="row"><div className="lineup-builder-excluded-player">
              {item.playerId && <ProfilePhoto className="lineup-builder-option-photo"
                url={playersById.get(item.playerId)?.photoUrl ?? null} fallback={<PersonIcon />} />}
              <span>{item.playerId ? playerName(item.playerId) : "Source check"}</span>
            </div></th>
            <td>{builderDiagnosticMessage(item.code)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {result.candidates.map((candidate, index) => <article key={candidate.candidateId} className="lineup-builder-candidate">
      <h4>{index + 1}. {candidate.formation.replaceAll(",", "-")} · {candidate.resourceGroup === "owned" ? "Owned starting XI" : "Acquisitions required"}</h4>
      <p>Lineup score {candidate.totalLineupScore.toFixed(3)} · Cash estimate {money(candidate.tradingPlan.projectedCash)} · Squad {candidate.tradingPlan.squadCount}/24 · Pending bid slots {candidate.tradingPlan.reservedSquadSlots} · Value {money(candidate.tradingPlan.squadValue)}</p>
      <div className="lineup-builder-preview" aria-label="Starting XI preview">
        <PitchMarkings stretch />
        {[4, 3, 2, 1].map((position) => <div key={position}>{candidate.starters.filter((p) => p.position === position).map((player) => <Help key={player.playerId}
          className={"lineup-builder-preview-player" + (needsAcquisition(player) ? " is-not-owned" : "")}
          content={needsAcquisition(player) ? "This player is not in your squad. Acquire them before using this lineup as a draft." : null}>
          <ProfilePhoto key={playersById.get(player.playerId)?.photoUrl ?? "no-photo"}
            className="lineup-builder-player-photo" url={playersById.get(player.playerId)?.photoUrl ?? null}
            fallback={<PersonIcon />} />
          <span>{player.name}</span><small>
            <b className="lineup-builder-score" data-tone={builderScoreTone(player.lineupScore, "lineup")}>{player.lineupScore.toFixed(3)}</b> · {player.source}
          </small>
          {needsAcquisition(player) && <span className="lineup-builder-ownership-label">Not owned</span>}
          {needsAcquisition(player) && onAcquire && <Button size="sm" shape="square" variant="secondary"
            aria-label={`Acquire ${player.name}`} onClick={() => onAcquire(player)}>Acquire</Button>}
        </Help>)}</div>)}
      </div>
      <details><summary>Player scores and selection reasons</summary>
        <p className="fb-helper">These are suitability scores, not predicted Fantasy points. Higher scores rank better. Combined adds lineup and trading scores. Rule points are normalized within each category; lineup contributions also apply the category weight.</p>
        {candidate.starters.map((player) => <LineupBuilderScoreDetails key={player.playerId} player={player} />)}
      </details>
      <LineupBuilderTradeDetails plan={candidate.tradingPlan} target={result.target}
        playerName={playerName} playersById={playersById} />
      {result.explanations[candidate.candidateId] && <p>{result.explanations[candidate.candidateId]}</p>}
      <Button shape="square" disabled={!canApply(candidate)} onClick={() => onApply(candidate)}>Use as draft</Button>
      {!canApply(candidate) && <p className="fb-helper">{candidate.resourceGroup === "external"
        ? "Proposal only: acquire these players first. Draft use requires every starter in your refreshed squad and the matching editable round."
        : "Draft use requires all players in your refreshed squad and the matching editable round."}</p>}
    </article>)}
    {result.explanationStatus === "unavailable" && <p>Optional explanation is unavailable; deterministic scores are unchanged.</p>}
  </section>;
}
