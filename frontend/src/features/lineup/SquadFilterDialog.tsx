import { useId, useState, type ReactNode } from "react";
import { clubMediaFromFixture } from "../../api/clubMedia";
import { BadgeImage } from "../../components/BadgeImage";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { AVAILABILITY_FILTER_OPTIONS } from "../market/MarketFilterFields";
import { POSITION_FILTER_OPTIONS } from "../market/positions";
import {
  SQUAD_FORM_OPTIONS,
  cloneSquadFilters,
  createEmptySquadFilters,
  squadRangeInvalid,
  type SquadFilters,
  type SquadNumericRange,
} from "./squadFilters";
import "./SquadFilterDialog.css";

type SquadFilterDialogProps = {
  open: boolean;
  filters: SquadFilters;
  clubs: readonly string[];
  onClose: () => void;
  onApply: (filters: SquadFilters) => void;
  finalFocus?: () => HTMLElement | false;
};

/** Draft editor for the lineup squad. Apply commits; Cancel leaves the list unchanged. */
export function SquadFilterDialog({
  open, filters, clubs, onClose, onApply, finalFocus,
}: SquadFilterDialogProps) {
  const [draft, setDraft] = useState<SquadFilters>(() => cloneSquadFilters(filters));
  const [session, setSession] = useState(0);
  const pointsError = useId();
  const probabilityError = useId();
  const pointsInvalid = squadRangeInvalid(draft.points);
  const probabilityInvalid = squadRangeInvalid(draft.starterProbability);
  const invalid = pointsInvalid || probabilityInvalid;

  return (
    <Dialog
      open={open}
      layout="sheet"
      className="squad-filter-dialog"
      title="Filter squad"
      description="Show players that match every condition you select."
      onClose={onClose}
      onOpenChangeComplete={(next) => {
        if (next) {
          setDraft(cloneSquadFilters(filters));
          setSession((current) => current + 1);
        }
      }}
      finalFocus={finalFocus}
      footer={<>
        <Button shape="square" variant="outline" onClick={onClose}>Cancel</Button>
        <Button shape="square" disabled={invalid} onClick={() => onApply(cloneSquadFilters(draft))}>
          Apply filters
        </Button>
      </>}
    >
      <div className="squad-filter-fields" key={session}>
        <FilterGroup label="Position" summary={selectionSummary(draft.positions)} defaultOpen>
          <ChipSet options={POSITION_FILTER_OPTIONS.map((option) => ({
            id: String(option.id), label: option.label,
          }))} selected={new Set([...draft.positions].map(String))}
          onToggle={(id) => setDraft({
            ...draft, positions: toggleNumber(draft.positions, Number(id)),
          })} />
        </FilterGroup>
        <RangeGroup label="FSYP" hint="Season Fantasy points. Leave a box empty for no limit."
          range={draft.points} invalid={pointsInvalid} errorId={pointsError}
          onChange={(points) => setDraft({ ...draft, points })} />
        <FilterGroup label="Club" summary={selectionSummary(draft.clubs)}>
          {clubs.length === 0 ? (
            <p className="squad-filter-note">No club names are available yet.</p>
          ) : (
            <ChipSet className="squad-filter-clubs"
              options={clubs.map((club) => ({
                id: club,
                label: club,
                leading: <span className="squad-filter-club-crest">
                  <BadgeImage media={clubMediaFromFixture(club)} fallback={clubInitials(club)} />
                </span>,
              }))}
              selected={draft.clubs}
              onToggle={(club) => setDraft({ ...draft, clubs: toggleValue(draft.clubs, club) })} />
          )}
        </FilterGroup>
        <RangeGroup label="Start probability"
          hint="Percent from 0 to 100. Leave a box empty for no limit."
          range={draft.starterProbability} invalid={probabilityInvalid} errorId={probabilityError}
          min={0} max={100}
          onChange={(starterProbability) => setDraft({ ...draft, starterProbability })} />
        <FilterGroup label="Form" summary={selectionSummary(draft.forms)}>
          <ChipSet options={SQUAD_FORM_OPTIONS.map((form) => ({ id: form, label: form }))}
            selected={draft.forms}
            onToggle={(form) => setDraft({ ...draft, forms: toggleValue(draft.forms, form) })} />
        </FilterGroup>
        <FilterGroup label="Availability" summary={selectionSummary(draft.availability)}>
          <ChipSet options={AVAILABILITY_FILTER_OPTIONS.map((option) => ({
            id: option.value, label: option.label,
          }))} selected={draft.availability}
          onToggle={(value) => setDraft({
            ...draft, availability: toggleValue(draft.availability, value),
          })} />
        </FilterGroup>
        <Button shape="square" variant="outline"
          onClick={() => setDraft(createEmptySquadFilters())}>
          Clear filters
        </Button>
      </div>
    </Dialog>
  );
}

