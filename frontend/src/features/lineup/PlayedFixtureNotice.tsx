import { copy as localizeCopy, useLanguage } from "../../i18n";
import { Dialog } from "../../components/ui/Dialog";
import { PAST_FIXTURE_LOCKED_MESSAGE } from "./lineupMessages";

type PlayedFixtureNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayedFixtureNotice({ open, onClose }: PlayedFixtureNoticeProps) {
  useLanguage();
  return (
    <Dialog open={open} title={localizeCopy("Lineup locked")} onClose={onClose}>
      <p className="modal-body-plain">{localizeCopy(PAST_FIXTURE_LOCKED_MESSAGE)}</p>
    </Dialog>
  );
}
