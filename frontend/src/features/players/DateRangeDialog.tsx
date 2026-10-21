import { useId, useState } from "react";
import { DayPicker } from "react-day-picker";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FieldDescription, FieldError, FieldLabel, Input } from "../../components/ui/Fields";
import "react-day-picker/style.css";
import "./DateRangeDialog.css";

function localDate(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")].join("-");
}

/** Mounted for each editing session; cancel never changes the applied query. */
export function DateRangeDialog({ from, to, onClose, onApply }: {
  from: string; to: string; onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const fieldId = useId();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [days, setDays] = useState("21");
  const invalid = draftFrom !== "" && draftTo !== "" && draftFrom > draftTo;
  const valid = draftFrom !== "" && draftTo !== "" && !invalid;
  const daysNumber = Number(days);
  const validDays = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 400;
  const selected = draftFrom ? {
    from: new Date(draftFrom + "T12:00:00"),
    to: draftTo ? new Date(draftTo + "T12:00:00") : undefined,
  } : undefined;
  return (
    <Dialog open title="Custom value period" onClose={onClose}
      description="Choose both dates, then apply the range. Cancel keeps your current period."
      footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={!valid} onClick={() => onApply(draftFrom, draftTo)}>Apply range</Button>
    </>}>
      <div className="fb-date-fields">
        <Field>
          <FieldLabel htmlFor={`${fieldId}-from`}>From</FieldLabel>
          <Input id={`${fieldId}-from`} type="date" value={draftFrom}
            aria-invalid={invalid || undefined} aria-describedby={invalid ? `${fieldId}-error` : undefined}
            onChange={(event) => setDraftFrom(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-to`}>To</FieldLabel>
          <Input id={`${fieldId}-to`} type="date" value={draftTo}
            aria-invalid={invalid || undefined} aria-describedby={invalid ? `${fieldId}-error` : undefined}
            onChange={(event) => setDraftTo(event.target.value)} />
        </Field>
      </div>
      {invalid ? <FieldError id={`${fieldId}-error`}>
        Choose an end date on or after the start date.
      </FieldError> : null}
      <DayPicker className="fb-calendar" mode="range" weekStartsOn={1} selected={selected}
        defaultMonth={selected?.from} onSelect={(range) => {
          setDraftFrom(range?.from ? localDate(range.from) : "");
          setDraftTo(range?.to ? localDate(range.to) : "");
        }} />
      <div className="fb-date-shortcut">
        <Field>
          <FieldLabel htmlFor={`${fieldId}-days`}>Last days</FieldLabel>
          <FieldDescription id={`${fieldId}-days-hint`}>Choose between 1 and 400 days.</FieldDescription>
          <Input id={`${fieldId}-days`} type="number" min={1} max={400} value={days}
            aria-describedby={`${fieldId}-days-hint`}
            aria-invalid={(!validDays && days !== "") || undefined}
            onChange={(event) => setDays(event.target.value)} />
        </Field>
        <Button variant="outline" shape="square" disabled={!validDays} onClick={() => {
          const end = new Date();
          const start = new Date(end);
          start.setDate(end.getDate() - daysNumber);
          setDraftFrom(localDate(start)); setDraftTo(localDate(end));
        }}>Use last days</Button>
      </div>
    </Dialog>
  );
}
