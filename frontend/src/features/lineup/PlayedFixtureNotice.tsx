import { Modal } from "../../components/Modal";
import { PAST_FIXTURE_LOCKED_MESSAGE } from "./lineupMessages";

type PlayedFixtureNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayedFixtureNotice({ open, onClose }: PlayedFixtureNoticeProps) {
  return (
    <Modal open={open} title="Lineup locked" onClose={onClose}>
      <p className="modal-body-plain">{PAST_FIXTURE_LOCKED_MESSAGE}</p>
    </Modal>
  );
}
