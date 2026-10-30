import { useMemo, useState, type ReactNode } from "react";
import { clubMediaFromFixture } from "../../api/clubMedia";
import { BadgeImage } from "../../components/BadgeImage";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { Slider } from "../../components/ui/Slider";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/ToggleGroup";
import { AVAILABILITY_FILTER_OPTIONS } from "../market/MarketFilterFields";
import { POSITION_FILTER_OPTIONS } from "../market/positions";
import {
  SQUAD_FORM_OPTIONS,
  STARTER_PROBABILITY_STEP,
  activeSquadFilterCount,
  applySquadFilters,
  cloneSquadFilters,
  createEmptySquadFilters,
  squadClubOptions,
  squadPointsBounds,
  type SquadFilterPlayer,
  type SquadFilters,
  type SquadNumericRange,
} from "./squadFilters";
import "./SquadFilterDialog.css";

type SquadFilterDialogProps = {
  open: boolean;
  filters: SquadFilters;
  players: readonly SquadFilterPlayer[];
  pending: boolean;
  onClose: () => void;
  onApply: (filters: SquadFilters) => void;
  finalFocus?: () => HTMLElement | false;
};

type Option = { value: string; label: string };

const POSITION_OPTIONS: readonly Option[] = POSITION_FILTER_OPTIONS.map((option) => ({
  value: String(option.id), label: option.label,
}));
const FORM_OPTIONS: readonly Option[] = SQUAD_FORM_OPTIONS.map((form) => ({
  value: form, label: form,
}));

