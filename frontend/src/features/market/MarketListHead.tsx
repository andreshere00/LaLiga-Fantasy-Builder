import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { MarketColumnFilterFields } from "./MarketColumnFilterFields";
import { clearMarketColumnFilter, isMarketColumnFilterable } from "./marketColumnFilters";
import { marketColumnBaseLabel, type MarketColumnHeading, type MarketColumnKey } from "./marketColumnHeadings";
import type { MarketFilters } from "./marketFilters";

const COLUMNS: MarketColumnKey[] = ["player", "position", "fsyp", "form", "marketValue", "availability", "sealEnd", "sellOptions"];

export function MarketListHead({ headings, filters, sellers, onFiltersChange }: {
  headings: Record<MarketColumnKey, MarketColumnHeading>;
  filters: MarketFilters;
  sellers: readonly string[];
  onFiltersChange: (filters: MarketFilters) => void;
}) {
  const [editor, setEditor] = useState<{ column: MarketColumnKey; draft: MarketFilters } | null>(null);
  return (
    <li className="market-row market-head">
      {COLUMNS.map((column) => (
        <span key={column} className={(column === "player" ? "market-head-player " : "") + "market-head-cell market-head-cell-" + column}>
          <span className="market-head-label">{column === "position" ? "Pos." : marketColumnBaseLabel(column)}</span>
          {isMarketColumnFilterable(column) ? (
            <button type="button" className={"market-head-filter" + (headings[column].filtered ? " is-active" : "")}
              aria-label={"Filter " + marketColumnBaseLabel(column)} aria-haspopup="dialog"
              aria-expanded={editor?.column === column}
              onClick={() => setEditor({ column, draft: filters })}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="market-head-filter-icon"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          ) : null}
        </span>
      ))}
      <Dialog open={editor != null} layout="sheet"
        title={editor ? "Filter " + marketColumnBaseLabel(editor.column) : "Market filters"}
        onClose={() => setEditor(null)} footer={<>
          <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
          <Button onClick={() => { if (editor) onFiltersChange(editor.draft); setEditor(null); }}>Apply filters</Button>
        </>}>
        {editor ? <MarketColumnFilterFields column={editor.column} filters={editor.draft}
          sellers={sellers} onChange={(draft) => setEditor({ ...editor, draft })}
          onClearColumn={() => setEditor({ ...editor, draft: clearMarketColumnFilter(editor.draft, editor.column) })} /> : null}
      </Dialog>
    </li>
  );
}
