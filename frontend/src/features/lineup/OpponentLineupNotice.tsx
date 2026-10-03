import { Modal } from "../../components/Modal";

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
    <Modal open={open} title="Lineup unavailable" onClose={onClose}>
      <p className="modal-body-plain">{message}</p>
    </Modal>
  );
}
