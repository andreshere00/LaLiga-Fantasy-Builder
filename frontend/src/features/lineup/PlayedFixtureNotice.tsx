import { t, useTranslation } from "../../i18n";
import { Dialog } from "../../components/ui/Dialog";
import { PAST_FIXTURE_LOCKED_MESSAGE } from "./lineupMessages";

type PlayedFixtureNoticeProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayedFixtureNotice({ open, onClose }: PlayedFixtureNoticeProps) {
  useTranslation();
  return (
    <Dialog open={open} title={t("Lineup locked")} onClose={onClose}>
      <p className="modal-body-plain">{t(PAST_FIXTURE_LOCKED_MESSAGE)}</p>
    </Dialog>
  );
}
