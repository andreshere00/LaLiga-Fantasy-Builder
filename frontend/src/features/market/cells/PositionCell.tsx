import { Help } from "../../../components/ui/Help";
import { positionAbbrev, positionLabel, positionTone } from "../positions";

type PositionCellProps = {
  positionId: number | null;
};

export function PositionCell({ positionId }: PositionCellProps) {
  const abbrev = positionAbbrev(positionId);
  const label = positionLabel(positionId);
  const tone = positionTone(positionId);

  return (
    <Help className="market-position" content={label}>
      <span className={`market-position-badge is-${tone}`}>{abbrev}</span>
    </Help>
  );
}
