import { copy as localizeCopy, useLanguage } from "../../i18n";
import { SearchIcon } from "../shell/icons";

type MarketPlayerSearchProps = {
  value: string;
  onChange: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  label?: string;
  placeholder?: string;
  inputId?: string;
  suggestions?: readonly string[];
};

export function MarketPlayerSearch({
  value,
  onChange,
  activeFilterCount,
  onClearFilters,
  label = "Search market",
  placeholder = "Name, seller or team",
  inputId = "market-player-search",
  suggestions = [],
}: MarketPlayerSearchProps) {
  useLanguage();
  return (
    <div className="market-search">
      <label className="market-search-label" htmlFor={inputId}>
        {localizeCopy(label)}
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
            placeholder={localizeCopy(placeholder)}
            list={suggestions.length ? `${inputId}-suggestions` : undefined}
          />
          <datalist id={`${inputId}-suggestions`}>
            {[...new Set(suggestions)].map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        {activeFilterCount > 0 ? (
          <button type="button" className="market-filter-clear" onClick={onClearFilters}>
            {localizeCopy("Clear filters")}</button>
        ) : null}
      </div>
    </div>
  );
}
