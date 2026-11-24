import { useEffect, useId, useRef, useState } from "react";
import type { AutoRuleWrite } from "../../api/autoMarket";
import { formatEuro } from "../../api/format";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FieldDescription, FieldError, FieldLabel, Input } from "../../components/ui/Fields";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/ToggleGroup";
import { t, useTranslation } from "../../i18n";
import { favoriteRuleWrites, type FavoriteCandidate, type FavoritePriceMode, type RuleSide } from "./autoRule";
import "./AutoMarket.css";

type Props = {
  open: boolean;
  side: RuleSide;
  players: readonly FavoriteCandidate[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (writes: AutoRuleWrite[]) => void;
};

const DESCRIPTIONS: Record<`${RuleSide}-${FavoritePriceMode}`, string> = {
  "buy-market": "Each player is bid for at their market value when they are on the market, and never above it.",
  "buy-amount": "Each player is bid for at this amount when they are on the market, and only while their market value is not higher.",
  "sell-market": "Each player is put on the market on the next check at their market value, and an offer that reaches it is accepted.",
  "sell-amount": "Each player is put on the market on the next check at this amount, and an offer that reaches it is accepted.",
};

/** Arms one rule per chosen favorite at the market value or at an amount; arming confirms each. */
export function FavoritesRulesDialog({ open, side, players, pending, error, onClose, onConfirm }: Props) {
  useTranslation();
  const ids = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<FavoritePriceMode>("market");
  const [amount, setAmount] = useState("");
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { if (open) { setMode("market"); setAmount(""); setSkipped(new Set()); } }, [open]);
  const chosen = players.filter((player) => !skipped.has(player.playerId));
  const { writes, amountError } = favoriteRuleWrites(side, chosen, mode, amount);
  const count = writes?.length ?? 0;
  const unavailable = (player: FavoriteCandidate) => mode === "market" && !player.marketValue;
  const toggle = (id: string) => setSkipped((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return (
    <Dialog open={open} title={side === "buy" ? t("Auto-buy my favorites") : t("Auto-sell my favorites")}
      className="auto-rule-dialog" busy={pending} closeOnBackdrop={!pending}
      initialFocus={() => cancelRef.current}
      description={t("{{0}} favorite players", { 0: players.length })}
      onClose={() => { if (!pending) onClose(); }}
      footer={<>
        <Button ref={cancelRef} variant="outline" shape="square" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
        <Button shape="square" disabled={count === 0} loading={pending} loadingLabel={t("Arming…")}
          onClick={() => writes && onConfirm(writes)}>
          {side === "buy" ? t("Arm {{0}} auto-buys", { 0: count }) : t("Arm {{0}} auto-sells", { 0: count })}
        </Button>
      </>}>
      <Field>
        <FieldLabel id={`${ids}-mode`}>{t("Price")}</FieldLabel>
        <ToggleGroup aria-labelledby={`${ids}-mode`} value={[mode]} disabled={pending}
          onValueChange={(values) => { if (values[0] != null) setMode(String(values[0]) as FavoritePriceMode); }}>
          <ToggleGroupItem value="market">{t("At market value")}</ToggleGroupItem>
          <ToggleGroupItem value="amount">{t("At an amount")}</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>{t(DESCRIPTIONS[`${side}-${mode}`])}</FieldDescription>
      </Field>
      {mode === "amount" ? (
        <Field data-invalid={amountError && amount ? "" : undefined}>
          <FieldLabel htmlFor={`${ids}-amount`}>{t("Amount for each player (€)")}</FieldLabel>
          <Input id={`${ids}-amount`} inputMode="numeric" autoComplete="off" value={amount} disabled={pending}
            aria-invalid={!!amountError && !!amount} aria-describedby={amountError && amount ? `${ids}-amount-error` : undefined}
            onChange={(event) => setAmount(event.target.value)} />
          {amountError && amount ? <FieldError id={`${ids}-amount-error`}>{amountError}</FieldError> : null}
        </Field>
      ) : null}
      <Field>
        <FieldLabel id={`${ids}-players`}>{t("Players")}</FieldLabel>
        <div role="group" aria-labelledby={`${ids}-players`} className="auto-market-players">
          {players.map((player) => {
            const off = unavailable(player);
            return (
              <label key={player.playerId} className="auto-market-player" data-selected={(!skipped.has(player.playerId) && !off) || undefined}>
                <input type="checkbox" disabled={off || pending} checked={!skipped.has(player.playerId) && !off}
                  onChange={() => toggle(player.playerId)} />
                {player.photoUrl ? <img className="auto-market-photo" src={player.photoUrl} alt="" /> : <span className="auto-market-photo" aria-hidden="true" />}
                <span className="auto-market-player-name">{player.name}</span>
                <span className="auto-market-player-meta">
                  {player.teamBadgeUrl ? <img className="auto-market-badge" src={player.teamBadgeUrl} alt="" /> : null}
                  <span>{player.marketValue ? formatEuro(player.marketValue) : t("No market value")}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Field>
      <p className="auto-rule-consent">
        {t("Each rule acts once, on its own, even when this app is closed. You can edit or cancel any of them, one by one, until it acts.")}
      </p>
      {error ? <p className="market-dialog-error" role="alert">{t(error)}</p> : null}
    </Dialog>
  );
}
