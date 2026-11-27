import { useRef } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useRetained } from "../../hooks/useRetained";
import { t, useTranslation } from "../../i18n";

export type DraftRestoreSource = "original" | "saved";

type DiscardDraftDialogProps = {
  source: DraftRestoreSource | null;
  weekLabel: string;
  onKeep: () => void;
  onDiscard: () => void;
  finalFocus?: () => HTMLElement | false;
};

/** Confirms replacing unsaved lineup edits; focus starts on keeping them. */
export function DiscardDraftDialog({ source, weekLabel, onKeep, onDiscard, finalFocus }: DiscardDraftDialogProps) {
  useTranslation();
  const keepRef = useRef<HTMLButtonElement>(null);
  const shown = useRetained(source);
  return (
    <Dialog
      open={source != null}
      title={t("Discard unsaved changes?")}
      description={shown === "original"
        ? t("Loading the original lineup for {{0}} replaces the changes you haven't saved.", { 0: weekLabel })
        : t("Loading the last saved lineup replaces the changes you haven't saved.")}
      initialFocus={keepRef}
      finalFocus={finalFocus}
      onClose={onKeep}
      footer={
        <>
          <Button variant="outline" ref={keepRef} onClick={onKeep}>{t("Keep editing")}</Button>
          <Button onClick={onDiscard}>{t("Discard changes")}</Button>
        </>
      }
    />
  );
}
