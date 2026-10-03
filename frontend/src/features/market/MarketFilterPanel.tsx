import { useEffect, useState } from "react";

import { formatIntegerAmount } from "../../api/format";
import {
  formatMarketValueFilterInput,
  formatStatFilterInput,
  MARKET_VALUE_FILTER_MAX,
  MARKET_VALUE_FILTER_MIN,
  parseMarketValueFilterBound,
  parseStatFilterBound,
} from "./marketFilterInputs";
import { MARKET_SELLER_FILTER_HINT } from "./marketMessages";
import type { Availability } from "./model/availability";
import type { MarketFilters, MarketSearchField, NumericRange } from "./marketFilters";

type MarketFilterPanelProps = {
  filters: MarketFilters;
  sellers: readonly string[];
  onChange: (filters: MarketFilters) => void;
};

const SEARCH_FIELDS: { value: MarketSearchField; label: string }[] = [
  { value: "all", label: "All" },
  { value: "player", label: "Player name" },
  { value: "seller", label: "Seller" },
  { value: "team", label: "Team" },
];

const AVAILABILITY_OPTIONS: { value: Availability; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "questionable", label: "Questionable" },
  { value: "unavailable", label: "Unavailable" },
];

type RangeFieldProps = {
  label: string;
  range: NumericRange;
  onChange: (next: NumericRange) => void;
  formatInput: (raw: string) => string;
  parseBound: (raw: string) => number | null;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  hint?: string;
};

function RangeField({
  label,
  range,
  onChange,
  formatInput,
  parseBound,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  hint,
}: RangeFieldProps) {
  const [rawMin, setRawMin] = useState("");
  const [rawMax, setRawMax] = useState("");

  useEffect(() => {
    setRawMin(range.min != null ? formatIntegerAmount(range.min) : "");
    setRawMax(range.max != null ? formatIntegerAmount(range.max) : "");
  }, [range.min, range.max]);

  const commit = (key: "min" | "max", raw: string, setRaw: (value: string) => void) => {
    const parsed = parseBound(raw);
    onChange({ ...range, [key]: parsed });
    setRaw(parsed != null ? formatIntegerAmount(parsed) : "");
  };

  return (
    <fieldset className="market-filter-range">
      <legend>{label}</legend>
      {hint ? <p className="market-filter-range-hint">{hint}</p> : null}
      <div className="market-filter-range-inputs">
        <label className="market-filter-range-label">
          Min
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="market-filter-range-input"
            value={rawMin}
            onChange={(event) => setRawMin(formatInput(event.target.value))}
            onBlur={() => commit("min", rawMin, setRawMin)}
            placeholder={minPlaceholder}
          />
        </label>
        <label className="market-filter-range-label">
          Max
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="market-filter-range-input"
            value={rawMax}
            onChange={(event) => setRawMax(formatInput(event.target.value))}
            onBlur={() => commit("max", rawMax, setRawMax)}
            placeholder={maxPlaceholder}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function MarketFilterPanel({ filters, sellers, onChange }: MarketFilterPanelProps) {
  const toggleAvailability = (value: Availability) => {
    const next = new Set(filters.availability);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filters, availability: next });
  };

  const pickSeller = (seller: string) => {
    onChange({ ...filters, text: seller, field: "seller" });
  };

  return (
    <div className="market-filter-panel">
      <div className="market-filter-panel-grid">
        <label className="market-filter-field">
          Search in
          <select
            className="market-filter-select"
            value={filters.field}
            onChange={(event) =>
              onChange({ ...filters, field: event.target.value as MarketSearchField })
            }
          >
            {SEARCH_FIELDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {filters.field === "seller" || filters.field === "all" ? (
            <span className="market-filter-field-hint">{MARKET_SELLER_FILTER_HINT}</span>
          ) : null}
        </label>

        {sellers.length > 0 ? (
          <label className="market-filter-field">
            Seller
            <select
              className="market-filter-select"
              value=""
              onChange={(event) => {
                if (event.target.value) pickSeller(event.target.value);
              }}
            >
              <option value="">Pick a seller…</option>
              {sellers.map((seller) => (
                <option key={seller} value={seller}>
                  {seller}
                </option>
              ))}
            </select>
            <span className="market-filter-field-hint">
              Sets the search box to that seller (same as Search in → Seller).
            </span>
          </label>
        ) : null}

        <RangeField
          label="Market value"
          range={filters.marketValue}
          onChange={(marketValue) => onChange({ ...filters, marketValue })}
          formatInput={formatMarketValueFilterInput}
          parseBound={parseMarketValueFilterBound}
          minPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MIN)}
          maxPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MAX)}
        />
        <RangeField
          label="FSYP"
          range={filters.points}
          onChange={(points) => onChange({ ...filters, points })}
          formatInput={formatStatFilterInput}
          parseBound={parseStatFilterBound}
        />
        <RangeField
          label="Form"
          range={filters.form}
          onChange={(form) => onChange({ ...filters, form })}
          formatInput={formatStatFilterInput}
          parseBound={parseStatFilterBound}
        />

        <fieldset className="market-filter-availability">
          <legend>Availability</legend>
          <div className="market-filter-chips">
            {AVAILABILITY_OPTIONS.map((option) => {
              const active = filters.availability.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`market-filter-chip${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleAvailability(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
