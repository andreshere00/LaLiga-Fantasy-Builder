import { copy as localizeCopy, useLanguage } from "../../../i18n";
import { Help } from "../../../components/ui/Help";

import { pointsLabel } from "../../../api/mappers";
import { averageLastPerformances, formatScoreAverage } from "../fsypStats";
import type { MarketRow } from "../model/row";

type FsypCellProps = {
  points: MarketRow["points"];
  averagePoints: MarketRow["averagePoints"];
  formRecent: MarketRow["formRecent"];
  labelAverage?: boolean;
};

export function FsypCell({ points, averagePoints, formRecent, labelAverage = false }: FsypCellProps) {
  useLanguage();
  const seasonAverage = formatScoreAverage(averagePoints);
  const formAverage = formatScoreAverage(averageLastPerformances(formRecent, 3));

  return (
    <Help className="market-fsyp" content={<>
        <span className="market-fsyp-tooltip-line">
          {localizeCopy("Total score: ")}{localizeCopy(pointsLabel(points))}
        </span>
        <span className="market-fsyp-tooltip-line">{localizeCopy("Season average: ")}{localizeCopy(seasonAverage)}</span>
        <span className="market-fsyp-tooltip-line">
          {localizeCopy("Last 3 matches average: ")}{localizeCopy(formAverage)}
        </span>

    </>}>
      <span className="market-fsyp-primary">{localizeCopy(pointsLabel(points))}</span>
      <span className="market-fsyp-average">{localizeCopy(labelAverage ? "Avg. " : "")}{localizeCopy(seasonAverage)}</span>
    </Help>
  );
}
