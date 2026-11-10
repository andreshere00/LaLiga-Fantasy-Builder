import { t, useTranslation } from "../../../i18n";
import { Help } from "../../../components/ui/Help";
import { positionAbbrev, positionLabel, positionTone } from "../positions";
import { nextPositionFilter, usePositionFilter } from "./positionFilter";

type PositionCellProps = {
  positionId: number | null;
};

export function PositionCell({ positionId }: PositionCellProps) {
  useTranslation();
  const filter = usePositionFilter();
  const abbrev = positionAbbrev(positionId);
  const label = positionLabel(positionId);
  const tone = positionTone(positionId);
  const badge = <span className={`market-position-badge is-${tone}`}>{abbrev}</span>;

  if (filter && positionId != null && label) {
    const only = filter.selected.size === 1 && filter.selected.has(positionId);
    const action = only ? t("Show all positions") : t("Show only {{0}}", { 0: label });
    return (
      <Help content={action} trigger={<button type="button"
        className="market-position market-position-filter" aria-pressed={only}
        aria-label={`${label}. ${action}`}
        onClick={() => filter.onFilter(nextPositionFilter(filter.selected, positionId))} />}>
        {badge}
      </Help>
    );
  }
  return (
    <Help className="market-position" content={label}>
      {badge}
    </Help>
  );
}
