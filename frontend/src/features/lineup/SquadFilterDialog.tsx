import { t, useTranslation } from "../../i18n";
import { useId, useMemo, useState, type ReactNode } from "react";
import { clubMediaFromFixture } from "../../api/clubMedia";
import { BadgeImage } from "../../components/BadgeImage";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { Help } from "../../components/ui/Help";
import { Slider } from "../../components/ui/Slider";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/ToggleGroup";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { AVAILABILITY_FILTER_OPTIONS } from "../market/MarketFilterFields";
import {
  STARTER_PROBABILITY_STEP,
  activeSquadFilterCount,
  applySquadFilters,
  cloneSquadFilters,
  createEmptySquadFilters,
  squadClubOptions,
  squadPointsBounds,
  type SquadFilterKey,
  type SquadFilterPlayer,
  type SquadFilters,
  type SquadNumericRange,
} from "./squadFilters";
import {
  POSITION_OPTIONS,
  SQUAD_FILTER_LABELS,
  squadFilterActive,
  squadFilterValue,
  type FilterOption,
} from "./squadFilterSummary";
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

/** Phones keep the bottom sheet with collapsible groups; wider screens show every group. */
export const SQUAD_FILTER_COMPACT_QUERY = "(max-width: 700px)";

/**
 * Draft editor for the lineup squad. Apply commits; Cancel leaves the list unchanged.
 *
 * Phones get a bottom sheet with one open group at a time. Tablets and desktops get a
 * centered panel with every group visible, in two or three columns (see the CSS).
 */
export function SquadFilterDialog({
  open, filters, players, pending, onClose, onApply, finalFocus,
}: SquadFilterDialogProps) {
  useTranslation();
  const compact = useMediaQuery(SQUAD_FILTER_COMPACT_QUERY);
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
  const group = (key: SquadFilterKey, children: ReactNode, defaultOpen = false) => (
    <FilterGroup key={key} area={key} compact={compact} defaultOpen={defaultOpen}
      label={t(SQUAD_FILTER_LABELS[key])} summary={squadFilterValue(draft, key)}
      active={squadFilterActive(draft, key)}>
      {children}
    </FilterGroup>
  );

  return (
    <Dialog
      open={open}
      layout={compact ? "sheet" : "dialog"}
      className={"squad-filter-dialog squad-filter-dialog--" + (compact ? "compact" : "wide")}
      title={t("Filter squad")}
      description={t("Show players that match every condition you select.")}
      onClose={onClose}
      finalFocus={finalFocus}
      footer={<>
        <Button shape="square" variant="outline" className="squad-filter-reset"
          disabled={activeSquadFilterCount(draft) === 0}
          onClick={() => setDraft(createEmptySquadFilters())}>
          {t("Clear filters")}</Button>
        <Button shape="square" variant="outline" className="squad-filter-cancel"
          onClick={onClose}>{t("Cancel")}</Button>
        <Button shape="square" className="squad-filter-apply"
          onClick={() => onApply(cloneSquadFilters(draft))}>
          {t(matches === 1 ? "Show {{0}} player" : "Show {{0}} players", { 0: matches })}
        </Button>
      </>}
    >
      <div className="squad-filter-fields" key={session}>
        {group("positions", (
          <OptionToggles options={POSITION_OPTIONS} compact={compact}
            selected={[...draft.positions].map(String)}
            onChange={(values) => setDraft({ ...draft, positions: new Set(values.map(Number)) })} />
        ), true)}
        {group("points", (
          <PointsRange bounds={bounds} range={draft.points}
            onChange={(points) => setDraft({ ...draft, points })} />
        ))}
        {group("minStarterProbability", (
          <StarterProbabilityField players={players} value={draft.minStarterProbability}
            onChange={(minStarterProbability) => setDraft({ ...draft, minStarterProbability })} />
        ))}
        {group("forms", (
          <FormScale selected={draft.forms}
            onChange={(forms) => setDraft({ ...draft, forms })} />
        ))}
        {group("availability", (
          <AvailabilityScale selected={[...draft.availability]}
            onChange={(values) => setDraft({
              ...draft,
              availability: new Set(AVAILABILITY_FILTER_OPTIONS
                .filter((option) => values.includes(option.value))
                .map((option) => option.value)),
            })} />
        ))}
        {group("clubs", (
          <ClubChecklist clubs={clubs} selected={draft.clubs}
            onChange={(next) => setDraft({ ...draft, clubs: next })} />
        ))}
      </div>
    </Dialog>
  );
}