function FilterGroup({ label, summary, children, defaultOpen = false }: {
  label: string;
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <details className="squad-filter-disclosure" open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span>{label}</span>
        <span className="squad-filter-disclosure-value">{summary}</span>
        <span className="squad-filter-disclosure-chevron" aria-hidden="true">⌄</span>
      </summary>
      <fieldset className="squad-filter-group">
        <legend className="squad-filter-sr-only">{label}</legend>
        {children}
      </fieldset>
    </details>
  );
}

function ChipSet<T extends string>({ options, selected, onToggle, className = "" }: {
  options: readonly { id: T; label: string; leading?: ReactNode }[];
  selected: ReadonlySet<T>;
  onToggle: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`squad-filter-chips${className ? ` ${className}` : ""}`}>
      {options.map((option) => {
        const active = selected.has(option.id);
        return (
          <button key={option.id} type="button"
            className={active ? "squad-filter-chip is-active" : "squad-filter-chip"}
            aria-pressed={active} onClick={() => onToggle(option.id)}>
            {option.leading}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeGroup({ label, hint, range, invalid, errorId, min, max, onChange }: {
  label: string;
  hint: string;
  range: SquadNumericRange;
  invalid: boolean;
  errorId: string;
  min?: number;
  max?: number;
  onChange: (range: SquadNumericRange) => void;
}) {
  return (
    <FilterGroup label={label} summary={rangeSummary(range, invalid)}>
      <p className="squad-filter-note" id={`${errorId}-hint`}>{hint}</p>
      <div className="squad-filter-range">
        <BoundField label="Minimum" value={range.min} min={min} max={max} invalid={invalid}
          describedBy={invalid ? errorId : `${errorId}-hint`}
          onChange={(next) => onChange({ ...range, min: next })} />
        <BoundField label="Maximum" value={range.max} min={min} max={max} invalid={invalid}
          describedBy={invalid ? errorId : `${errorId}-hint`}
          onChange={(next) => onChange({ ...range, max: next })} />
      </div>
      {invalid ? <p className="squad-filter-error" id={errorId} role="alert">
        Minimum is greater than maximum.
      </p> : null}
    </FilterGroup>
  );
}

function BoundField({ label, value, min, max, invalid, describedBy, onChange }: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  invalid: boolean;
  describedBy: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="squad-filter-bound">
      {label}
      <input type="number" inputMode="numeric" min={min} max={max} step={1}
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={value ?? ""}
        onChange={(event) => onChange(parseBound(event.target.value, min, max))} />
    </label>
  );
}

function parseBound(raw: string, min?: number, max?: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value)) return null;
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  return value;
}

function toggleNumber(selected: ReadonlySet<number>, value: number): Set<number> {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function toggleValue<T>(selected: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function selectionSummary(selected: ReadonlySet<unknown>): string {
  return selected.size === 0 ? "Any" : `${selected.size} selected`;
}

function rangeSummary(range: SquadNumericRange, invalid: boolean): string {
  if (invalid) return "Check range";
  if (range.min == null && range.max == null) return "Any";
  if (range.min != null && range.max != null) return `${range.min}–${range.max}`;
  return range.min != null ? `From ${range.min}` : `Up to ${range.max}`;
}

function clubInitials(club: string): string {
  return club.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
