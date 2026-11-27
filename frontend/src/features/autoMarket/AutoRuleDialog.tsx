import { useEffect, useId, useRef, useState } from "react";
import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../api/format";
import { maximumBidAmount } from "../market/actions/marketActions";
import type { AutoRuleWrite } from "../../api/autoMarket";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FieldDescription, FieldError, FieldLabel, Input } from "../../components/ui/Fields";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/ToggleGroup";
import { useNow } from "../../hooks/useNow";
import { t, useTranslation } from "../../i18n";
import { clauseUnlockCountdown } from "../market/model/valueSeries";
import type { RuleDialogState } from "./AutoMarketProvider";
import {
  defaultDraft, draftFromRule, waitsForMarket, draftThreshold, thresholdReached, validateDraft,
  type AutoRuleDraft, type RuleKind, type RulePriceMode, type RuleTargetKind,
} from "./autoRule";
import "./AutoMarket.css";

type Props = {
  open: boolean;
  state: RuleDialogState | null;
  money: number | null;
  squadMarketValue?: number | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (write: AutoRuleWrite) => void;
};

/** Groups a typed whole-euro amount with the locale separator; leaves anything unparsable as typed. */
const tidyAmount = (raw: string) => {
  const amount = parseIntegerAmount(raw);
  return amount == null ? raw : formatIntegerAmount(amount);
};

/** One value of a single-choice toggle group; ignores the empty array a deselect produces. */
const single = <T extends string>(values: readonly unknown[], set: (value: T) => void) => {
  if (values[0] != null) set(String(values[0]) as T);
};

