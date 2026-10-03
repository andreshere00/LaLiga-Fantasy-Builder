import { formatEuro } from "../../api/format";
import { ValueBox } from "../../components/ValueBox";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";
import { MarketFilterPanel } from "./MarketFilterPanel";
import { MarketFilterPanelMotion } from "./MarketRowMotion";
import { MarketPlayerSearch } from "./MarketPlayerSearch";
import type { MarketFilters } from "./marketFilters";

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
  sellerOptions: readonly string[];
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
};

export function MarketToolbar({
  money,
  showSearch,
  filters,
  onFiltersChange,
  sellerOptions,
  filtersOpen,
  onFiltersOpenChange,
  activeFilterCount,
  onClearFilters,
}: MarketToolbarProps) {
  return (
    <>
      <div className="market-toolbar">
        <h1>Market</h1>
      </div>
      <div className="market-filter-row">
        {showSearch ? (
          <MarketPlayerSearch
            value={filters.text}
            onChange={(text) => onFiltersChange({ ...filters, text })}
            activeFilterCount={activeFilterCount}
            filtersOpen={filtersOpen}
            onFiltersToggle={() => onFiltersOpenChange(!filtersOpen)}
            onClearFilters={onClearFilters}
          />
        ) : null}
        <MarketBalance money={money} />
      </div>
      {showSearch ? (
        <MarketFilterPanelMotion open={filtersOpen}>
          <MarketFilterPanel
            filters={filters}
            sellers={sellerOptions}
            onChange={onFiltersChange}
          />
        </MarketFilterPanelMotion>
      ) : null}
    </>
  );
}
