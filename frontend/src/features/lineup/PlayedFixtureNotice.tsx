import { Dialog } from "../../components/ui/Dialog";
import { PAST_FIXTURE_LOCKED_MESSAGE } from "./lineupMessages";

type PlayedFixtureNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayedFixtureNotice({ open, onClose }: PlayedFixtureNoticeProps) {
  return (
    <Dialog open={open} title="Lineup locked" onClose={onClose}>
      <p className="modal-body-plain">{PAST_FIXTURE_LOCKED_MESSAGE}</p>
    </Dialog>
  );
}
