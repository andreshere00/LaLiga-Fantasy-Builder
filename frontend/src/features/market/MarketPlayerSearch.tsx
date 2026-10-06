import { SearchIcon } from "../shell/icons";

type MarketPlayerSearchProps = {
  value: string;
  onChange: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  label?: string;
  placeholder?: string;
  inputId?: string;
};

export function MarketPlayerSearch({
  value,
  onChange,
  activeFilterCount,
  onClearFilters,
  label = "Search market",
  placeholder = "Name, seller or team",
  inputId = "market-player-search",
}: MarketPlayerSearchProps) {
  return (
    <div className="market-search">
      <label className="market-search-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="market-search-controls">
        <div className="market-search-field">
          <span className="market-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id={inputId}
            className="market-search-input"
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
        {activeFilterCount > 0 ? (
          <button type="button" className="market-filter-clear" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
