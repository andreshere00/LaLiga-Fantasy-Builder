import {
  FilterAvailabilityChips,
  FilterPositionChips,
  FilterMarketValueRange,
  FilterSellerSelect,
  FilterStatRange,
  FilterTextInput,
} from "../market/MarketFilterFields";
import type { PlayersColumnKey } from "./playersColumnHeadings";
import type { PlayersFilters } from "./playersSearchParams";

type PlayersColumnFilterPopoverProps = {
  column: PlayersColumnKey;
  filters: PlayersFilters;
  owners: readonly string[];
  teams: readonly string[];
  onChange: (filters: PlayersFilters) => void;
  onClearColumn: () => void;
};

export function PlayersColumnFilterPopover({
  column,
  filters,
  owners,
  teams,
  onChange,
  onClearColumn,
}: PlayersColumnFilterPopoverProps) {
  return (
    <div className="market-column-filter-popover">
      {column === "name" ? (
        <FilterTextInput
          label="Player name"
          value={filters.player}
          onChange={(player) => onChange({ ...filters, player })}
          placeholder="Search by name"
        />
      ) : null}

      {column === "team" ? (
        <>
          <FilterTextInput
            label="Team"
            value={filters.team}
            onChange={(team) => onChange({ ...filters, team })}
            placeholder="Club name"
          />
          {teams.length > 0 ? (
            <label className="market-column-filter-text">
              Pick a team
              <select
                className="market-filter-select"
                value=""
                onChange={(event) => {
                  if (event.target.value) onChange({ ...filters, team: event.target.value });
                }}
              >
                <option value="">Choose…</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>
          ) : null}
        </>
      ) : null}

      {column === "owner" ? (
        <>
          <FilterTextInput
            label="Owned by"
            value={filters.owner}
            onChange={(owner) => onChange({ ...filters, owner })}
            placeholder="Manager or Free Agent"
          />
          {owners.length > 0 ? (
            <FilterSellerSelect
              sellers={owners}
              onPick={(owner) => onChange({ ...filters, owner })}
            />
          ) : null}
        </>
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

      {column === "position" ? (
        <FilterPositionChips
          selected={filters.positions}
          onChange={(positions) => onChange({ ...filters, positions })}
        />
      ) : null}

      <button type="button" className="market-column-filter-clear" onClick={onClearColumn}>
        Clear column filter
      </button>
    </div>
  );
}
