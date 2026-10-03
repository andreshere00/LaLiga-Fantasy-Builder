import { formatEuro } from "../../../api/format";
import { Modal } from "../../../components/Modal";
import type { MarketRow } from "../model/row";

type ClauseDialogProps = {
  open: boolean;
  row: MarketRow | null;
  amount: number;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ClauseDialog({
  open,
  row,
  amount,
  pending,
  error = null,
  onClose,
  onConfirm,
}: ClauseDialogProps) {
  if (!open || !row) return null;

  return (
    <Modal
      open={open}
      title="Pay release clause"
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
        Pay {formatEuro(amount)} to trigger the release clause for{" "}
        <strong>{row.name}</strong>?
      </p>
      {error ? (
        <p className="market-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
