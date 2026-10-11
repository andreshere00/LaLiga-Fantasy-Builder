import { useId, useState } from "react";

import { scoreWeekLabel } from "../../../api/mappers";
import { PlayerScoreBadge } from "../../lineup/PlayerTile";
import { formRecentWindow, formWindowChronological } from "../model/form";
type FormCellRow = {
  id: string;
  formRecent: readonly number[];
  formRecentWeeks: readonly number[];
  pendingFormWeek?: number;
};

export function FormCell({ row }: { row: FormCellRow }) {
  const [startIndex, setStartIndex] = useState(0);
  const pendingTooltipId = useId();
  const view = formWindowChronological(
    formRecentWindow(
      row.pendingFormWeek ? [0, ...row.formRecent] : row.formRecent,
      row.pendingFormWeek ? [row.pendingFormWeek, ...row.formRecentWeeks] : row.formRecentWeeks,
      startIndex,
    ),
  );

  if (view.points.length === 0) return <>—</>;

  const ariaParts = view.weeks.map((week, index) => {
    const points = view.points[index];
    const label = scoreWeekLabel(week);
    return `${label}: ${points}${week === row.pendingFormWeek ? " (match has not been played yet; excluded from averages)" : ""}`;
  });

  const goPast = () => setStartIndex(view.offset + 1);
  const goFuture = () => setStartIndex(Math.max(0, view.offset - 1));

  return (
    <span className="market-form-nav" role="group" aria-label={`Last performances: ${ariaParts.join(", ")} points`}>
      <span className="market-form-badges">
        {view.points.map((points, index) => {
          const week = view.weeks[index];
          const key = `${row.id}-form-w${week}`;
          return (
            <span
              key={key}
              className={[
                "market-form-badge-stack",
                week === row.pendingFormWeek ? "has-hover-tooltip-panel is-unplayed-fixture" : "",
              ].filter(Boolean).join(" ")}
              tabIndex={week === row.pendingFormWeek ? 0 : undefined}
              aria-describedby={week === row.pendingFormWeek ? pendingTooltipId : undefined}
              title={week === row.pendingFormWeek ? "This fixture has not been played yet." : undefined}
            >
              <PlayerScoreBadge points={points} />
              {week === row.pendingFormWeek ? (
                <span id={pendingTooltipId} className="hover-tooltip-panel is-align-start" role="tooltip">
                  This fixture has not been played yet. Its 0 is excluded from form averages.
                </span>
              ) : null}
              <span className="market-form-week" aria-hidden="true">
                {scoreWeekLabel(week)}{week === row.pendingFormWeek ? " ⚠" : ""}
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
          disabled={!view.canGoOlder}
          onClick={goPast}
        >
          ‹
        </button>
        <button
          type="button"
          className="market-form-nav-btn"
          aria-label="Later matchweeks"
          disabled={!view.canGoNewer}
          onClick={goFuture}
        >
          ›
        </button>
      </span>
    </span>
  );
}
