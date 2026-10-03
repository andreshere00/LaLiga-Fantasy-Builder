import { Modal } from "../../../components/Modal";
import type { MarketRow } from "../model/row";

type WithdrawDialogProps = {
  open: boolean;
  row: MarketRow | null;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function WithdrawDialog({
  open,
  row,
  pending,
  error = null,
  onClose,
  onConfirm,
}: WithdrawDialogProps) {
  if (!open || !row) return null;

  return (
    <Modal
      open={open}
      title="Withdraw from market"
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
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Sending…" : "Confirm"}
          </button>
        </>
      }
    >
      <p className="market-dialog-copy">
        Withdraw <strong>{row.name}</strong> from the market? The player will stay in your
        squad and all the offers will be cancelled.
      </p>
      {error ? (
        <p className="market-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
