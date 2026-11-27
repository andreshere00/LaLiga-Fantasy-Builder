import { useEffect, useId, useRef, useState } from "react";
import type { SquadCard } from "../../api/mappers";
import type { AutoRuleWrite } from "../../api/autoMarket";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { formatEuro } from "../../api/format";
import { ScrollArea } from "../../components/ui/ScrollArea";
import { Field, FieldDescription, FieldError, FieldLabel, Input } from "../../components/ui/Fields";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/ToggleGroup";
import { t, useTranslation } from "../../i18n";
import { bulkSellWrites, type BulkSellMode } from "./autoRule";
import "./AutoMarket.css";

type Props = {
  open: boolean;
  cards: readonly SquadCard[];
  /** Players already on the market; they are not touched. */
  alreadyListed?: number;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (writes: AutoRuleWrite[]) => void;
};

const DESCRIPTIONS: Record<BulkSellMode, string> = {
  list: "Each player is put on the market at their market value on the next check. Nothing is sold automatically: you choose which offer to accept.",
  offer: "Each player is put on the market on the next check at their market value plus the percentage, and an offer that reaches that price is accepted automatically.",
  rise: "Each player is put on the market once their own market value rises by the percentage, and offers from that price are accepted automatically.",
};

/** Arms one rule per player to put them on the market; arming is the confirmation for each. */
export function BulkSellDialog({ open, cards, alreadyListed = 0, pending, error, onClose, onConfirm }: Props) {
  useTranslation();
  const ids = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<BulkSellMode>("list");
  const [percent, setPercent] = useState("5");
  useEffect(() => { if (open) { setMode("list"); setPercent("5"); } }, [open]);
  const { writes, percentError } = bulkSellWrites(cards, mode, percent);
  const count = cards.length;
  return (
    <Dialog open={open} title={t("List all my players")} className="auto-rule-dialog" busy={pending}
      closeOnBackdrop={!pending} initialFocus={() => cancelRef.current}
      description={alreadyListed > 0
        ? t("{{0}} players to put on the market. {{1}} already on it are left as they are.", { 0: count, 1: alreadyListed })
        : t("{{0}} players without an active sell rule", { 0: count })}
      onClose={() => { if (!pending) onClose(); }}
      footer={<>
        <Button ref={cancelRef} variant="outline" shape="square" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
        <Button shape="square" disabled={!writes || count === 0} loading={pending} loadingLabel={t("Arming…")}
          onClick={() => writes && onConfirm(writes)}>{mode === "list" ? t("List {{0}} players", { 0: count }) : t("Arm {{0}} auto-sells", { 0: count })}</Button>
      </>}>
      <ScrollArea className="auto-bulk-players"
        viewportProps={{ role: "region", "aria-label": t("Players to put on the market") }}>
        <ul>
          {cards.map((card) => (
            <li key={card.id}><span>{card.name}</span><span>{formatEuro(card.marketValue)}</span></li>
          ))}
        </ul>
      </ScrollArea>
      <Field>
        <FieldLabel id={`${ids}-mode`}>{t("Put them on the market")}</FieldLabel>
        <ToggleGroup aria-labelledby={`${ids}-mode`} value={[mode]} disabled={pending}
          onValueChange={(values) => { if (values[0] != null) setMode(String(values[0]) as BulkSellMode); }}>
          <ToggleGroupItem value="list">{t("Only list them")}</ToggleGroupItem>
          <ToggleGroupItem value="offer">{t("List and sell at a gain")}</ToggleGroupItem>
          <ToggleGroupItem value="rise">{t("List when each value rises")}</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>{t(DESCRIPTIONS[mode])}</FieldDescription>
      </Field>
      {mode !== "list" ? (
        <Field data-invalid={percentError ? "" : undefined}>
          <FieldLabel htmlFor={`${ids}-percent`}>{t("Percentage (%)")}</FieldLabel>
          <Input id={`${ids}-percent`} inputMode="decimal" autoComplete="off" value={percent} disabled={pending}
            aria-invalid={!!percentError} aria-describedby={percentError ? `${ids}-percent-error` : undefined}
            onChange={(event) => setPercent(event.target.value)} />
          {percentError ? <FieldError id={`${ids}-percent-error`}>{percentError}</FieldError> : null}
        </Field>
      ) : null}
      <p className="auto-rule-consent">
        {t("Each rule acts once, on its own, even when this app is closed. You can edit or cancel any of them, one by one, until it acts.")}
      </p>
      {error ? <p className="market-dialog-error" role="alert">{t(error)}</p> : null}
    </Dialog>
  );
}
