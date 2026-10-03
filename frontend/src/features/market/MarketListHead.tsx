import { useEffect, useId, useRef, useState } from "react";

import filterIconUrl from "../../assets/button_filter.svg";
import type { MarketColumnHeading, MarketColumnKey } from "./marketColumnHeadings";
import { marketColumnBaseLabel } from "./marketColumnHeadings";
import { MarketColumnFilterPopover } from "./MarketColumnFilterPopover";
import { clearMarketColumnFilter, isMarketColumnFilterable } from "./marketColumnFilters";
import type { MarketFilters } from "./marketFilters";

type MarketListHeadProps = {
  headings: Record<MarketColumnKey, MarketColumnHeading>;
  filters: MarketFilters;
  sellers: readonly string[];
  onFiltersChange: (filters: MarketFilters) => void;
};

const COLUMN_ORDER: MarketColumnKey[] = [
  "player",
  "position",
  "fsyp",
  "form",
  "marketValue",
  "availability",
  "sealEnd",
  "sellOptions",
];

type HeadCellProps = {
  column: MarketColumnKey;
  heading: MarketColumnHeading;
  className?: string;
  filters: MarketFilters;
  sellers: readonly string[];
  openColumn: MarketColumnKey | null;
  onOpenColumn: (column: MarketColumnKey | null) => void;
  onFiltersChange: (filters: MarketFilters) => void;
};

function HeadCell({
  column,
  heading,
  className,
  filters,
  sellers,
  openColumn,
  onOpenColumn,
  onFiltersChange,
}: HeadCellProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonId = useId();
  const popoverId = useId();
  const open = openColumn === column;
  const filterable = isMarketColumnFilterable(column);
  const title = marketColumnBaseLabel(column);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      onOpenColumn(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenColumn]);

  return (
    <span
      ref={wrapRef}
      className={`market-head-cell${className ? ` ${className}` : ""}`}
    >
      <span className="market-head-label">{title}</span>
      <button
        id={buttonId}
        type="button"
        className={`market-head-filter${heading.filtered ? " is-active" : ""}${!filterable ? " is-disabled" : ""}`}
        aria-expanded={filterable ? open : undefined}
        aria-controls={filterable ? popoverId : undefined}
        aria-haspopup={filterable ? "dialog" : undefined}
        disabled={!filterable}
        title={filterable ? `Filter ${title}` : `${title} cannot be filtered`}
        onClick={() => {
          if (!filterable) return;
          onOpenColumn(open ? null : column);
        }}
      >
        <img src={filterIconUrl} alt="" aria-hidden="true" className="market-head-filter-icon" />
      </button>
      {open && filterable ? (
        <div id={popoverId} className="market-column-filter-popover-wrap">
          <MarketColumnFilterPopover
            column={column}
            filters={filters}
            sellers={sellers}
            onChange={onFiltersChange}
            onClearColumn={() => {
              onFiltersChange(clearMarketColumnFilter(filters, column));
              onOpenColumn(null);
            }}
          />
        </div>
      ) : null}
    </span>
  );
}

export function MarketListHead({
  headings,
  filters,
  sellers,
  onFiltersChange,
}: MarketListHeadProps) {
  const [openColumn, setOpenColumn] = useState<MarketColumnKey | null>(null);

  return (
    <li className={`market-row market-head${openColumn ? " is-filter-open" : ""}`}>
      {COLUMN_ORDER.map((column) => (
        <HeadCell
          key={column}
          column={column}
          heading={headings[column]}
          className={`${column === "player" ? "market-head-player " : ""}market-head-cell-${column}`}
          filters={filters}
          sellers={sellers}
          openColumn={openColumn}
          onOpenColumn={setOpenColumn}
          onFiltersChange={onFiltersChange}
        />
      ))}
    </li>
  );
}
