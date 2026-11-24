import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { leagueId } from "../../api/mappers";
import { ApiError, NeedsReauthError } from "../../api/errors";
import { autoResultSchema, autoRulesSchema, type AutoRule, type AutoRuleWrite } from "../../api/autoMarket";
import { notify, notifyEvent } from "../../components/ui/Notifications";
import { useRetained } from "../../hooks/useRetained";
import { t } from "../../i18n";
import { useLeague } from "../lineup/LeagueProvider";
import { AutoRuleDialog } from "./AutoRuleDialog";
import { isLive, type AutoRuleTarget, type RuleSide } from "./autoRule";
import { autoMarketPaths, autoMarketRequest } from "./client";

export type RuleDialogState = { target: AutoRuleTarget; rule: AutoRule | null };

/** League views the worker's writes change: listings, offers, squad, lineup and money. */
const WORKER_WRITE_VIEWS = ["market", "market-offers", "team", "lineup", "team-money", "standing", "player-league"];

/** Specific, actionable copy; raw upstream text never reaches the screen. */
export function ruleErrorMessage(error: unknown): string {
  if (error instanceof NeedsReauthError) return "Your LaLiga session expired. Link your account again.";
  if (error instanceof ApiError) {
    if (error.status === 409) return "You already have an active rule for this player and action.";
    if (error.status === 404) return "This player is not available for that rule any more. Refresh the market and try again.";
    if (error.status === 422) return "The rule was rejected. Check the values and try again.";
  }
  return "The rule could not be saved. Try again.";
}

function useAutoMarketState(money: number | null) {
  const { user, accessToken, status } = useAuth();
  const { selected } = useLeague();
  const league = selected ? leagueId(selected) : "";
  const owner = user?.userId ?? "";
  const token = accessToken ?? "";
  const enabled = !!owner && !!token && status === "ready" && !!league;
  const queryClient = useQueryClient();
  const key = ["auto-market", owner, league];
  const rulesQuery = useQuery({
    queryKey: [...key, "rules"], enabled, placeholderData: keepPreviousData,
    queryFn: ({ signal }) => autoMarketRequest(token, autoMarketPaths.rules(league), autoRulesSchema, "GET", undefined, signal),
    refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const [dialog, setDialog] = useState<RuleDialogState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: ({ write, rule }: { write: AutoRuleWrite; rule: AutoRule | null }) =>
      rule
        ? autoMarketRequest(token, autoMarketPaths.rule(league, rule.id), autoResultSchema, "PUT", write)
        : autoMarketRequest(token, autoMarketPaths.rules(league), autoResultSchema, "POST", write),
    onSuccess: (_, { write }) => {
      notify(write.side === "sell" ? "Auto-sell armed. It will run once." : "Auto-buy armed. It will run once.");
      setDialog(null);
      setMessage(null);
      return invalidate();
    },
    onError: (error) => setMessage(ruleErrorMessage(error)),
  });
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const armMany = useMutation({
    // One at a time: each rule is its own confirmed write, and a failure must not hide the others.
    mutationFn: async (writes: AutoRuleWrite[]) => {
      let armed = 0;
      let failure: unknown = null;
      for (const write of writes) {
        try {
          await autoMarketRequest(token, autoMarketPaths.rules(league), autoResultSchema, "POST", write);
          armed += 1;
        } catch (error) {
          if (error instanceof NeedsReauthError) throw error;
          failure ??= error;
        }
      }
      if (armed === 0) throw failure ?? new ApiError(422, "no_rule_armed");
      return { armed, total: writes.length };
    },
    onSuccess: ({ armed, total }) => {
      setBulkMessage(null);
      notify(armed === total
        ? t("{{0}} rules armed. Each will run once.", { 0: armed })
        : t("{{0}} of {{1}} rules armed. The rest were rejected.", { 0: armed, 1: total }));
      return invalidate();
    },
    onError: (error) => setBulkMessage(ruleErrorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: (rule: AutoRule) => autoMarketRequest(token, autoMarketPaths.rule(league, rule.id), autoResultSchema, "DELETE"),
    onSuccess: () => { notify("Rule cancelled. Nothing will be bought or sold for it."); return invalidate(); },
    onError: () => notify("The rule could not be cancelled. Try again.", "error"),
  });

  // Tell the manager when a rule acted while they were away; the first load is only a baseline.
  const previous = useRef<Map<number, AutoRule["state"]> | null>(null);
  const rules = rulesQuery.data?.rules;
  useEffect(() => {
    if (!rules) return;
    const seen = previous.current;
    if (seen) {
      let wrote = false;
      for (const rule of rules) {
        const before = seen.get(rule.id);
        if (before === undefined || before === rule.state) continue;
        wrote ||= rule.state === "listed" || rule.state === "executed";
        const id = `auto-market:${owner}:${rule.id}:${rule.state}`;
        if (rule.state === "listed") notifyEvent(id, t("{{0}} was listed by your auto-sell rule.", { 0: rule.playerName }));
        else if (rule.state === "executed") {
          notifyEvent(id, t(rule.side === "sell" ? "Auto-sell finished for {{0}}." : "Auto-buy finished for {{0}}.", { 0: rule.playerName }));
        } else if (rule.state === "failed") notify(t("The auto rule for {{0}} failed. Check your market.", { 0: rule.playerName }), "error");
        else if (rule.state === "expired") notifyEvent(id, t("The auto rule for {{0}} expired.", { 0: rule.playerName }));
      }
      // The worker wrote to Fantasy behind the screen's back: reload what that write changed.
      if (wrote) {
        for (const view of WORKER_WRITE_VIEWS) void queryClient.invalidateQueries({ queryKey: [view, league] });
      }
    }
    previous.current = new Map(rules.map((rule) => [rule.id, rule.state]));
  }, [rules, owner, league, queryClient]);

  const live = useMemo(() => (rules ?? []).filter((rule) => isLive(rule.state)), [rules]);
  return {
    money, rulesQuery, rules: rules ?? [], live, status: rulesQuery.data?.status ?? "inactive",
    dialog, message, save, cancel, armMany, bulkMessage, clearBulkMessage: () => setBulkMessage(null),
    liveRuleFor: (playerId: string, side: RuleSide) =>
      live.find((rule) => rule.playerId === playerId && rule.side === side) ?? null,
    openRule: (target: AutoRuleTarget, rule: AutoRule | null = null) => { setMessage(null); setDialog({ target, rule }); },
    closeDialog: () => { if (!save.isPending) setDialog(null); },
  };
}

type AutoMarketApi = ReturnType<typeof useAutoMarketState>;
const Context = createContext<AutoMarketApi | null>(null);

/** Shares the league's rules and the single arm/edit dialog with the toolbar and row menus. */
export function AutoMarketProvider({ money, children }: { money: number | null; children: ReactNode }) {
  const value = useAutoMarketState(money);
  const retained = useRetained(value.dialog);
  return (
    <Context.Provider value={value}>
      {children}
      <AutoRuleDialog open={value.dialog != null} state={retained} money={money} pending={value.save.isPending}
        error={value.message} onClose={value.closeDialog}
        onConfirm={(write) => retained && value.save.mutate({ write, rule: retained.rule })} />
    </Context.Provider>
  );
}

/** ``null`` outside the market screen, where no rule can be armed. */
export function useAutoMarket(): AutoMarketApi | null {
  return useContext(Context);
}
