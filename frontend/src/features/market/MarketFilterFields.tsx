import { t, useTranslation } from "../../i18n";
import { useEffect, useId, useState } from "react";
import { NativeSelect } from "../../components/ui/Fields";

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
  minPlaceholder = t("Min"),
  maxPlaceholder = t("Max"),
  hint,
}: FilterRangeFieldProps) {
  useTranslation();
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
          {t("Min")}<NumericCounterField
            ariaLabel={t("Minimum")}
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
          {t("Max")}<NumericCounterField
            ariaLabel={t("Maximum")}
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
  useTranslation();
  return (
    <FilterRangeField
      range={range}
      onChange={onChange}
      formatInput={formatMarketValueFilterInput}
      parseBound={parseMarketValueFilterBound}
      stepBound={stepMarketValueFilterBound}
      minPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MIN)}
      maxPlaceholder={formatIntegerAmount(MARKET_VALUE_FILTER_MAX)}
      hint={t("Whole euros from {{0}} to {{1}}. Use ± to adjust by {{2}}.", { 0: formatIntegerAmount(MARKET_VALUE_FILTER_MIN), 1: formatIntegerAmount(MARKET_VALUE_FILTER_MAX), 2: formatIntegerAmount(MARKET_VALUE_FILTER_STEP) })}
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
  useTranslation();
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
            title={t(option.label)}
            onClick={() => toggle(option.id)}
          >
            {t(option.abbrev)}
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
  useTranslation();
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
            {t(option.label)}
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
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: readonly string[];
}) {
  useTranslation();
  const listId = useId();
  return (
    <label className="market-column-filter-text">
      {t(label)}
      <input
        type="search"
        className="market-filter-range-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t(placeholder)}
        list={suggestions.length ? listId : undefined}
      />
      <datalist id={listId}>
        {[...new Set(suggestions)].map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </label>
  );
}

export function FilterSellerSelect({
  sellers,
  onPick,
  value = "",
}: {
  sellers: readonly string[];
  onPick: (seller: string) => void;
  value?: string;
}) {
  useTranslation();
  return (
    <label className="market-column-filter-text">
      {t("Pick a seller")}<NativeSelect
        className="market-filter-select"
        value={sellers.includes(value) ? value : ""}
        onChange={(event) => onPick(event.target.value)}
      >
        <option value="">{t("Choose…")}</option>
        {sellers.map((seller) => (
          <option key={seller} value={seller}>
            {seller}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