/** Draft editor for the lineup squad. Apply commits; Cancel leaves the list unchanged. */
export function SquadFilterDialog({
  open, filters, players, pending, onClose, onApply, finalFocus,
}: SquadFilterDialogProps) {
  const [draft, setDraft] = useState<SquadFilters>(() => cloneSquadFilters(filters));
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(cloneSquadFilters(filters));
      setSession((current) => current + 1);
    }
  }
  const clubs = useMemo(() => squadClubOptions(players), [players]);
  const bounds = useMemo(() => squadPointsBounds(players), [players]);
  const matches = applySquadFilters(players, draft, pending).length;

  return (
    <Dialog
      open={open}
      layout="sheet"
      className="squad-filter-dialog"
      title="Filter squad"
      description="Show players that match every condition you select."
      onClose={onClose}
      finalFocus={finalFocus}
      footer={<>
        <Button shape="square" variant="outline" className="squad-filter-reset"
          disabled={activeSquadFilterCount(draft) === 0}
          onClick={() => setDraft(createEmptySquadFilters())}>
          Clear filters
        </Button>
        <Button shape="square" variant="outline" onClick={onClose}>Cancel</Button>
        <Button shape="square" onClick={() => onApply(cloneSquadFilters(draft))}>
          {`Show ${matches} ${matches === 1 ? "player" : "players"}`}
        </Button>
      </>}
    >
      <div className="squad-filter-fields" key={session}>
        <FilterGroup label="Position" defaultOpen
          summary={selectionSummary(POSITION_OPTIONS, new Set([...draft.positions].map(String)))}>
          <OptionToggles options={POSITION_OPTIONS}
            selected={[...draft.positions].map(String)}
            onChange={(values) => setDraft({ ...draft, positions: new Set(values.map(Number)) })} />
        </FilterGroup>
        <FilterGroup label="FSYP" summary={pointsSummary(draft.points)}>
          <PointsRange bounds={bounds} range={draft.points}
            onChange={(points) => setDraft({ ...draft, points })} />
        </FilterGroup>
        <FilterGroup label="Club" summary={selectionSummary(
          clubs.map((club) => ({ value: club, label: club })), draft.clubs,
        )}>
          <ClubChecklist clubs={clubs} selected={draft.clubs}
            onChange={(next) => setDraft({ ...draft, clubs: next })} />
        </FilterGroup>
        <FilterGroup label="Start probability" summary={draft.minStarterProbability > 0
          ? `At least ${draft.minStarterProbability}%` : "Any"}>
          <StarterProbabilityField players={players} value={draft.minStarterProbability}
            onChange={(minStarterProbability) => setDraft({ ...draft, minStarterProbability })} />
        </FilterGroup>
        <FilterGroup label="Form" summary={selectionSummary(FORM_OPTIONS, draft.forms)}>
          <FormScale selected={draft.forms}
            onChange={(forms) => setDraft({ ...draft, forms })} />
        </FilterGroup>
        <FilterGroup label="Availability"
          summary={selectionSummary(AVAILABILITY_FILTER_OPTIONS, draft.availability)}>
          <AvailabilityScale selected={[...draft.availability]}
            onChange={(values) => setDraft({
              ...draft,
              availability: new Set(AVAILABILITY_FILTER_OPTIONS
                .filter((option) => values.includes(option.value))
                .map((option) => option.value)),
            })} />
        </FilterGroup>
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

const FORM_BANDS = [
  { label: "Poor", tone: "poor", options: ["Very poor", "Poor"] },
  { label: "Average", tone: "average", options: ["Average"] },
  { label: "Good", tone: "good", options: ["Good", "Very good"] },
] as const;

function FormScale({ selected, onChange }: {
  selected: ReadonlySet<string>;
  onChange: (forms: Set<string>) => void;
}) {
  return (
    <div className="squad-form-scale">
      {FORM_BANDS.map((band) => (
        <div key={band.label} className="squad-form-band" data-tone={band.tone}
          data-options={band.options.length}>
          <span className="squad-form-band-label" id={`squad-form-${band.tone}`}>{band.label}</span>
          <ToggleGroup multiple aria-labelledby={`squad-form-${band.tone}`}
            value={band.options.filter((option) => selected.has(option))}
            onValueChange={(values) => {
              const next = new Set(selected);
              for (const option of band.options) next.delete(option);
              for (const value of values) next.add(String(value));
              onChange(next);
            }}>
            {band.options.map((option) => (
              <ToggleGroupItem key={option} value={option}>{option}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
    </div>
  );
}

function AvailabilityScale({ selected, onChange }: {
  selected: readonly string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <ToggleGroup multiple className="squad-availability" value={selected}
      onValueChange={(values) => onChange(values.map(String))}>
      {AVAILABILITY_FILTER_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} data-tone={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function OptionToggles({ options, selected, onChange }: {
  options: readonly Option[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <ToggleGroup multiple value={selected}
      onValueChange={(values) => onChange(values.map(String))}>
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function PointsRange({ bounds, range, onChange }: {
  bounds: SquadNumericRange | null;
  range: SquadNumericRange;
  onChange: (range: SquadNumericRange) => void;
}) {
  if (bounds?.min == null || bounds.max == null || bounds.min === bounds.max) {
    return <p className="squad-filter-note">Season points are not available for a range yet.</p>;
  }
  const { min, max } = bounds;
  const low = clamp(range.min ?? min, min, max);
  const high = clamp(range.max ?? max, low, max);
  return (
    <div className="squad-filter-slider">
      <p className="squad-filter-slider-value" aria-live="polite">{`${low} – ${high} pts`}</p>
      <Slider thumbLabels={["Minimum FSYP", "Maximum FSYP"]} min={min} max={max} step={1}
        value={[low, high]}
        onValueChange={(value) => {
          if (!Array.isArray(value)) return;
          const [nextLow, nextHigh] = value as readonly number[];
          onChange({
            min: nextLow === min ? null : nextLow,
            max: nextHigh === max ? null : nextHigh,
          });
        }} />
      <div className="squad-filter-slider-scale" aria-hidden="true">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function ClubChecklist({ clubs, selected, onChange }: {
  clubs: readonly string[];
  selected: ReadonlySet<string>;
  onChange: (clubs: Set<string>) => void;
}) {
  if (clubs.length === 0) {
    return <p className="squad-filter-note">No club names are available yet.</p>;
  }
  return (
    <div className="squad-filter-clubs">
      {clubs.map((club) => (
        <label key={club} className="squad-filter-club">
          <Checkbox checked={selected.has(club)} onCheckedChange={(checked) => {
            const next = new Set(selected);
            if (checked) next.add(club);
            else next.delete(club);
            onChange(next);
          }} />
          <span className="squad-filter-club-crest">
            <BadgeImage media={clubMediaFromFixture(club)} fallback={clubInitials(club)} />
          </span>
          <span className="squad-filter-club-name">{club}</span>
        </label>
      ))}
    </div>
  );
}

function StarterProbabilityField({ players, value, onChange }: {
  players: readonly SquadFilterPlayer[];
  value: number;
  onChange: (value: number) => void;
}) {
  const known = players.filter((player) => player.starterProbability != null);
  const qualifying = known.filter((player) => (player.starterProbability ?? 0) >= value).length;
  return (
    <div className="squad-filter-slider">
      <p className="squad-filter-probability">
        <span className="squad-filter-probability-label">Minimum start probability</span>
        <span className="squad-filter-slider-value">{value > 0 ? `${value}%+` : "Any"}</span>
      </p>
      <Slider thumbLabels={["Minimum start probability"]} min={0} max={100}
        step={STARTER_PROBABILITY_STEP} largeStep={25} value={value}
        onValueChange={(next) => { if (typeof next === "number") onChange(next); }} />
      <div className="squad-filter-slider-scale" aria-hidden="true">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
      <p className="squad-filter-note" aria-live="polite">
        {known.length === 0 ? "Start probabilities are still loading."
          : `${qualifying} of ${known.length} squad players have at least ${value}%.`}
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function selectionSummary(options: readonly Option[], selected: ReadonlySet<string>): string {
  const labels = options.filter((option) => selected.has(option.value))
    .map((option) => option.label);
  if (labels.length === 0) return "Any";
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
}

function pointsSummary(range: SquadNumericRange): string {
  if (range.min == null && range.max == null) return "Any";
  if (range.min != null && range.max != null) return `${range.min}–${range.max} pts`;
  return range.min != null ? `${range.min}+ pts` : `Up to ${range.max} pts`;
}

function clubInitials(club: string): string {
  return club.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
