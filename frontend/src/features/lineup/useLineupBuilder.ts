import { useEffect, useRef, useState } from "react";
import { streamLineupBuild } from "../../api/lineupBuild";
import { ApiError } from "../../api/errors";
import { builderDiagnosticMessage } from "./builderDiagnosticCopy";
import type { LineupBuildDto, LineupBuildProgress, LineupBuildRequest } from "../../api/schemas";

const MESSAGES: Record<string, string> = {
  financial_data_unavailable: "Cash or pending commitments could not be verified.",
  standings_unavailable: "The club standings and recent match history could not be verified. Retry when the standings source is available.",
  recent_matches_unavailable: "Previous-round match results could not be verified. Retry when the calendar source is available.",
  mandatory_player_conflict: "A mandatory player cannot qualify with these sources and restrictions.",
  no_feasible_lineup: "No lineup satisfies the selected formation, player and financial constraints.",
  target_deadline_conflict: "The round opening and fixture deadlines disagree. A safe target could not be verified.",
  no_target_week: "No supported future round is available.",
  search_incomplete: "Search stopped before finding a feasible candidate. Try fewer sources or formations.",
  builder_busy: "The builder is busy. Retry shortly.",
};

const SOURCE_MESSAGES: Record<string, string> = {
  standings_unavailable: "The club standings source is unavailable or inconsistent.",
  owned_roster_missing: "Fantasy did not return your complete squad.",
  loaned_roster_unverified: "Financial projections for loaned players are not yet supported.",
  roster_valuation_unavailable: "A squad player's identity or market value is unavailable.",
  team_cash_missing: "Fantasy did not return your team's cash balance.",
  pending_bid_snapshot_missing: "Fantasy did not return a complete pending-bid list.",
  cash_conservative_bid_reserve: "Pending bids were deducted conservatively; Fantasy may already reserve them, so this cash bound can be lower than your displayed balance.",
  pending_bid_details_missing: "A bid is missing its identifier or amount; its reservation cannot be calculated.",
  pending_bid_details_conflict: "The market returned conflicting amounts for the same bid.",
  pending_bids_present: "Active bids were found; their effect on cash has not been verified.",
};

/** One mounted league/session scope; cancellation discards every late response. */
export function useLineupBuilder(
  leagueId: string, token: string, playersById?: ReadonlyMap<string, { name: string }>,
) {
  const current = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<LineupBuildProgress | null>(null);
  const [result, setResult] = useState<LineupBuildDto | null>(null);
  const [failure, setFailure] = useState<ApiError | "unknown" | null>(null);
  let error: string | null = null;
  if (failure instanceof ApiError) {
    const diagnostics = [...failure.diagnostics].sort((a, b) =>
      Number(b.playerId === null) - Number(a.playerId === null));
    const details = diagnostics.slice(0, 5).map((diagnostic) => {
      const name = diagnostic.playerId
        ? playersById?.get(diagnostic.playerId)?.name ?? "Unknown player"
        : "Source";
      return SOURCE_MESSAGES[diagnostic.code] ??
        `${name}: ${builderDiagnosticMessage(diagnostic.code)}`;
    }).join("; ");
    error = (MESSAGES[failure.code] ?? `Lineup build failed (${failure.code}).`) +
      (details ? ` ${details}` : "");
  } else if (failure) {
    error = "Lineup build failed. Check your session and source availability, then retry.";
  }
  useEffect(() => () => { current.current?.abort(); }, []);

  function cancel() {
    current.current?.abort();
    current.current = null;
    setPending(false);
    setProgress(null);
  }

  async function build(preferences: LineupBuildRequest) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setPending(true);
    setProgress(null);
    setFailure(null);
    try {
      const response = await streamLineupBuild(leagueId, token, preferences, (update) => {
        if (current.current === controller && !controller.signal.aborted) setProgress(update);
      }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(response);
    } catch (caught) {
      if (!controller.signal.aborted) setFailure(caught instanceof ApiError ? caught : "unknown");
    } finally {
      if (current.current === controller) {
        current.current = null;
        setPending(false);
        setProgress(null);
      }
    }
  }
  return { pending, progress, result, error, build, cancel };
}
