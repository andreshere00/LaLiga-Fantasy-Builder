import { useId, useRef, useState } from "react";
import type { AutoRule } from "../../api/autoMarket";
import type { SquadCard } from "../../api/mappers";
import { formatEuro } from "../../api/format";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FieldDescription, FieldLabel } from "../../components/ui/Fields";
import { t, useTranslation } from "../../i18n";
import { AutoBuySearch } from "./AutoBuySearch";
import { FavoritesField, useFavoriteCandidates } from "./FavoritesRules";
import { FavoritesRulesDialog } from "./FavoritesRulesDialog";
import { BulkSellDialog } from "./BulkSellDialog";
import { useAutoMarket } from "./AutoMarketProvider";
import { NewFlag, useAutoMarketNew } from "./useNewFlag";
import { STATE_LABELS, isLive, reasonLabel, type AutoRuleTarget, type RuleSide } from "./autoRule";
import "./AutoMarket.css";

const STATE_TONE = { executed: "success", listed: "warning", failed: "failure" } as const;

function targetOf(rule: AutoRule): AutoRuleTarget {
  return {
    side: rule.side, playerId: rule.playerId, playerTeamId: rule.playerTeamId, name: rule.playerName,
    marketValue: rule.baselineValue,
    listed: rule.side === "buy" && rule.target === "market",
    clause: rule.target === "clause" ? { amount: null, unlockAt: null } : null,
  };
}

function RuleItem({ rule, busy, onEdit, onCancel }: {
  rule: AutoRule; busy: boolean; onEdit: () => void; onCancel: () => void;
}) {
  const reason = reasonLabel(rule.lastExecution?.reason ?? null);
  const trigger = rule.triggerKind === "relative" && rule.triggerPercent != null
    ? t(rule.side === "sell" ? "Rises {{0}}%" : "Drops {{0}}%", { 0: rule.triggerPercent.toLocaleString() })
    : t(rule.side === "sell" ? "Reaches an amount" : "Falls to an amount");
  const action = rule.target === "clause" ? t("pays the release clause")
    : rule.side === "sell" ? t("lists the player") : t("bids");
  return (
    <li className="auto-rule" aria-label={t("Rule for {{0}}", { 0: rule.playerName })}>
      <div className="auto-rule-heading">
        <h4>{rule.playerName}</h4>
        <Badge variant={STATE_TONE[rule.state as keyof typeof STATE_TONE] ?? "outline"}>{t(STATE_LABELS[rule.state])}</Badge>
      </div>
      <p>{rule.triggerKind === "none"
        ? t("Lists the player at their market value. Nothing is sold automatically.")
        : rule.side === "sell" && rule.listNow
          ? t("Lists the player now and accepts an offer of at least {{0}} (value when armed {{1}}).", {
            0: rule.priceMode === "threshold" ? formatEuro(rule.thresholdAmount) : t("the market value"), 1: formatEuro(rule.baselineValue),
          })
          : <>{trigger}: {t("acts at {{0}} (value when armed {{1}}) and {{2}}.", {
            0: formatEuro(rule.thresholdAmount), 1: formatEuro(rule.baselineValue), 2: action,
          })}</>}</p>
      {rule.side === "buy" && rule.maxSpend != null ? <p>{t("Spends at most {{0}}.", { 0: formatEuro(rule.maxSpend) })}</p> : null}
      {rule.state === "listed" && rule.acceptFloor != null
        ? <p>{t("Accepts any offer from {{0}}.", { 0: formatEuro(rule.acceptFloor) })}</p> : null}
      {rule.expiresAt && rule.state === "armed" ? <p>{t("Stops looking on {{0}}.", { 0: new Date(rule.expiresAt).toLocaleDateString() })}</p> : null}
      {reason ? <p className="auto-rule-reason">{reason}</p> : null}
      {isLive(rule.state) ? (
        <div className="auto-rule-actions">
          <Button variant="outline" shape="square" disabled={busy || rule.state !== "armed"}
            aria-label={t("Edit rule for {{0}}", { 0: rule.playerName })} onClick={onEdit}>{t("Edit")}</Button>
          <Button variant="ghost" shape="square" disabled={busy || rule.state === "executing"}
            aria-label={t("Cancel rule for {{0}}", { 0: rule.playerName })} onClick={onCancel}>{t("Cancel rule")}</Button>
        </div>
      ) : null}
    </li>
  );
}

