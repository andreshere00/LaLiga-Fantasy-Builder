import { useEffect, useState } from "react";

import { formatIntegerAmount } from "../../api/format";
import { NumericCounterField } from "../../components/NumericCounterField";
import {
  formatMarketValueFilterInput,
  formatStatFilterInput,
  MARKET_VALUE_FILTER_MAX,
  MARKET_VALUE_FILTER_MIN,
  MARKET_VALUE_FILTER_STEP,
  parseMarketValueFilterBound,
  parseStatFilterBound,
  stepMarketValueFilterBound,
  stepStatFilterBound,
} from "./marketFilterInputs";
import type { Availability } from "./model/availability";
import type { NumericRange } from "./marketFilters";
import { POSITION_FILTER_OPTIONS } from "./positions";

export const AVAILABILITY_FILTER_OPTIONS: { value: Availability; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "questionable", label: "Questionable" },
  { value: "unavailable", label: "Unavailable" },
];

type FilterRangeFieldProps = {
  range: NumericRange;
  onChange: (next: NumericRange) => void;
  formatInput: (raw: string) => string;
  parseBound: (raw: string) => number | null;
  stepBound: (current: number | null, deltaSteps: number) => number | null;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  hint?: string;
};

export function FilterRangeField({
  range,
  onChange,
  formatInput,
  parseBound,
  stepBound,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  hint,
}: FilterRangeFieldProps) {
  const [rawMin, setRawMin] = useState("");
  const [rawMax, setRawMax] = useState("");

  useEffect(() => {
    setRawMin(range.min != null ? formatIntegerAmount(range.min) : "");
  }, [range.min]);

  useEffect(() => {
    setRawMax(range.max != null ? formatIntegerAmount(range.max) : "");
  }, [range.max]);

  const commit = (key: "min" | "max", raw: string, setRaw: (value: string) => void) => {
    const parsed = parseBound(raw);
    onChange({ ...range, [key]: parsed });
    setRaw(parsed != null ? formatIntegerAmount(parsed) : "");
  };

  return (
    <div className="market-column-filter-range">
      {hint ? <p className="market-filter-range-hint">{hint}</p> : null}
      <div className="market-filter-range-inputs">
        <label className="market-filter-range-label">
          Min
          <NumericCounterField
            ariaLabel="Minimum"
            inputClassName="market-filter-range-input"
            value={rawMin}
            placeholder={minPlaceholder}
            formatInput={formatInput}
            parseValue={parseBound}
            stepValue={stepBound}
            onValueChange={setRawMin}
            onStepped={(next) => onChange({ ...range, min: next })}
            onBlur={() => commit("min", rawMin, setRawMin)}
          />
        </label>
        <label className="market-filter-range-label">
          Max
          <NumericCounterField
            ariaLabel="Maximum"
            inputClassName="market-filter-range-input"
            value={rawMax}
            placeholder={maxPlaceholder}
            formatInput={formatInput}
            parseValue={parseBound}
            stepValue={stepBound}
            onValueChange={setRawMax}
            onStepped={(next) => onChange({ ...range, max: next })}
            onBlur={() => commit("max", rawMax, setRawMax)}
          />
        </label>
      </div>
    </div>
  );
}

export function FilterMarketValueRange({
  range,
  onChange,
}: {
  range: NumericRange;
  onChange: (next: NumericRange) => void;
}) {
  return (
    <FilterRangeField
      range={range}
      onChange={onChange}
      formatInput={formatMarketValueFilterInput}
      parseBound={parseMarketValueFilterBound}
      stepBound={stepMarketValueFilterBound}
      minPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MIN)}
      maxPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MAX)}
      hint={`Whole euros from ${formatIntegerAmount(MARKET_VALUE_FILTER_MIN)} to ${formatIntegerAmount(MARKET_VALUE_FILTER_MAX)}. Use ± to adjust by ${formatIntegerAmount(MARKET_VALUE_FILTER_STEP)}.`}
    />
  );
}

export function FilterStatRange({
  range,
  onChange,
}: {
  range: NumericRange;
  onChange: (next: NumericRange) => void;
}) {
  return (
    <FilterRangeField
      range={range}
      onChange={onChange}
      formatInput={formatStatFilterInput}
      parseBound={parseStatFilterBound}
      stepBound={stepStatFilterBound}
    />
  );
}

export function FilterPositionChips({
  selected,
  onChange,
}: {
  selected: ReadonlySet<number>;
  onChange: (next: ReadonlySet<number>) => void;
}) {
  const toggle = (positionId: number) => {
    const next = new Set(selected);
    if (next.has(positionId)) next.delete(positionId);
    else next.add(positionId);
    onChange(next);
  };

  return (
    <div className="market-filter-chips market-column-filter-chips market-column-filter-chips-position">
      {POSITION_FILTER_OPTIONS.map((option) => {
        const active = selected.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={`market-filter-chip${active ? " is-active" : ""}`}
            aria-pressed={active}
            title={option.label}
            onClick={() => toggle(option.id)}
          >
            {option.abbrev}
          </button>
        );
      })}
    </div>
  );
}

export function FilterAvailabilityChips({
  selected,
  onChange,
}: {
  selected: ReadonlySet<Availability>;
  onChange: (next: ReadonlySet<Availability>) => void;
}) {
  const toggle = (value: Availability) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div className="market-filter-chips market-column-filter-chips">
      {AVAILABILITY_FILTER_OPTIONS.map((option) => {
        const active = selected.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`market-filter-chip${active ? " is-active" : ""}`}
            aria-pressed={active}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="market-column-filter-text">
      {label}
      <input
        type="search"
        className="market-filter-range-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function FilterSellerSelect({
  sellers,
  onPick,
}: {
  sellers: readonly string[];
  onPick: (seller: string) => void;
}) {
  return (
    <label className="market-column-filter-text">
      Pick a seller
      <select
        className="market-filter-select"
        value=""
        onChange={(event) => {
          if (event.target.value) onPick(event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {sellers.map((seller) => (
          <option key={seller} value={seller}>
            {seller}
          </option>
        ))}
      </select>
    </label>
  );
}
