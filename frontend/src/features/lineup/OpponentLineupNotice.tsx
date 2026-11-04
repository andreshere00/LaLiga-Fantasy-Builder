import { copy as localizeCopy, useLanguage } from "../../i18n";
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
  useLanguage();
  return (
    <Dialog open={open} title={localizeCopy("Lineup unavailable")} onClose={onClose}>
      <p className="modal-body-plain">{localizeCopy(message)}</p>
    </Dialog>
  );
}
