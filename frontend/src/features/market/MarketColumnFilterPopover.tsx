import type { MarketColumnKey } from "./marketColumnHeadings";
import {
  FilterAvailabilityChips,
  FilterPositionChips,
  FilterMarketValueRange,
  FilterSellerSelect,
  FilterStatRange,
  FilterTextInput,
} from "./MarketFilterFields";
import type { MarketFilters } from "./marketFilters";

type MarketColumnFilterPopoverProps = {
  column: MarketColumnKey;
  filters: MarketFilters;
  sellers: readonly string[];
  onChange: (filters: MarketFilters) => void;
  onClearColumn: () => void;
};

export function MarketColumnFilterPopover({
  column,
  filters,
  sellers,
  onChange,
  onClearColumn,
}: MarketColumnFilterPopoverProps) {
  return (
    <div className="market-column-filter-popover" role="group" aria-label={`Filter ${column}`}>
      {column === "player" ? (
        <FilterTextInput
          label="Player name"
          value={filters.field === "player" || filters.field === "all" ? filters.text : ""}
          onChange={(text) => onChange({ ...filters, text, field: "player" })}
          placeholder="Search by name"
        />
      ) : null}

      {column === "position" ? (
        <FilterPositionChips
          selected={filters.positions}
          onChange={(positions) => onChange({ ...filters, positions })}
        />
      ) : null}

      {column === "fsyp" ? (
        <FilterStatRange
          range={filters.points}
          onChange={(points) => onChange({ ...filters, points })}
        />
      ) : null}

      {column === "form" ? (
        <FilterStatRange range={filters.form} onChange={(form) => onChange({ ...filters, form })} />
      ) : null}

      {column === "marketValue" ? (
        <FilterMarketValueRange
          range={filters.marketValue}
          onChange={(marketValue) => onChange({ ...filters, marketValue })}
        />
      ) : null}

      {column === "availability" ? (
        <FilterAvailabilityChips
          selected={filters.availability}
          onChange={(availability) => onChange({ ...filters, availability })}
        />
      ) : null}

      {column === "sellOptions" ? (
        <>
          <FilterTextInput
            label="Seller"
            value={filters.field === "seller" || filters.field === "all" ? filters.text : ""}
            onChange={(text) => onChange({ ...filters, text, field: "seller" })}
            placeholder="LaLiga or manager"
          />
          {sellers.length > 0 ? (
            <FilterSellerSelect
              sellers={sellers}
              onPick={(seller) => onChange({ ...filters, text: seller, field: "seller" })}
            />
          ) : null}
        </>
      ) : null}

      {column === "sealEnd" ? (
        <p className="market-column-filter-empty">This column cannot be filtered.</p>
      ) : null}

      {column !== "sealEnd" ? (
        <button type="button" className="market-column-filter-clear" onClick={onClearColumn}>
          Clear column filter
        </button>
      ) : null}
    </div>
  );
}
