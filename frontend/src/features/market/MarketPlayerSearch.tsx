import { SearchIcon } from "../shell/icons";

type MarketPlayerSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MarketPlayerSearch({ value, onChange }: MarketPlayerSearchProps) {
  return (
    <div className="market-search">
      <label className="market-search-label" htmlFor="market-player-search">
        Search players
      </label>
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
          placeholder="Search by name"
        />
      </div>
    </div>
  );
}
