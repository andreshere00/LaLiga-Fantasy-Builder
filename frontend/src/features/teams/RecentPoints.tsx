import { t } from "../../i18n";
import type { RecentPoint } from "./useRecentPoints";

/** The last five LaLiga matches' Fantasy points, oldest first, beside the season total. */
export function RecentPoints({ entries, compact = false }: { entries: readonly RecentPoint[]; compact?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <div className={compact ? "team-mvp-recent is-compact" : "team-mvp-recent"}>
      <p className={compact ? "visually-hidden" : undefined}>{t("Last 5 LaLiga matches")}</p>
      <ol aria-label={t("Fantasy points in the last 5 LaLiga matches, oldest to newest")}>
        {entries.map((entry, index) => (
          <li
            key={`${entry.matchweek ?? "x"}-${index}`}
            data-tone={entry.points == null ? undefined : entry.points < 0 ? "low" : entry.points >= 10 ? "high" : "mid"}
            title={entry.matchweek != null ? t("Matchweek {{0}}", { 0: entry.matchweek }) : undefined}
          >
            {entry.points ?? "—"}
          </li>
        ))}
      </ol>
    </div>
  );
}
