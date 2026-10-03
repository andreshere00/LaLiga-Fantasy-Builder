import { scoreWeekLabel } from "../../../api/mappers";
import { PlayerScoreBadge } from "../../lineup/PlayerTile";
import { formDisplayPoints } from "../model/form";
import type { MarketRow } from "../model/row";

export function FormCell({ row }: { row: MarketRow }) {
  const scores = formDisplayPoints(row.formRecent);
  if (scores.length === 0) return <>—</>;
  const weeks = row.formRecentWeeks.slice(0, scores.length);
  const ariaParts = scores.map((points, index) => {
    const week = weeks[index];
    const label = week != null ? scoreWeekLabel(week) : `match ${index + 1}`;
    return `${label}: ${points}`;
  });
  return (
    <span
      className="market-form-badges"
      aria-label={`Last performances: ${ariaParts.join(", ")} points`}
    >
      {scores.map((points, index) => {
        const week = weeks[index];
        const key = week != null ? `${row.id}-form-w${week}` : `${row.id}-form-${index}`;
        return (
          <span key={key} className="market-form-badge-stack">
            <PlayerScoreBadge points={points} />
            <span className="market-form-week" aria-hidden="true">
              {week != null ? scoreWeekLabel(week) : "—"}
            </span>
          </span>
        );
      })}
    </span>
  );
}
