import { t, useTranslation } from "../../../i18n";
import { formatEuro } from "../../../api/format";
import { useRef } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { Button } from "../../../components/ui/Button";
import type { MarketRow } from "../model/row";
import { MarketDialogFacts } from "./MarketDialogFacts";

type ClauseDialogProps = {
  open: boolean;
  row: MarketRow | null;
  amount: number;
  money: number | null;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ClauseDialog({
  open,
  row,
  amount,
  money,
  pending,
  error = null,
  onClose,
  onConfirm,
}: ClauseDialogProps) {
  useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  if (!row) return null;
  const after = money == null ? null : money - amount;

  return (
    <Dialog
      open={open}
      title={t("Pay release clause")}
      description={t("Pay {{0}} to trigger the release clause for {{1}}? The payment can't be undone.",
        { 0: formatEuro(amount), 1: row.name })}
      initialFocus={cancelRef}
      busy={pending}
      onClose={onClose}
      closeOnBackdrop={!pending}
      footer={
        <>
          <Button variant="outline" ref={cancelRef} onClick={onClose} disabled={pending}>
            {t("Cancel")}</Button>
          <Button
            loading={pending}
            loadingLabel={t("Paying…")}
            onClick={onConfirm}
          >
            {t("Pay release clause")}</Button>
        </>
      }
    >
      <MarketDialogFacts facts={[
        { label: "Release clause", value: formatEuro(amount) },
        { label: "Balance", value: formatEuro(money) },
        { label: "Balance after payment", value: formatEuro(after), tone: after != null && after < 0 ? "failure" : undefined },
      ]} />
      {error ? (
        <p className="market-dialog-error" role="alert">
          {t(error)}
        </p>
      ) : null}
    </Dialog>
  );
}
