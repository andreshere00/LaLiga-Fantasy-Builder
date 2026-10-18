import { formatEuro } from "../../api/format";
import { ValueBox } from "../../components/ValueBox";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";
import { MarketPlayerSearch } from "./MarketPlayerSearch";
import type { MarketFilters } from "./marketFilters";
import type { ReactNode } from "react";
import type { BidProjection } from "./model/activeBids";

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
  projection?: BidProjection;
  projectionRefreshing?: boolean;
  projectionStale?: boolean;
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
  projection,
  projectionRefreshing,
  projectionStale,
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
          <div className="market-money-summary" aria-label="Market money summary" aria-busy={projectionRefreshing}>
            <MarketBalance money={money} />
            {projection ? <>
              <ValueBox label="Projected spending" value={projection.spending == null ? "Unavailable" : formatEuro(projection.spending)} />
              <ValueBox label={projection.estimated ? "Estimated available" : "Projected available"}
                value={projection.available == null ? "Unavailable" : formatEuro(projection.available)}
                tone={projection.available != null && projection.available < 0 ? "negative" : "default"} />
            </> : null}
          </div>
          {projection ? <p className="market-projection-note">
            Assuming all active bids succeed. {projection.estimated
              ? "Available is a conservative estimate: reported balance minus bids; Fantasy may already reserve this money."
              : "Based on verified balance reservation accounting."}
            {!projection.complete ? " Projection incomplete: balance or bid details are unavailable." : ""}
            {projectionRefreshing ? " Refreshing balance and bids…" : ""}
            {projectionStale ? " Refresh failed; cached values may be stale." : ""}
          </p> : null}
          {projection?.available != null && projection.available < 0 ? <p className="market-projection-note is-negative">
            Active bids could exceed your cash. This projection is separate from your reported balance.
          </p> : null}
        </div>
      </div>
    </>
  );
}
