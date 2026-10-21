import { useEffect, useId, useState } from "react";

import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../../api/format";
import { Dialog } from "../../../components/ui/Dialog";
import { Button } from "../../../components/ui/Button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../../components/ui/Fields";
import { NumericCounterField } from "../../../components/NumericCounterField";
import { MARKET_VALUE_FILTER_STEP } from "../marketFilterInputs";
import type { MarketRow } from "../model/row";
import { isValidBidAmount, maximumBidAmount, usesDirectOfferBid, type BidActionKind } from "./marketActions";

type BidDialogProps = {
  open: boolean;
  row: MarketRow | null;
  kind: BidActionKind | null;
  money: number | null;
  squadMarketValue: number | null;
  initialAmount: number | null;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (amount: number) => void;
};

const TITLES: Record<BidActionKind, string> = {
  hire: "Hire player",
  purchase: "Purchase bid",
  modify: "Modify bid",
};

function clampAndFormat(raw: string, bidFloor: number): string {
  const amount = parseIntegerAmount(raw);
  if (amount == null) return raw;
  return formatIntegerAmount(Math.max(bidFloor, amount));
}

export function BidDialog({
  open,
  row,
  kind,
  money,
  squadMarketValue,
  initialAmount,
  pending,
  error = null,
  onClose,
  onConfirm,
}: BidDialogProps) {
  const inputId = useId();
  const [raw, setRaw] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    if (kind === "modify" && initialAmount != null) {
      setRaw(formatIntegerAmount(initialAmount));
      return;
    }
    setRaw(row.marketValue != null ? formatIntegerAmount(row.marketValue) : "");
  }, [open, initialAmount, row, kind]);

  if (!row || !kind) return null;

  const parsed = parseIntegerAmount(raw);
  const reservedBid = kind === "modify" ? (row.myBid?.money ?? 0) : 0;
  const valid =
    parsed != null &&
    isValidBidAmount(parsed, row.marketValue, money, squadMarketValue, reservedBid);
  const bidFloor = row.marketValue ?? 0;
  const maximum = maximumBidAmount(money, squadMarketValue, reservedBid);
  const balanceHint =
    maximum != null
      ? `at most ${formatEuro(maximum)} (${squadMarketValue != null && Number.isFinite(squadMarketValue) && squadMarketValue > 0
        ? "available cash plus up to 20% of squad value" : "available cash"})`
      : "within your available bidding limit";
  const directOffer = usesDirectOfferBid(row, kind);
  const actionLabel = directOffer ? "Send offer" : kind === "modify" ? "Update bid" : "Place bid";
  const amountError = raw.trim().length === 0 || valid ? null
    : parsed == null ? "Enter a whole euro amount."
    : row.marketValue == null ? "The minimum amount is unavailable. Refresh the market before trying again."
    : parsed < bidFloor ? `Enter at least ${formatEuro(bidFloor)}.`
    : maximum != null ? `Enter no more than ${formatEuro(maximum)}.`
    : "Your bidding limit is unavailable. Refresh the market before trying again.";
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const stepBidAmount = (current: number | null, deltaSteps: number) => {
    if (deltaSteps === 0) return current ?? bidFloor;
    const base = current ?? bidFloor;
    return Math.max(bidFloor, base + deltaSteps * MARKET_VALUE_FILTER_STEP);
  };

  return (
    <Dialog
      className="market-bid-dialog"
      open={open}
      title={directOffer ? "Make offer" : TITLES[kind]}
      description={<>{directOffer ? "Offer for" : "Bid for"} <strong>{row.name}</strong>.
        {directOffer && " The owner must accept your offer before the player joins your squad."}</>}
      initialFocus={() => document.getElementById(inputId)}
      busy={pending}
      onClose={() => { if (!pending) onClose(); }}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="outline" shape="square" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            shape="square"
            disabled={!valid}
            loading={pending}
            loadingLabel="Sending…"
            onClick={() => {
              if (parsed == null) return;
              onConfirm(parsed);
            }}
          >
            {actionLabel}
          </Button>
        </>
      }
    >
      <Field data-invalid={amountError ? "" : undefined}>
        <FieldLabel htmlFor={inputId}>{directOffer ? "Offer amount (€)" : "Bid amount (€)"}</FieldLabel>
        <FieldDescription id={hintId}>
          Amount must be at least {formatEuro(row.marketValue)} and {balanceHint}.
        </FieldDescription>
        <NumericCounterField
          id={inputId}
          inputClassName="market-dialog-input"
          ariaLabel={directOffer ? "Offer amount" : "Bid amount"}
          ariaDescribedBy={`${hintId}${amountError ? ` ${errorId}` : ""}`}
          ariaInvalid={!!amountError}
          value={raw}
          disabled={pending}
          formatInput={(value) => value}
          parseValue={parseIntegerAmount}
          stepValue={stepBidAmount}
          onValueChange={setRaw}
          onBlur={() => {
            if (raw.trim() === "") return;
            setRaw(clampAndFormat(raw, bidFloor));
          }}
        />
        {amountError ? <FieldError id={errorId}>{amountError}</FieldError> : null}
      </Field>
      {error ? (
        <p className="market-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
