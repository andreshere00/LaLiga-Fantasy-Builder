import { formatEuro } from "../../api/format";

export function bidAmountTooltipLabel(bidMoney: number): string {
  return `Your bid: ${formatEuro(bidMoney)}`;
}
