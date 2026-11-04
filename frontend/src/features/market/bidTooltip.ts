import { t } from "../../i18n";
import { formatEuro } from "../../api/format";

export function bidAmountTooltipLabel(bidMoney: number): string {
  return t("Your bid: {{0}}", { 0: formatEuro(bidMoney) });
}
