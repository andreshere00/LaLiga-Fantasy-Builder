import { t, useTranslation } from "../../i18n";
import { Dialog } from "../../components/ui/Dialog";

type OpponentLineupNoticeProps = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export function OpponentLineupNotice({
  open,
  message,
  onClose,
}: OpponentLineupNoticeProps) {
  useTranslation();
  return (
    <Dialog open={open} title={t("Lineup unavailable")} onClose={onClose}>
      <p className="modal-body-plain">{message}</p>
    </Dialog>
  );
}
