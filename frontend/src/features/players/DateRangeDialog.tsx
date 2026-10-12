import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Fields";
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
    <Dialog open title="Custom value period" onClose={onClose} footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={!valid} onClick={() => onApply(draftFrom, draftTo)}>Apply range</Button>
    </>}>
      <div className="fb-date-fields">
        <label>From<Input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} /></label>
        <label>To<Input type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} /></label>
      </div>
      {invalid ? <p role="alert">From must be on or before to.</p> : null}
      <DayPicker className="fb-calendar" mode="range" weekStartsOn={1} selected={selected}
        defaultMonth={selected?.from} onSelect={(range) => {
          setDraftFrom(range?.from ? localDate(range.from) : "");
          setDraftTo(range?.to ? localDate(range.to) : "");
        }} />
      <div className="fb-date-shortcut">
        <label>Last days<Input type="number" min={1} max={400} value={days}
          onChange={(event) => setDays(event.target.value)} /></label>
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
