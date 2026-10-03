import type { KeyboardEvent } from "react";

import { formatIntegerAmount } from "../api/format";

import "./NumericCounterField.css";

type NumericCounterFieldProps = {
  id?: string;
  className?: string;
  inputClassName?: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  formatInput: (raw: string) => string;
  parseValue: (raw: string) => number | null;
  stepValue: (current: number | null, deltaSteps: number) => number | null;
  onValueChange: (raw: string) => void;
  onStepped?: (next: number | null) => void;
  onBlur?: () => void;
};

export function NumericCounterField({
  id,
  className = "",
  inputClassName = "",
  value,
  disabled = false,
  placeholder,
  ariaLabel,
  formatInput,
  parseValue,
  stepValue,
  onValueChange,
  onStepped,
  onBlur,
}: NumericCounterFieldProps) {
  const applyStep = (deltaSteps: number) => {
    if (disabled) return;
    const next = stepValue(parseValue(value), deltaSteps);
    onValueChange(next != null ? formatIntegerAmount(next) : "");
    onStepped?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applyStep(1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      applyStep(-1);
    }
  };

  return (
    <div className={`numeric-counter${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className="numeric-counter-btn"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={disabled}
        onClick={() => applyStep(-1)}
      >
        −
      </button>
      <input
        id={id}
        className={`numeric-counter-input${inputClassName ? ` ${inputClassName}` : ""}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onValueChange(formatInput(event.target.value))}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="numeric-counter-btn"
        aria-label={`Increase ${ariaLabel}`}
        disabled={disabled}
        onClick={() => applyStep(1)}
      >
        +
      </button>
    </div>
  );
}
