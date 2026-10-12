import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { clearPlayersColumnFilter } from "./playersColumnFilters";
import { PlayersColumnFilterFields } from "./PlayersColumnFilterFields";
import { playersColumnBaseLabel, type PlayersColumnHeading, type PlayersColumnKey } from "./playersColumnHeadings";
import type { PlayersFilters } from "./playersSearchParams";

const COLUMNS: PlayersColumnKey[] = ["name", "team", "position", "fsyp", "form", "marketValue", "availability", "owner"];

export function PlayersListHead({ headings, filters, owners, teams, onFiltersChange }: {
  headings: Record<PlayersColumnKey, PlayersColumnHeading>;
  filters: PlayersFilters;
  owners: readonly string[];
  teams: readonly string[];
  onFiltersChange: (patch: Partial<PlayersFilters>) => void;
}) {
  const [editor, setEditor] = useState<{ column: PlayersColumnKey; draft: PlayersFilters } | null>(null);
  return (
    <li className="market-row market-head market-head-row players-head-row">
      <span className="market-head-cell players-photo-heading">Player</span>
      {COLUMNS.map((column) => (
        <span key={column} className={"market-head-cell market-head-cell-" + column}>
          <span className="market-head-label">{headings[column].label}</span>
          <button type="button" className={"market-head-filter" + (headings[column].filtered ? " is-active" : "")}
            aria-label={"Filter " + playersColumnBaseLabel(column)} aria-haspopup="dialog"
            aria-expanded={editor?.column === column}
            onClick={() => setEditor({ column, draft: filters })}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="market-head-filter-icon"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </span>
      ))}
      <span className="market-head-cell players-details-heading">Actions</span>
      <Dialog open={editor != null} layout="sheet"
        title={editor ? "Filter " + playersColumnBaseLabel(editor.column) : "Player filters"}
        onClose={() => setEditor(null)} footer={<>
          <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
          <Button onClick={() => { if (editor) onFiltersChange(editor.draft); setEditor(null); }}>Apply filters</Button>
        </>}>
        {editor ? <PlayersColumnFilterFields column={editor.column} filters={editor.draft}
          owners={owners} teams={teams} onChange={(draft) => setEditor({ ...editor, draft })}
          onClearColumn={() => setEditor({ ...editor, draft: clearPlayersColumnFilter(editor.draft, editor.column) })} /> : null}
      </Dialog>
    </li>
  );
}
