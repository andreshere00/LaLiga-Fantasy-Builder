import { pointsLabel } from "../../../api/mappers";
import { averageLastPerformances, formatScoreAverage } from "../fsypStats";
import type { MarketRow } from "../model/row";

type FsypCellProps = {
  points: MarketRow["points"];
  averagePoints: MarketRow["averagePoints"];
  formRecent: MarketRow["formRecent"];
};

export function FsypCell({ points, averagePoints, formRecent }: FsypCellProps) {
  const seasonAverage = formatScoreAverage(averagePoints);
  const formAverage = formatScoreAverage(averageLastPerformances(formRecent, 3));

  return (
    <span className="market-fsyp has-hover-tooltip-panel market-fsyp-tooltip-target" tabIndex={0}>
      <span className="market-fsyp-primary">{pointsLabel(points)}</span>
      <span className="market-fsyp-average">{seasonAverage}</span>
      <span className="hover-tooltip-panel is-align-start market-fsyp-tooltip" role="tooltip">
        <span className="market-fsyp-tooltip-line">
          Total score: {pointsLabel(points)}
        </span>
        <span className="market-fsyp-tooltip-line">Season average: {seasonAverage}</span>
        <span className="market-fsyp-tooltip-line">
          Form average: {formAverage}
        </span>
      </span>
    </span>
  );
}
