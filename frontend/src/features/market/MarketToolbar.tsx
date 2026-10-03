import { formatEuro } from "../../api/format";
import { ValueBox } from "../../components/ValueBox";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";
import { MarketPlayerSearch } from "./MarketPlayerSearch";

type MarketBalanceProps = {
  money: number | null;
};

export function MarketBalance({ money }: MarketBalanceProps) {
  const negative = money != null && money < 0;
  return (
    <ValueBox
      label="Balance"
      value={formatEuro(money)}
      iconSrc={negative ? moneyWarningIconUrl : moneyIconUrl}
      iconTitle={
        negative
          ? "The balance must be positive before the next matchday begins; otherwise, no points will be scored."
          : undefined
      }
      tone={negative ? "negative" : "default"}
    />
  );
}

type MarketToolbarProps = {
  money: number | null;
  showSearch: boolean;
  playerSearch: string;
  onPlayerSearchChange: (value: string) => void;
};

export function MarketToolbar({
  money,
  showSearch,
  playerSearch,
  onPlayerSearchChange,
}: MarketToolbarProps) {
  return (
    <>
      <div className="market-toolbar">
        <h1>Market</h1>
      </div>
      <div className="market-filter-row">
        {showSearch ? (
          <MarketPlayerSearch value={playerSearch} onChange={onPlayerSearchChange} />
        ) : null}
        <MarketBalance money={money} />
      </div>
    </>
  );
}
