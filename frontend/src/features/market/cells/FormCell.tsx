import { useState } from "react";

import { scoreWeekLabel } from "../../../api/mappers";
import { PlayerScoreBadge } from "../../lineup/PlayerTile";
import { formRecentWindow, formWindowChronological } from "../model/form";
import type { MarketRow } from "../model/row";

export function FormCell({ row }: { row: MarketRow }) {
  const [startIndex, setStartIndex] = useState(0);
  const window = formWindowChronological(
    formRecentWindow(row.formRecent, row.formRecentWeeks, startIndex),
  );

  if (window.points.length === 0) return <>—</>;

  const ariaParts = window.weeks.map((week, index) => {
    const points = window.points[index];
    const label = scoreWeekLabel(week);
    return `${label}: ${points}`;
  });

  const goPast = () => setStartIndex((value) => value + 1);
  const goFuture = () => setStartIndex((value) => Math.max(0, value - 1));

  return (
    <span className="market-form-nav" aria-label={`Last performances: ${ariaParts.join(", ")} points`}>
      <span className="market-form-badges">
        {window.points.map((points, index) => {
          const week = window.weeks[index];
          const key = `${row.id}-form-w${week}`;
          return (
            <span key={key} className="market-form-badge-stack">
              <PlayerScoreBadge points={points} />
              <span className="market-form-week" aria-hidden="true">
                {scoreWeekLabel(week)}
              </span>
            </span>
          );
        })}
      </span>
      <span className="market-form-nav-buttons">
        <button
          type="button"
          className="market-form-nav-btn"
          aria-label="Earlier matchweeks"
          disabled={!window.canGoOlder}
          onClick={goPast}
        >
          ‹
        </button>
        <button
          type="button"
          className="market-form-nav-btn"
          aria-label="Later matchweeks"
          disabled={!window.canGoNewer}
          onClick={goFuture}
        >
          ›
        </button>
      </span>
    </span>
  );
}
