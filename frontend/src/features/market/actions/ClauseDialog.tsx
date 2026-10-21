import { formatEuro } from "../../../api/format";
import { useRef } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { Button } from "../../../components/ui/Button";
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  if (!row) return null;

  return (
    <Dialog
      open={open}
      title="Pay release clause"
      description={<>Pay {formatEuro(amount)} to trigger the release clause for <strong>{row.name}</strong>?</>}
      initialFocus={cancelRef}
      busy={pending}
      onClose={onClose}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="outline" ref={cancelRef} onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            loading={pending}
            loadingLabel="Paying…"
            onClick={onConfirm}
          >
            Pay release clause
          </Button>
        </>
      }
    >
      {error ? (
        <p className="market-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
