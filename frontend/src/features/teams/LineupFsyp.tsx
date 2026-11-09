import { t } from "../../i18n";

/** Season Fantasy points as a labelled tag, shaped unlike the coloured form icon beside it. */
export function LineupFsyp({ points }: { points: number | null | undefined }) {
  if (points == null) return null;
  return (
    <span className="team-fsyp" title={t("Fantasy points this season")}>
      <span className="team-fsyp-label">{t("FSYP")}</span>
      <span className="team-fsyp-value">{points}</span>
    </span>
  );
}
