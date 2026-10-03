import { SearchIcon } from "../shell/icons";
import { MarketMotionButton } from "./MarketControlMotion";

type MarketPlayerSearchProps = {
  value: string;
  onChange: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
};

export function MarketPlayerSearch({
  value,
  onChange,
  activeFilterCount,
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
        {activeFilterCount > 0 ? (
          <MarketMotionButton type="button" className="market-filter-clear" onClick={onClearFilters}>
            Clear filters
          </MarketMotionButton>
        ) : null}
      </div>
    </div>
  );
}
