import { formatEuro } from "../../api/format";
import { Popover } from "@base-ui/react/popover";
import { Button } from "../../components/ui/Button";
import { Help } from "../../components/ui/Help";
import moneyWarningIconUrl from "../../assets/button_warning.svg";
import moneyIconUrl from "../../assets/button_money.svg";
import { MarketPlayerSearch } from "./MarketPlayerSearch";
import type { MarketFilters } from "./marketFilters";
import type { ReactNode } from "react";
import type { BidProjection } from "./model/activeBids";

type MarketBalanceProps = {
  money: number | null;
  projection?: BidProjection;
  projectionRefreshing?: boolean;
  projectionStale?: boolean;
};

export function MarketBalance({ money, projection, projectionRefreshing, projectionStale }: MarketBalanceProps) {
  const negative = money != null && money < 0;
  const help = projection ? [
    "Assuming all active bids succeed.",
    projection.estimated
      ? "Available is a conservative estimate: reported balance minus bids; Fantasy may already reserve this money."
      : "Based on verified balance reservation accounting.",
    projection.available != null && projection.available < 0
      ? "Active bids could exceed your cash. This projection is separate from your reported balance."
      : "",
  ].filter(Boolean).join(" ") : "Your reported balance.";
  return (
    <div className="market-money-summary" aria-label="Market money summary" aria-busy={projectionRefreshing}>
      <span className="market-money-heading">Amount available</span>
      <Popover.Root>
        <Popover.Trigger className={"market-balance-amount" + (negative ? " is-negative" : "")}
          aria-label={`Amount available: ${formatEuro(money)}. Show balance details`}>
          <strong>{formatEuro(money)}</strong>
          <img className="market-money-icon" src={negative ? moneyWarningIconUrl : moneyIconUrl} alt="" aria-hidden="true" />
          <svg className="market-money-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner align="end" sideOffset={8} className="market-money-positioner">
            <Popover.Popup className="market-money-popup" initialFocus={false}>
              <div className="market-money-popup-heading">
                <Popover.Title>Balance details</Popover.Title>
                <Help content={help} trigger={<button type="button" className="market-money-help" aria-label="About available balance" />}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>
                </Help>
              </div>
              <dl className="market-money-breakdown">
                <div><dt>Reported balance</dt><dd className={negative ? "is-negative" : undefined}>{formatEuro(money)}</dd></div>
                {projection ? <>
                  <div>
                    <dt>Projected spending</dt>
                    <dd>{projection.spending == null ? "Unavailable" : formatEuro(projection.spending)}</dd>
                  </div>
                  <div className={projection.available != null && projection.available < 0 ? "is-negative" : undefined}>
                    <dt>{projection.estimated ? "Estimated available" : "Projected available"}</dt>
                    <dd>{projection.available == null ? "Unavailable" : formatEuro(projection.available)}</dd>
                  </div>
                </> : null}
              </dl>
              {negative ? <p className="market-money-status is-negative">
                The balance must be positive before the next matchday begins; otherwise, no points will be scored.
              </p> : null}
              {projection && (!projection.complete || projectionRefreshing || projectionStale) ? (
                <p className="market-money-status" role="status">
                  {!projection.complete ? "Projection incomplete. " : ""}
                  {projectionStale ? "Refresh failed; cached values may be stale." : projectionRefreshing ? "Refreshing balance and bids…" : ""}
                </p>
              ) : null}
              <Popover.Close render={<Button variant="ghost" size="sm" shape="square" />}>Close</Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
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
          <MarketBalance money={money} projection={projection}
            projectionRefreshing={projectionRefreshing} projectionStale={projectionStale} />
        </div>
      </div>
    </>
  );
}