/** A collapsible group on phones; an always-open, titled section elsewhere. */
function FilterGroup({ label, summary, active, area, compact, children, defaultOpen = false }: {
  label: string;
  summary: string;
  active: boolean;
  area: SquadFilterKey;
  compact: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const headingId = useId();
  const fields = (
    <fieldset className="squad-filter-group">
      <legend className="squad-filter-sr-only">{label}</legend>
      {children}
    </fieldset>
  );
  if (!compact) {
    return (
      <section className="squad-filter-section" data-area={area} aria-labelledby={headingId}>
        <header className="squad-filter-section-heading">
          <h3 id={headingId}>{label}</h3>
          <span className="squad-filter-disclosure-value" data-active={active || undefined}>
            {summary}</span>
        </header>
        {fields}
      </section>
    );
  }
  return (
    <details className="squad-filter-disclosure" open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span>{label}</span>
        <span className="squad-filter-disclosure-value" data-active={active || undefined}>
          {summary}</span>
        <span className="squad-filter-disclosure-chevron" aria-hidden="true">⌄</span>
      </summary>
      {fields}
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
  useTranslation();
  return (
    <div className="squad-form-scale">
      {FORM_BANDS.map((band) => (
        <div key={band.label} className="squad-form-band" data-tone={band.tone}
          data-options={band.options.length}>
          <span className="squad-form-band-label" id={`squad-form-${band.tone}`}>{t(band.label)}</span>
          <ToggleGroup multiple aria-labelledby={`squad-form-${band.tone}`}
            value={band.options.filter((option) => selected.has(option))}
            onValueChange={(values) => {
              const next = new Set(selected);
              for (const option of band.options) next.delete(option);
              for (const value of values) next.add(String(value));
              onChange(next);
            }}>
            {band.options.map((option) => (
              <ToggleGroupItem key={option} value={option}>{t(option)}</ToggleGroupItem>
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
  useTranslation();
  return (
    <ToggleGroup multiple className="squad-availability" value={selected}
      onValueChange={(values) => onChange(values.map(String))}>
      {AVAILABILITY_FILTER_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} data-tone={option.value}>
          {t(option.label)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Multi-select toggles. On phones, options with a short label fit on one segmented row. */
function OptionToggles({ options, selected, onChange, compact = false }: {
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
  compact?: boolean;
}) {
  useTranslation();
  const segmented = compact && options.every((option) => option.short);
  return (
    <ToggleGroup multiple value={selected}
      className={segmented ? "squad-filter-segmented" : undefined}
      onValueChange={(values) => onChange(values.map(String))}>
      {options.map((option) => segmented ? (
        <Help key={option.value} content={t(option.label)}
          trigger={<ToggleGroupItem value={option.value} aria-label={t(option.label)} />}>
          {t(option.short ?? option.label)}
        </Help>
      ) : (
        <ToggleGroupItem key={option.value} value={option.value}>{t(option.label)}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function PointsRange({ bounds, range, onChange }: {
  bounds: SquadNumericRange | null;
  range: SquadNumericRange;
  onChange: (range: SquadNumericRange) => void;
}) {
  useTranslation();
  if (bounds?.min == null || bounds.max == null || bounds.min === bounds.max) {
    return <p className="squad-filter-note">{t("Season points are not available for a range yet.")}</p>;
  }
  const { min, max } = bounds;
  const low = clamp(range.min ?? min, min, max);
  const high = clamp(range.max ?? max, low, max);
  return (
    <div className="squad-filter-slider">
      <p className="squad-filter-slider-value" aria-live="polite">{t("{{0}} – {{1}} pts", { 0: low, 1: high })}</p>
      <Slider thumbLabels={[t("Minimum FSYP"), t("Maximum FSYP")]} min={min} max={max} step={1}
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
  useTranslation();
  if (clubs.length === 0) {
    return <p className="squad-filter-note">{t("No club names are available yet.")}</p>;
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
  useTranslation();
  const known = players.filter((player) => player.starterProbability != null);
  const qualifying = known.filter((player) => (player.starterProbability ?? 0) >= value).length;
  return (
    <div className="squad-filter-slider">
      <p className="squad-filter-probability">
        <span className="squad-filter-probability-label">{t("Minimum start probability")}</span>
        <span className="squad-filter-slider-value">{value > 0 ? `${value}%+` : t("Any")}</span>
      </p>
      <Slider thumbLabels={[t("Minimum start probability")]} min={0} max={100}
        step={STARTER_PROBABILITY_STEP} largeStep={25} value={value}
        onValueChange={(next) => { if (typeof next === "number") onChange(next); }} />
      <div className="squad-filter-slider-scale" aria-hidden="true">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
      <p className="squad-filter-note" aria-live="polite">
        {known.length === 0 ? t("Start probabilities are still loading.") : t("{{0}} of {{1}} squad players have at least {{2}}%.", { 0: qualifying, 1: known.length, 2: value })}
      </p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clubInitials(club: string): string {
  return club.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
