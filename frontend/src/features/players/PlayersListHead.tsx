import { useEffect, useId, useRef, useState } from "react";

import filterIconUrl from "../../assets/button_filter.svg";
import { clearPlayersColumnFilter } from "./playersColumnFilters";
import type { PlayersColumnHeading, PlayersColumnKey } from "./playersColumnHeadings";
import { playersColumnBaseLabel } from "./playersColumnHeadings";
import { PlayersColumnFilterPopover } from "./PlayersColumnFilterPopover";
import type { PlayersFilters } from "./playersSearchParams";

type PlayersListHeadProps = {
  headings: Record<PlayersColumnKey, PlayersColumnHeading>;
  filters: PlayersFilters;
  owners: readonly string[];
  onFiltersChange: (patch: Partial<PlayersFilters>) => void;
};

const COLUMN_ORDER: PlayersColumnKey[] = [
  "name",
  "team",
  "fsyp",
  "form",
  "marketValue",
  "owner",
  "availability",
  "position",
];

type HeadCellProps = {
  column: PlayersColumnKey;
  heading: PlayersColumnHeading;
  className?: string;
  filters: PlayersFilters;
  owners: readonly string[];
  openColumn: PlayersColumnKey | null;
  onOpenColumn: (column: PlayersColumnKey | null) => void;
  onFiltersChange: (patch: Partial<PlayersFilters>) => void;
};

function focusFirstPopoverControl(panel: HTMLElement | null): void {
  if (!panel) return;
  const target = panel.querySelector<HTMLElement>(
    "input, select, textarea, button:not(.market-head-filter)",
  );
  target?.focus();
}

function HeadCell({
  column,
  heading,
  className,
  filters,
  owners,
  openColumn,
  onOpenColumn,
  onFiltersChange,
}: HeadCellProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const popoverId = useId();
  const open = openColumn === column;
  const title = playersColumnBaseLabel(column);

  useEffect(() => {
    if (!open) return;
    focusFirstPopoverControl(popoverRef.current);
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      onOpenColumn(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenColumn(null);
      filterButtonRef.current?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenColumn]);

  const applyFilters = (next: PlayersFilters) => {
    onFiltersChange(next);
  };

  return (
    <span ref={wrapRef} className={`market-head-cell${className ? ` ${className}` : ""}`}>
      <span className="market-head-label">{heading.label}</span>
      <button
        ref={filterButtonRef}
        id={buttonId}
        type="button"
        className={`market-head-filter${heading.filtered ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        aria-label={`Filter ${title}`}
        onClick={() => onOpenColumn(open ? null : column)}
      >
        <img src={filterIconUrl} alt="" aria-hidden="true" className="market-head-filter-icon" />
      </button>
      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          className="market-column-filter-popover-wrap"
          role="dialog"
          aria-labelledby={buttonId}
        >
          <PlayersColumnFilterPopover
            column={column}
            filters={filters}
            owners={owners}
            onChange={applyFilters}
            onClearColumn={() => {
              applyFilters(clearPlayersColumnFilter(filters, column));
              onOpenColumn(null);
              filterButtonRef.current?.focus();
            }}
          />
        </div>
      ) : null}
    </span>
  );
}

export function PlayersListHead({
  headings,
  filters,
  owners,
  onFiltersChange,
}: PlayersListHeadProps) {
  const [openColumn, setOpenColumn] = useState<PlayersColumnKey | null>(null);

  const patchFilters = (patch: Partial<PlayersFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <li
      className={[
        "market-row market-head market-head-row players-head-row",
        openColumn ? "is-filter-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="market-head-cell">Player</span>
      {COLUMN_ORDER.map((column) => (
        <HeadCell
          key={column}
          column={column}
          heading={headings[column]}
          className={`market-head-cell-${column}`}
          filters={filters}
          owners={owners}
          openColumn={openColumn}
          onOpenColumn={setOpenColumn}
          onFiltersChange={patchFilters}
        />
      ))}
      <span className="market-head-cell">Actions</span>
    </li>
  );
}
