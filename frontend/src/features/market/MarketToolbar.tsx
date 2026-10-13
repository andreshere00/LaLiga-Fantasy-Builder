import { formatEuro } from "../../api/format";
import { ValueBox } from "../../components/ValueBox";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";
import { MarketPlayerSearch } from "./MarketPlayerSearch";
import type { MarketFilters } from "./marketFilters";
import type { ReactNode } from "react";

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
  filters: MarketFilters;
  onFiltersChange: (filters: MarketFilters) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  suggestions?: readonly string[];
  notifications?: ReactNode;
};

export function MarketToolbar({
  money,
  showSearch,
  filters,
  onFiltersChange,
  activeFilterCount,
  onClearFilters,
  suggestions,
  notifications,
}: MarketToolbarProps) {
  return (
    <>
      <div className="market-toolbar">
        <h1>Market</h1>
      </div>
      <div className="market-filter-row">
        {showSearch ? (
          <MarketPlayerSearch
            value={filters.query}
            onChange={(query) => onFiltersChange({ ...filters, query })}
            activeFilterCount={activeFilterCount}
            onClearFilters={onClearFilters}
            suggestions={suggestions}
          />
        ) : null}
        <div className="market-balance-actions">
          {notifications}
          <MarketBalance money={money} />
        </div>
      </div>
    </>
  );
}
