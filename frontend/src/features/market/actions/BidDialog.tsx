import { useEffect, useId, useState } from "react";

import { formatEuro, formatIntegerAmount, parseIntegerAmount } from "../../../api/format";
import { Modal } from "../../../components/Modal";
import { NumericCounterField } from "../../../components/NumericCounterField";
import { MARKET_VALUE_FILTER_STEP } from "../marketFilterInputs";
import type { MarketRow } from "../model/row";
import { isValidBidAmount, type BidActionKind } from "./marketActions";

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
  const spending = money != null ? money + reservedBid : null;
  const balanceHint =
    spending != null && spending > 0
      ? `less than ${formatEuro(spending)}`
      : "within your debt limit (20% of squad value)";

  const stepBidAmount = (current: number | null, deltaSteps: number) => {
    if (deltaSteps === 0) return current ?? bidFloor;
    const base = current ?? bidFloor;
    return Math.max(bidFloor, base + deltaSteps * MARKET_VALUE_FILTER_STEP);
  };

  return (
    <Modal
      open={open}
      title={TITLES[kind]}
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
        Bid for <strong>{row.name}</strong>. Amount must be at least{" "}
        {formatEuro(row.marketValue)} and {balanceHint}.
      </p>
      <label className="market-dialog-label" htmlFor={inputId}>
        Bid amount (€)
      </label>
      <NumericCounterField
        id={inputId}
        inputClassName="market-dialog-input"
        ariaLabel="Bid amount"
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
    </Modal>
  );
}
