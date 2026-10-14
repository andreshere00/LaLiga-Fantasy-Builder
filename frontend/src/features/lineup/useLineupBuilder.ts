import { useEffect, useRef, useState } from "react";
import { paths, postJson } from "../../api/client";
import { ApiError } from "../../api/errors";
import { lineupBuildResponseSchema, type LineupBuildDto, type LineupBuildRequest } from "../../api/schemas";

const MESSAGES: Record<string, string> = {
  financial_data_unavailable: "Cash or pending commitments could not be verified.",
  mandatory_player_conflict: "A mandatory player cannot qualify with these sources and restrictions.",
  no_feasible_lineup: "No lineup satisfies the selected formation, player and financial constraints.",
  target_deadline_conflict: "The round opening and fixture deadlines disagree. A safe target could not be verified.",
  no_target_week: "No supported future round is available.",
  search_incomplete: "Search stopped before finding a feasible candidate. Try fewer sources or formations.",
  builder_busy: "The builder is busy. Retry shortly.",
};

const SOURCE_MESSAGES: Record<string, string> = {
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
export function useLineupBuilder(leagueId: string, token: string) {
  const current = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LineupBuildDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { current.current?.abort(); }, []);

  function cancel() {
    current.current?.abort();
    current.current = null;
    setPending(false);
  }

  async function build(preferences: LineupBuildRequest) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setPending(true);
    setError(null);
    try {
      const response = await postJson(paths.lineupBuild(leagueId), token, preferences, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(lineupBuildResponseSchema.parse(response));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof ApiError
        ? (MESSAGES[failure.code] ?? `Lineup build failed (${failure.code}).`) +
          (failure.diagnostics.length ? " " + failure.diagnostics.slice(0, 5).map((d) => SOURCE_MESSAGES[d.code] ?? `${d.playerId ?? "Source"}: ${d.code.replaceAll("_", " ")}`).join("; ") : "")
        : "Lineup build failed. Check your session and source availability, then retry.");
    } finally {
      if (current.current === controller) {
        current.current = null;
        setPending(false);
      }
    }
  }
  return { pending, result, error, build, cancel };
}
