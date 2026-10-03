import { SearchIcon } from "../shell/icons";

type MarketPlayerSearchProps = {
  value: string;
  onChange: (value: string) => void;
  activeFilterCount: number;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  onClearFilters: () => void;
};

export function MarketPlayerSearch({
  value,
  onChange,
  activeFilterCount,
  filtersOpen,
  onFiltersToggle,
  onClearFilters,
}: MarketPlayerSearchProps) {
  return (
    <div className="market-search">
      <label className="market-search-label" htmlFor="market-player-search">
        Search market
      </label>
      <div className="market-search-controls">
        <div className="market-search-field">
          <span className="market-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id="market-player-search"
            className="market-search-input"
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Name, seller or team"
          />
        </div>
        <button
          type="button"
          className={`market-filter-toggle${filtersOpen ? " is-open" : ""}`}
          aria-expanded={filtersOpen}
          aria-controls="market-filter-panel"
          onClick={onFiltersToggle}
        >
          Filters
          {activeFilterCount > 0 ? (
            <span className="market-filter-badge" aria-label={`${activeFilterCount} active filters`}>
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {activeFilterCount > 0 ? (
          <button type="button" className="market-filter-clear" onClick={onClearFilters}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