/** Arming a rule is the user's confirmation that it may act once, unattended. */
export function AutoRuleDialog({ open, state, money, squadMarketValue = null, pending, error, onClose, onConfirm }: Props) {
  useTranslation();
  const ids = useId();
  const now = useNow(60_000);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const maximumBid = maximumBidAmount(money, squadMarketValue);
  const [draft, setDraft] = useState<AutoRuleDraft | null>(null);
  const target = state?.target ?? null;
  const rule = state?.rule ?? null;
  useEffect(() => {
    if (open && target) setDraft(rule ? draftFromRule(rule) : defaultDraft(target));
  }, [open, target, rule]);
  if (!target || !draft) return null;

  const sell = target.side === "sell";
  const listOnly = sell && draft.kind === "none";
  const clause = !sell && draft.target === "clause";
  const baseline = target.marketValue;
  const { errors, write } = validateDraft(target, draft, now);
  const threshold = draftThreshold(target.side, draft, baseline);
  const reached = !draft.listNow && !listOnly && threshold != null && baseline != null
    && thresholdReached(target.side, threshold, baseline);
  const change = (patch: Partial<AutoRuleDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const verb = listOnly ? "Arm auto-listing" : sell ? "Arm auto-sell" : "Arm auto-buy";
  const canChooseTarget = !sell && target.listed && target.clause != null;
  const spend = parseIntegerAmount(draft.maxSpend);
  const unlock = clause ? clauseUnlockCountdown(target.clause?.unlockAt ?? null, now) : null;

  return (
    <Dialog open={open} title={t(rule ? (sell ? "Edit auto-sell" : "Edit auto-buy") : sell ? "Auto-sell" : "Auto-buy")}
      className="auto-rule-dialog" busy={pending} closeOnBackdrop={!pending}
      initialFocus={() => cancelRef.current}
      description={<>{t("Market value now: ")}<strong>{formatEuro(baseline)}</strong></>}
      onClose={() => { if (!pending) onClose(); }}
      footer={<>
        <Button ref={cancelRef} variant="outline" shape="square" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
        <Button shape="square" disabled={!write} loading={pending} loadingLabel={t("Arming…")}
          onClick={() => write && onConfirm(write)}>{t(verb)}</Button>
      </>}>
      <div className="auto-rule-player">
        {target.photoUrl ? <img className="auto-market-photo" src={target.photoUrl} alt="" /> : null}
        <strong>{target.name}</strong>
        {target.teamBadgeUrl ? <img className="auto-market-badge" src={target.teamBadgeUrl} alt="" /> : null}
      </div>
      {waitsForMarket(target) ? (
        <FieldDescription>
          {t("The player does not have to be on the market now. The rule waits, and bids only if the market value is at or below your target.")}
        </FieldDescription>
      ) : null}
      {canChooseTarget ? (
        <Field>
          <FieldLabel id={`${ids}-target`}>{t("What should happen")}</FieldLabel>
          <ToggleGroup aria-labelledby={`${ids}-target`} value={[draft.target]} disabled={pending}
            onValueChange={(values) => single<RuleTargetKind>(values, (target) => change({ target }))}>
            <ToggleGroupItem value="market">{t("Bid on the market")}</ToggleGroupItem>
            <ToggleGroupItem value="clause">{t("Pay the release clause")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      ) : null}
      {clause ? (
        <FieldDescription>
          {target.clause?.amount != null ? <>{t("Release clause now: ")}{formatEuro(target.clause.amount)}. </> : null}
          {unlock ? t("It unlocks in {{0}}; the rule waits for that.", { 0: unlock }) : t("It is unlocked now.")}
        </FieldDescription>
      ) : null}

      {sell ? (
        <Field>
          <FieldLabel id={`${ids}-listing`}>{t("Put it on the market")}</FieldLabel>
          <ToggleGroup aria-labelledby={`${ids}-listing`} value={[draft.listNow ? "now" : "later"]} disabled={pending}
            onValueChange={(values) => single<"now" | "later">(values, (when) => change(
              when === "now" ? { listNow: true } : { listNow: false, kind: draft.kind === "none" ? "relative" : draft.kind },
            ))}>
            <ToggleGroupItem value="now">{t("Right away")}</ToggleGroupItem>
            <ToggleGroupItem value="later">{t("When the value is reached")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      ) : null}
      <Field>
        <FieldLabel id={`${ids}-kind`}>
          {t(sell ? (draft.listNow ? "Accept offers automatically" : "Sell when the market value") : "Buy when the market value")}
        </FieldLabel>
        <ToggleGroup aria-labelledby={`${ids}-kind`} value={[draft.kind]} disabled={pending}
          onValueChange={(values) => single<RuleKind>(values, (kind) => change({ kind }))}>
          {sell && draft.listNow ? <ToggleGroupItem value="none">{t("Never, I choose")}</ToggleGroupItem> : null}
          <ToggleGroupItem value="relative">{t(sell ? (draft.listNow ? "From a gain on the value" : "Rises by a percentage") : "Drops by a percentage")}</ToggleGroupItem>
          <ToggleGroupItem value="absolute">{t(sell ? (draft.listNow ? "From an amount" : "Reaches an amount") : "Falls to an amount")}</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {listOnly ? (
        <FieldDescription>
          {t("The player is listed at their market value and nothing is sold automatically. You choose which offer to accept.")}
        </FieldDescription>
      ) : draft.kind === "relative" ? (
        <Field data-invalid={errors.percent ? "" : undefined}>
          <FieldLabel htmlFor={`${ids}-percent`}>{t("Percentage (%)")}</FieldLabel>
          <Input id={`${ids}-percent`} inputMode="decimal" autoComplete="off" value={draft.percent} disabled={pending}
            aria-invalid={!!errors.percent} aria-describedby={errors.percent ? `${ids}-percent-error` : undefined}
            onChange={(event) => change({ percent: event.target.value })} />
          {errors.percent ? <FieldError id={`${ids}-percent-error`}>{errors.percent}</FieldError> : null}
        </Field>
      ) : (
        <Field data-invalid={errors.amount ? "" : undefined}>
          <FieldLabel htmlFor={`${ids}-amount`}>{t("Amount (€)")}</FieldLabel>
          <Input id={`${ids}-amount`} inputMode="numeric" autoComplete="off" value={draft.amount} disabled={pending}
            aria-invalid={!!errors.amount} aria-describedby={errors.amount ? `${ids}-amount-error` : undefined}
            onChange={(event) => change({ amount: event.target.value })}
            onBlur={() => change({ amount: tidyAmount(draft.amount) })} />
          {errors.amount ? <FieldError id={`${ids}-amount-error`}>{errors.amount}</FieldError> : null}
        </Field>
      )}

      {!clause && !listOnly ? (
        <Field>
          <FieldLabel id={`${ids}-price`}>{t(sell ? "List the player" : "Bid")}</FieldLabel>
          <ToggleGroup aria-labelledby={`${ids}-price`} value={[draft.priceMode]} disabled={pending}
            onValueChange={(values) => single<RulePriceMode>(values, (priceMode) => change({ priceMode }))}>
            <ToggleGroupItem value="threshold">{t(sell ? "At my threshold" : "Up to my threshold")}</ToggleGroupItem>
            <ToggleGroupItem value="market_value">{t("At the market value")}</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            {t(sell
              ? "At my threshold accepts any offer that reaches it. At the market value accepts offers from the value on the day it lists."
              : "Up to my threshold bids more to beat rivals, never below the market value. At the market value bids the minimum.")}
          </FieldDescription>
        </Field>
      ) : null}

      {!sell ? (
        <Field data-invalid={errors.maxSpend ? "" : undefined}>
          <FieldLabel htmlFor={`${ids}-spend`}>{t("Most this rule may spend (€)")}</FieldLabel>
          <FieldDescription id={`${ids}-spend-hint`}>
            {money == null ? t("Your balance is unavailable.")
              : maximumBid != null && squadMarketValue != null && squadMarketValue > 0
                ? t("Your cash: {{0}}. You can bid up to {{1}}, using up to 20% of your squad value.", { 0: formatEuro(money), 1: formatEuro(maximumBid) })
                : t("Your cash: {{0}}. Bids can use up to 20% of your squad value on top.", { 0: formatEuro(money) })}
          </FieldDescription>
          <Input id={`${ids}-spend`} inputMode="numeric" autoComplete="off" value={draft.maxSpend} disabled={pending}
            aria-invalid={!!errors.maxSpend}
            aria-describedby={`${ids}-spend-hint${errors.maxSpend ? ` ${ids}-spend-error` : ""}`}
            onChange={(event) => change({ maxSpend: event.target.value })}
            onBlur={() => change({ maxSpend: tidyAmount(draft.maxSpend) })} />
          {errors.maxSpend ? <FieldError id={`${ids}-spend-error`}>{errors.maxSpend}</FieldError> : null}
        </Field>
      ) : null}

      <Field data-invalid={errors.expires ? "" : undefined}>
        <FieldLabel htmlFor={`${ids}-expires`}>{t("Stop looking after (optional)")}</FieldLabel>
        <Input id={`${ids}-expires`} type="date" value={draft.expires} disabled={pending}
          aria-invalid={!!errors.expires} aria-describedby={errors.expires ? `${ids}-expires-error` : undefined}
          onChange={(event) => change({ expires: event.target.value })} />
        {errors.expires ? <FieldError id={`${ids}-expires-error`}>{errors.expires}</FieldError> : null}
      </Field>

      <p className="auto-rule-preview" role="status" data-reached={reached || undefined}>
        {listOnly ? t("Lists the player at {{0}} on its next check. Nothing is sold automatically.", { 0: formatEuro(baseline) })
          : threshold == null ? t("Fill in the trigger to see when this rule acts.")
          : draft.listNow ? t("Lists the player on its next check and accepts an offer of at least {{0}} (value now {{1}}).", {
            0: draft.priceMode === "threshold" ? formatEuro(threshold) : t("the market value on that day"), 1: formatEuro(baseline),
          })
          : t(
            sell ? "Acts when the market value is at least {{0}} (now {{1}})." : "Acts when the market value is at most {{0}} (now {{1}}).",
            { 0: formatEuro(threshold), 1: formatEuro(baseline) },
          )}
        {reached ? <> <strong>{t("That is already true, so it will act on its next check.")}</strong></> : null}
        {!sell && spend != null ? <> {t("It will never spend more than {{0}}.", { 0: formatEuro(spend) })}</> : null}
      </p>
      <p className="auto-rule-consent">
        {t("It acts once, on its own, even when this app is closed. You can cancel it until it acts.")}
      </p>
      {error ? <p className="market-dialog-error" role="alert">{t(error)}</p> : null}
    </Dialog>
  );
}
