import { t, useTranslation } from "../../i18n";
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
import { NativeSelect } from "../../components/ui/Fields";

type PlayersColumnFilterFieldsProps = {
  column: PlayersColumnKey;
  filters: PlayersFilters;
  owners: readonly string[];
  teams: readonly string[];
  names?: readonly string[];
  onChange: (filters: PlayersFilters) => void;
  onClearColumn: () => void;
};

export function PlayersColumnFilterFields({
  column,
  filters,
  owners,
  teams,
  names = [],
  onChange,
  onClearColumn,
}: PlayersColumnFilterFieldsProps) {
  useTranslation();
  return (
    <div className="market-column-filter-fields">
      {column === "name" ? (
        <FilterTextInput
          label={t("Player name")}
          value={filters.player}
          onChange={(player) => onChange({ ...filters, player })}
          placeholder={t("Search by name")}
          suggestions={names}
        />
      ) : null}

      {column === "team" ? (
        <>
          <FilterTextInput
            label={t("Team")}
            value={filters.team}
            onChange={(team) => onChange({ ...filters, team })}
            placeholder={t("Club name")}
            suggestions={teams}
          />
          {teams.length > 0 ? (
            <label className="market-column-filter-text">
              {t("Pick a team")}<NativeSelect
                className="market-filter-select"
                value={teams.includes(filters.team) ? filters.team : ""}
                onChange={(event) => onChange({ ...filters, team: event.target.value })}
              >
                <option value="">{t("Choose…")}</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </NativeSelect>
            </label>
          ) : null}
        </>
      ) : null}

      {column === "owner" ? (
        <>
          <FilterTextInput
            label={t("Owned by")}
            value={filters.owner}
            onChange={(owner) => onChange({ ...filters, owner })}
            placeholder={t("Manager or Free Agent")}
            suggestions={owners}
          />
          {owners.length > 0 ? (
            <FilterSellerSelect
              sellers={owners}
              value={filters.owner}
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
        {t("Clear column filter")}</button>
    </div>
  );
}
