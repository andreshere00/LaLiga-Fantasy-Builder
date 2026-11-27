import { useRef } from "react";

import { formatEuro } from "../../../api/format";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { t, useTranslation } from "../../../i18n";
import type { MarketRow } from "../model/row";

type CancelBidDialogProps = {
  open: boolean;
  row: MarketRow | null;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/** Confirms withdrawing the caller's own bid; focus starts on the safe choice. */
export function CancelBidDialog({
  open,
  row,
  pending,
  error = null,
  onClose,
  onConfirm,
}: CancelBidDialogProps) {
  useTranslation();
  const keepRef = useRef<HTMLButtonElement>(null);
  if (!row) return null;
  const money = row.myBid?.money ?? null;

  return (
    <Dialog
      open={open}
      title={t("Cancel bid")}
      description={money == null
        ? t("Cancel your bid for {{0}}? You can bid again while the listing is open.", { 0: row.name })
        : t("Cancel your {{0}} bid for {{1}}? You can bid again while the listing is open.",
          { 0: formatEuro(money), 1: row.name })}
      initialFocus={keepRef}
      busy={pending}
      onClose={onClose}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="outline" ref={keepRef} onClick={onClose} disabled={pending}>
            {t("Keep bid")}</Button>
          <Button loading={pending} loadingLabel={t("Cancelling bid…")} onClick={onConfirm}>
            {t("Cancel bid")}</Button>
        </>
      }
    >
      {error ? (
        <p className="market-dialog-error" role="alert">
          {t(error)}
        </p>
      ) : null}
    </Dialog>
  );
}
