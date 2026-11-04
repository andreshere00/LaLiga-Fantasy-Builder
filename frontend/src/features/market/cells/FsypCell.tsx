import { t, useTranslation } from "../../../i18n";
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
  useTranslation();
  const seasonAverage = formatScoreAverage(averagePoints);
  const formAverage = formatScoreAverage(averageLastPerformances(formRecent, 3));

  return (
    <Help className="market-fsyp" content={<>
        <span className="market-fsyp-tooltip-line">
          {t("Total score: ")}{pointsLabel(points)}
        </span>
        <span className="market-fsyp-tooltip-line">{t("Season average: ")}{seasonAverage}</span>
        <span className="market-fsyp-tooltip-line">
          {t("Last 3 matches average: ")}{formAverage}
        </span>

    </>}>
      <span className="market-fsyp-primary">{pointsLabel(points)}</span>
      <span className="market-fsyp-average">{labelAverage ? t("Avg. ") : ""}{seasonAverage}</span>
    </Help>
  );
}
