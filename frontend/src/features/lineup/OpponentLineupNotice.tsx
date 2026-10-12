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
  return (
    <Dialog open={open} title="Lineup unavailable" onClose={onClose}>
      <p className="modal-body-plain">{message}</p>
    </Dialog>
  );
}
