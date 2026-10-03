import { positionAbbrev, positionLabel, positionTone } from "../positions";

type PositionCellProps = {
  positionId: number | null;
};

export function PositionCell({ positionId }: PositionCellProps) {
  const abbrev = positionAbbrev(positionId);
  const label = positionLabel(positionId);
  const tone = positionTone(positionId);
  const showTooltip = label != null;

  return (
    <span
      className={
        showTooltip
          ? "market-position has-hover-tooltip-panel market-position-tooltip-target"
          : "market-position"
      }
      tabIndex={showTooltip ? 0 : undefined}
    >
      <span className={`market-position-badge is-${tone}`}>{abbrev}</span>
      {showTooltip ? (
        <span className="hover-tooltip-panel is-align-start" role="tooltip">
          {label}
        </span>
      ) : null}
    </span>
  );
}
