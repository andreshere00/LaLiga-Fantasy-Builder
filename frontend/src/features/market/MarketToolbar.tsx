import { formatEuro } from "../../api/format";
import { ValueBox } from "../../components/ValueBox";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";

type MarketToolbarProps = {
  money: number | null;
};

export function MarketToolbar({ money }: MarketToolbarProps) {
  const negative = money != null && money < 0;
  return (
    <div className="market-toolbar">
      <h1>Market</h1>
      <ValueBox
        label="Your money"
        value={formatEuro(money)}
        iconSrc={negative ? moneyWarningIconUrl : moneyIconUrl}
        iconTitle={
          negative
            ? "Balance must be positive before matchday begins in order to score"
            : undefined
        }
        tone={negative ? "negative" : "default"}
      />
    </div>
  );
}
