import { copy as localizeCopy, useLanguage } from "../../../i18n";
import { Dialog } from "../../../components/ui/Dialog";
import { useRef } from "react";
import { Button } from "../../../components/ui/Button";
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
  useLanguage();
  const cancelRef = useRef<HTMLButtonElement>(null);
  if (!row) return null;

  return (
    <Dialog
      open={open}
      title={localizeCopy("Withdraw from market")}
      description={<>{localizeCopy("Withdraw ")}<strong>{row.name}</strong> {localizeCopy(" from the market? The player will stay in your squad and all the offers will be cancelled.")}</>}
      initialFocus={cancelRef}
      busy={pending}
      onClose={onClose}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="outline" ref={cancelRef} onClick={onClose} disabled={pending}>
            {localizeCopy("Cancel")}</Button>
          <Button
            loading={pending}
            loadingLabel={localizeCopy("Withdrawing…")}
            onClick={onConfirm}
          >
            {localizeCopy("Withdraw player")}</Button>
        </>
      }
    >
      {error ? (
        <p className="market-dialog-error" role="alert">
          {localizeCopy(error)}
        </p>
      ) : null}
    </Dialog>
  );
}
