import { copy as localizeCopy, useLanguage } from "../../../i18n";
import { Help } from "../../../components/ui/Help";
import { positionAbbrev, positionLabel, positionTone } from "../positions";

type PositionCellProps = {
  positionId: number | null;
};

export function PositionCell({ positionId }: PositionCellProps) {
  useLanguage();
  const abbrev = positionAbbrev(positionId);
  const label = positionLabel(positionId);
  const tone = positionTone(positionId);

  return (
    <Help className="market-position" content={localizeCopy(label)}>
      <span className={`market-position-badge is-${tone}`}>{localizeCopy(abbrev)}</span>
    </Help>
  );
}