function RuleList({ label, rules, busy, onEdit, onCancel }: {
  label: string; rules: readonly AutoRule[]; busy: boolean;
  onEdit: (rule: AutoRule) => void; onCancel: (rule: AutoRule) => void;
}) {
  return (
    <ul className="auto-rule-list" aria-label={label}>
      {rules.map((rule) => (
        <RuleItem key={rule.id} rule={rule} busy={busy} onEdit={() => onEdit(rule)} onCancel={() => onCancel(rule)} />
      ))}
    </ul>
  );
}

function ActiveRules({ empty, loading, rules, label, ...rest }: {
  empty: string; loading: boolean; rules: readonly AutoRule[]; label: string; busy: boolean;
  onEdit: (rule: AutoRule) => void; onCancel: (rule: AutoRule) => void;
}) {
  if (rules.length > 0) return <RuleList label={label} rules={rules} {...rest} />;
  return loading ? null : <p className="auto-market-empty">{empty}</p>;
}

/** Toolbar entry that lists the league's rules and starts an auto-sell for a squad player. */
type PanelProps = {
  squad: readonly SquadCard[];
  /** Controlled by the Market options menu, which then owns the trigger. */
  open?: boolean; onOpenChange?: (open: boolean) => void; showTrigger?: boolean;
};

export function AutoMarketPanel(props: PanelProps) {
  const auto = useAutoMarket();
  return auto ? <AutoMarketSheet {...props} auto={auto} /> : null;
}

