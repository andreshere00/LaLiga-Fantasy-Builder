import type { BuilderCandidate, LineupBuildDto } from "../../api/schemas";
import { Button } from "../../components/ui/Button";
import { ProfilePhoto } from "../shell/ProfilePhoto";
import { PersonIcon } from "../shell/icons";
import { PitchMarkings } from "./PitchMarkings";

const money = (value: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

/** Read-only candidate comparisons and complete rule/transaction evidence. */
export function LineupBuilderResults({ result, playersById, canApply, onApply }: {
  result: LineupBuildDto;
  playersById: ReadonlyMap<string, { name: string; photoUrl: string | null }>;
  canApply: (candidate: BuilderCandidate) => boolean;
  onApply: (candidate: BuilderCandidate) => void;
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
  return <section aria-label="Lineup recommendations" className="lineup-builder-results">
    <h3>Round {result.target.week} · {new Date(result.target.firstKickoff).toLocaleString()}</h3>
    {!result.searchComplete && <p role="status">Search is incomplete. These candidates are feasible estimates; better choices may remain.</p>}
    <p>Trades are conditional estimates at current market value. Nothing has been bought, sold or saved.</p>
    {result.diagnostics.some((d) => d.code === "cash_conservative_bid_reserve") && <p role="status">Cash projections use a conservative lower bound: pending bid amounts are deducted from the reported balance, even if Fantasy may already reserve them. Pending bids remain unchanged.</p>}
    {result.diagnostics.length > 0 && <details><summary>{result.diagnostics.length} source exclusions</summary>
      <ul>{result.diagnostics.map((item, i) => <li key={`${item.playerId}-${item.code}-${i}`}>{item.playerId ? playerName(item.playerId) : "Source"}: {item.code.replaceAll("_", " ")}</li>)}</ul>
    </details>}
    {result.candidates.map((candidate, index) => <article key={candidate.candidateId} className="lineup-builder-candidate">
      <h4>{index + 1}. {candidate.formation.replaceAll(",", "-")} · {candidate.resourceGroup === "owned" ? "Owned starting XI" : "Acquisitions required"}</h4>
      <p>Lineup score {candidate.totalLineupScore.toFixed(3)} · Cash estimate {money(candidate.tradingPlan.projectedCash)} · Squad {candidate.tradingPlan.squadCount}/24 · Pending bid slots {candidate.tradingPlan.reservedSquadSlots} · Value {money(candidate.tradingPlan.squadValue)}</p>
      <div className="lineup-builder-preview" aria-label="Starting XI preview">
        <PitchMarkings stretch />
        {[4, 3, 2, 1].map((position) => <div key={position}>{candidate.starters.filter((p) => p.position === position).map((player) => <div className="lineup-builder-preview-player" key={player.playerId}>
          <ProfilePhoto key={playersById.get(player.playerId)?.photoUrl ?? "no-photo"}
            className="lineup-builder-player-photo" url={playersById.get(player.playerId)?.photoUrl ?? null}
            fallback={<PersonIcon />} />
          <span>{player.name}</span><small>{player.lineupScore.toFixed(3)} · {player.source}</small>
        </div>)}</div>)}
      </div>
      <details><summary>Scores, omissions and protection advice</summary>
        {candidate.starters.map((player) => <section key={player.playerId}>
          <h5>{player.name} · Trading {player.tradingScore.toFixed(3)} · Combined {player.combinedScore.toFixed(3)}</h5>
          {player.protectionAdvice && <p>Consider protecting this player before kickoff.</p>}
          {player.sections.map((section) => <div key={section.section}>
            <strong>{section.section}: {section.lineupNormalized.toFixed(3)} · weight {section.effectiveWeight.toFixed(3)}</strong>
            <ul>{section.criteria.map((rule) => <li key={rule.ruleId}>{rule.ruleId.replaceAll("_", " ")}: {rule.lineup ?? rule.trading} · {rule.observed} ({rule.source})</li>)}</ul>
          </div>)}
          <p>Omitted: {player.omissions.join(", ") || "None"}</p>
        </section>)}
      </details>
      <details><summary>Required trades and whole-squad projection</summary>
        <p>Sales deadline: {new Date(result.target.salesDeadline).toLocaleString()}. Clauses close: {new Date(result.target.clausesDeadline).toLocaleString()}.</p>
        <p>Retained: {candidate.tradingPlan.retainedPlayerIds.map(playerName).join(", ") || "None"}</p>
        <p>Trading-only purchases: {candidate.tradingPlan.tradingPurchases.map((p) => p.name).join(", ") || "None"}</p>
        <ol>{candidate.tradingPlan.steps.map((step, i) => <li key={i}>
          {step.action} {playerName(step.playerId)} · {money(step.estimate)} · {step.method} · {new Date(step.settlementAt).toLocaleString()} · Cash {money(step.cashAfter)} · Squad {step.squadCountAfter}/24
          <p>{step.conditions.join(". ")}</p>
        </li>)}</ol>
      </details>
      {result.explanations[candidate.candidateId] && <p>{result.explanations[candidate.candidateId]}</p>}
      <Button shape="square" disabled={!canApply(candidate)} onClick={() => onApply(candidate)}>Use as draft</Button>
      {!canApply(candidate) && <p className="fb-helper">Draft use requires all players in your refreshed squad and the matching editable round.</p>}
    </article>)}
    {result.explanationStatus === "unavailable" && <p>Optional explanation is unavailable; deterministic scores are unchanged.</p>}
  </section>;
}
