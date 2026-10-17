import { useEffect, useId, useState } from "react";

import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../../api/format";
import { Dialog } from "../../../components/ui/Dialog";
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

  const stepBidAmount = (current: number | null, deltaSteps: number) => {
    if (deltaSteps === 0) return current ?? bidFloor;
    const base = current ?? bidFloor;
    return Math.max(bidFloor, base + deltaSteps * MARKET_VALUE_FILTER_STEP);
  };

  return (
    <Dialog
      open={open}
      title={directOffer ? "Make offer" : TITLES[kind]}
      onClose={onClose}
      closeOnBackdrop={!pending}
      footer={
        <>
          <button type="button" className="market-dialog-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="market-dialog-primary"
            disabled={!valid || pending}
            onClick={() => {
              if (parsed == null) return;
              onConfirm(parsed);
            }}
          >
            {pending ? "Sending…" : "Confirm"}
          </button>
        </>
      }
    >
      <p className="market-dialog-copy">
        {directOffer ? "Offer for" : "Bid for"} <strong>{row.name}</strong>. Amount must be at least{" "}
        {formatEuro(row.marketValue)} and {balanceHint}.
        {directOffer && " The owner must accept your offer before the player joins your squad."}
      </p>
      <label className="market-dialog-label" htmlFor={inputId}>
        {directOffer ? "Offer amount (€)" : "Bid amount (€)"}
      </label>
      <NumericCounterField
        id={inputId}
        inputClassName="market-dialog-input"
        ariaLabel={directOffer ? "Offer amount" : "Bid amount"}
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
      {!valid && raw.trim().length > 0 ? (
        <p className="market-dialog-error" role="alert">
          Enter a valid whole amount for this listing and your balance rules.
        </p>
      ) : null}
      {error ? (
        <p className="market-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