function AutoMarketSheet({ auto, squad, open: controlled, onOpenChange, showTrigger = true }: PanelProps & {
  auto: NonNullable<ReturnType<typeof useAutoMarket>>;
}) {
  useTranslation();
  const ids = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const flag = useAutoMarketNew();
  const [entry, setEntry] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [favoritesSide, setFavoritesSide] = useState<RuleSide | null>(null);
  const favorites = useFavoriteCandidates(open, squad, auto.liveRuleFor);
  const sellable = squad.filter((card) => card.marketValue != null && card.masterPlayerId);
  // Players already on the market are left alone; only the missing ones are put there.
  const unlisted = sellable.filter((card) => !card.onMarket && !auto.liveRuleFor(card.masterPlayerId!, "sell"));
  const alreadyListed = sellable.filter((card) => card.onMarket).length;
  const chosen = sellable.find((card) => card.id === entry) ?? null;
  const live = auto.live;
  const history = auto.rules.filter((rule) => !isLive(rule.state)).slice(0, 10);
  const listFor = (side: "sell" | "buy") => live.filter((rule) => rule.side === side);
  const busy = auto.cancel.isPending;
  const listProps = {
    busy,
    onEdit: (rule: AutoRule) => { setOpen(false); auto.openRule(targetOf(rule), rule); },
    onCancel: (rule: AutoRule) => auto.cancel.mutate(rule),
  };
  return <>
    {showTrigger ? <Button ref={trigger} shape="square" variant="outline" className="auto-market-trigger"
      aria-label={t("Auto market, {{0}} active", { 0: live.length })}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { flag.dismiss(); setOpen(true); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="auto-market-icon"><path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" /></svg>
      {t("Auto market ")}<span className="auto-market-count">{live.length}</span>
      {flag.isNew ? <NewFlag /> : null}
    </Button> : null}
    <Dialog open={open} title={t("Auto market")} layout="sheet" className="auto-market-panel"
      onClose={() => setOpen(false)} finalFocus={() => (trigger.current?.isConnected ? trigger.current
        : document.querySelector<HTMLElement>("[data-market-options-trigger]") ?? false)}
      footer={<Button variant="outline" shape="square" onClick={() => setOpen(false)}>{t("Close")}</Button>}>
      <p>{t("Rules act once, on their own, even when this app is closed. You confirm each one when you arm it.")}</p>
      {auto.status === "needs_reauth" ? <p role="alert">{t("Rules are paused because your LaLiga session expired. Link your account again to resume them.")}</p> : null}
      {auto.status === "not_member" ? <p role="alert">{t("Rules are paused because this account is no longer in the league.")}</p> : null}
      {auto.status === "degraded" ? <p role="status">{t("LaLiga was unavailable on the last check. Rules will try again soon.")}</p> : null}
      {auto.rulesQuery.isError && !auto.rulesQuery.data ? <p role="alert">{t("Rules could not be loaded. Try again in a moment.")}</p> : null}
      <section className="auto-market-section" aria-labelledby={`${ids}-selling`}>
        <h3 className="fb-section-title" id={`${ids}-selling`}>{t("Selling")}</h3>
        <Field>
          <FieldLabel id={`${ids}-squad`}>{t("Sell one of my players automatically")}</FieldLabel>
          <div role="radiogroup" aria-labelledby={`${ids}-squad`} className="auto-market-players">
            {sellable.map((card) => (
              <label key={card.id} className="auto-market-player" data-selected={card.id === entry || undefined}>
                <input type="radio" name={`${ids}-player`} value={card.id} checked={card.id === entry}
                  onChange={() => setEntry(card.id)} />
                {card.photoUrl ? <img className="auto-market-photo" src={card.photoUrl} alt="" /> : <span className="auto-market-photo" aria-hidden="true" />}
                <span className="auto-market-player-name">{card.name}</span>
                <span className="auto-market-player-meta">
                  {card.teamBadgeUrl ? <img className="auto-market-badge" src={card.teamBadgeUrl} alt="" /> : null}
                  <span>{t("FSYP")} {card.totalPoints ?? "–"}</span>
                  <span>{formatEuro(card.marketValue)}</span>
                  {card.onMarket ? <span className="auto-market-listed">{t("On the market")}</span> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="auto-market-actions">
            <Button shape="square" disabled={!chosen} onClick={() => {
              if (!chosen) return;
              setOpen(false);
              auto.openRule({
                side: "sell", playerId: chosen.masterPlayerId!, playerTeamId: chosen.id, name: chosen.name,
                photoUrl: chosen.photoUrl, teamBadgeUrl: chosen.teamBadgeUrl, marketValue: chosen.marketValue, clause: null, listed: chosen.onMarket,
              });
            }}>{t("Set up auto-sell")}</Button>
            <Button variant="outline" shape="square" disabled={unlisted.length === 0}
              onClick={() => { setOpen(false); auto.clearBulkMessage(); setBulkOpen(true); }}>{t("List all my players…")}</Button>
          </div>
          {chosen ? null : <FieldDescription>{t("Choose a player to set up an auto-sell for them.")}</FieldDescription>}
        </Field>
        <FavoritesField side="sell" players={favorites.sells} hasFavorites={favorites.hasFavorites}
          onLaunch={() => { setOpen(false); auto.clearBulkMessage(); setFavoritesSide("sell"); }} />
        <ActiveRules empty={t("No active auto-sells.")} loading={auto.rulesQuery.isLoading} rules={listFor("sell")}
          label={t("Active auto-sells")} {...listProps} />
      </section>
      <section className="auto-market-section" aria-labelledby={`${ids}-buying`}>
        <h3 className="fb-section-title" id={`${ids}-buying`}>{t("Buying")}</h3>
        <AutoBuySearch open={open} onPick={(target) => {
          const existing = auto.liveRuleFor(target.playerId, "buy");
          setOpen(false);
          if (existing) auto.openRule({ ...target, marketValue: existing.baselineValue }, existing);
          else auto.openRule(target);
        }} />
        <FavoritesField side="buy" players={favorites.buys} hasFavorites={favorites.hasFavorites}
          onLaunch={() => { setOpen(false); auto.clearBulkMessage(); setFavoritesSide("buy"); }} />
        <FieldDescription>{t("You can also open Options on a player in the market to auto-buy them.")}</FieldDescription>
        <ActiveRules empty={t("No active auto-buys.")} loading={auto.rulesQuery.isLoading} rules={listFor("buy")}
          label={t("Active auto-buys")} {...listProps} />
      </section>
      {history.length > 0 ? (
        <section className="auto-market-section" aria-labelledby={`${ids}-history`}>
          <h3 className="fb-section-title" id={`${ids}-history`}>{t("History")}</h3>
          <RuleList label={t("Finished rules")} rules={history} {...listProps} />
        </section>
      ) : null}
    </Dialog>
    <FavoritesRulesDialog open={favoritesSide != null} side={favoritesSide ?? "buy"}
      players={favoritesSide === "sell" ? favorites.sells : favorites.buys} pending={auto.armMany.isPending}
      error={auto.bulkMessage} onClose={() => setFavoritesSide(null)}
      onConfirm={(writes) => auto.armMany.mutate(writes, { onSuccess: () => setFavoritesSide(null) })} />
    <BulkSellDialog open={bulkOpen} cards={unlisted} alreadyListed={alreadyListed} pending={auto.armMany.isPending} error={auto.bulkMessage}
      onClose={() => setBulkOpen(false)}
      onConfirm={(writes) => auto.armMany.mutate(writes, { onSuccess: () => setBulkOpen(false) })} />
  </>;
}
