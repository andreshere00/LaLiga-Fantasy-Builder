import fantasyLogo from "../../assets/fantasy_logo.png";
import fantasyNewsIcon from "../../assets/button_info.svg";
import hierarchyGod from "../../assets/button_hierarchy_god.svg";
import hierarchyKey from "../../assets/button_hierarchy_key.svg";
import hierarchyImportant from "../../assets/button_hierarchy_important.svg";
import hierarchyRotation from "../../assets/button_hierarchy_rotation.svg";
import hierarchyReserve from "../../assets/button_hierarchy_reserve.svg";
import starterHigh from "../../assets/button_starter_high.svg";
import starterMid from "../../assets/button_starter_mid.svg";
import starterLow from "../../assets/button_starter_low.svg";
import injuryGreen from "../../assets/button_injury_green.svg";
import injuryYellow from "../../assets/button_injury_yellow.svg";
import injuryRed from "../../assets/button_injury_red.svg";
import injuryGray from "../../assets/button_injury_gray.svg";
import { useEffect, useRef, useState } from "react";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import { formatInjuryHistoryEntry, newsItemHref } from "./playerDetailFormat";
import { newsDate } from "./playerDetailWidgets";
import "./playerDetailWidgets.css";

type FantasySectionProps = {
  profile: Record<string, unknown> | null;
};

const HISTORY_PAGE_SIZE = 5;
const HIERARCHY_LABELS: Record<string, string> = {
  dios: "God",
  god: "God",
  clave: "Key player",
  key: "Key player",
  importante: "Important",
  important: "Important",
  rotacion: "Rotation",
  rotation: "Rotation",
  revulsivo: "Impact substitute",
  otro: "Other",
  other: "Other",
  reserva: "Reserve",
  reserve: "Reserve",
};

const FORM_RATINGS: Record<string, { label: string; code: string }> = {
  bad: { label: "Bad", code: "bad" },
  malo: { label: "Bad", code: "bad" },
  mid: { label: "Mid", code: "mid" },
  regular: { label: "Mid", code: "mid" },
  good: { label: "Good", code: "good" },
  bueno: { label: "Good", code: "good" },
  very_good: { label: "Very good", code: "very_good" },
  muy_bueno: { label: "Very good", code: "very_good" },
};

const INJURY_RISK_LABELS: Record<string, string> = {
  bajo: "Low",
  low: "Low",
  medio: "Medium",
  medium: "Medium",
  alto: "High",
  high: "High",
};

function NewsTitleLink({ href, title }: { href: string; title: string }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const link = linkRef.current;
    const titleElement = titleRef.current;
    if (!link || !titleElement) return;

    const measure = () => {
      setIsTruncated(titleElement.scrollWidth > link.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(link);
    return () => observer.disconnect();
  }, [href, title]);

  return (
    <a
      ref={linkRef}
      className="player-fantasy-news-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span ref={titleRef} className="player-fantasy-news-title-line">{title}</span>
      {isTruncated ? <strong>Read more</strong> : null}
    </a>
  );
}

function normalizedFantasyValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\s-]+/g, "_");
}

function HistoryNavigator({
  page,
  pageCount,
  total,
  label,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (pageCount < 2) return null;
  const first = page * HISTORY_PAGE_SIZE + 1;
  const last = Math.min((page + 1) * HISTORY_PAGE_SIZE, total);

  return (
    <nav className="player-history-navigator" aria-label={`${label} history pages`}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        aria-label={`Newer ${label.toLowerCase()}`}
      >
        Newer
      </button>
      <span aria-live="polite">{first}–{last} of {total}</span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label={`Older ${label.toLowerCase()}`}
      >
        Older
      </button>
    </nav>
  );
}

function displayDate(value: unknown): string | null {
  const date = text(value);
  return date ? date.slice(0, 10) : null;
}

function durationLabel(row: Record<string, unknown>, fallback: string | null): string | null {
  if (row.ongoing === true) return "Currently";
  const days = asFiniteNumber(row.duration_days) ?? asFiniteNumber(row.durationDays);
  if (days != null && days > 0) return `${days} ${days === 1 ? "day" : "days"}`;
  const localized = fallback?.match(/^(\d+) día(?:s)?$/);
  return localized ? `${localized[1]} ${localized[1] === "1" ? "day" : "days"}` : null;
}

function FantasyProfile({ profile }: FantasySectionProps) {
  const hierarchy = asRecord(profile?.hierarchy);
  const startProbability = asRecord(profile?.start_probability);
  const form = asRecord(profile?.form);
  const injuryRisk = asRecord(profile?.injury_risk);
  const hierarchyRaw = text(hierarchy?.label);
  const hierarchyKeyValue = hierarchyRaw ? normalizedFantasyValue(hierarchyRaw) : "";
  const hierarchyLabel = hierarchyRaw
    ? HIERARCHY_LABELS[hierarchyKeyValue] ?? hierarchyRaw
    : "Unavailable";
  const startPercent = asFiniteNumber(startProbability?.percent);
  const startMatchweek = asFiniteNumber(startProbability?.matchweek);
  const formValue = asFiniteNumber(form?.value);
  const formRatingRaw = text(form?.rating);
  const formRating = formRatingRaw ? FORM_RATINGS[normalizedFantasyValue(formRatingRaw)] : null;
  const injuryRaw = text(injuryRisk?.raw) ?? text(injuryRisk?.level);
  const injuryLabel = injuryRaw
    ? INJURY_RISK_LABELS[normalizedFantasyValue(injuryRaw)] ?? injuryRaw
    : "Unavailable";
  const hierarchyKeyText = hierarchyKeyValue;
  const hierarchyIcon = hierarchyKeyText.includes("dios") || hierarchyKeyText === "god"
    ? hierarchyGod
    : hierarchyKeyText.includes("clave") || hierarchyKeyText.includes("key")
      ? hierarchyKey
    : hierarchyKeyText.includes("rotacion") || hierarchyKeyText.includes("rotation")
        ? hierarchyRotation
        : hierarchyKeyText.includes("reserva") || hierarchyKeyText.includes("reserve")
          ? hierarchyReserve
          : hierarchyImportant;
  const starterIcon = startPercent == null || startPercent < 50
    ? starterLow
    : startPercent < 75
      ? starterMid
      : starterHigh;
  const riskIcon = injuryRisk?.level === "low"
    ? injuryGreen
    : injuryRisk?.level === "medium"
      ? injuryYellow
      : injuryRisk?.level === "high"
        ? injuryRed
        : injuryGray;

  return (
    <section className="player-fantasy-column" aria-labelledby="player-fantasy-profile-title">
      <h3 id="player-fantasy-profile-title">
        <img className="player-fantasy-logo" src={fantasyLogo} alt="" aria-hidden="true" />
        Fantasy profile
      </h3>
      <dl className="player-fantasy-profile-list">
        <div>
          <dt><img src={hierarchyIcon} alt="" aria-hidden="true" />Hierarchy:</dt>
          <dd>{hierarchyLabel}</dd>
        </div>
        <div>
          <dt><img src={starterIcon} alt="" aria-hidden="true" />Starter likelihood:</dt>
          <dd>
            {startPercent != null ? `${startPercent}%` : "Unavailable"}
            {startMatchweek != null ? (
              <span className="player-fantasy-matchday">Matchday {startMatchweek}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>
            <svg className="player-fantasy-form-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.5 8.2 12l3.5 3.2L20.5 6" />
              <path d="M15.5 6h5v5" />
            </svg>
            Form:
          </dt>
          <dd>
            {formRating ? (
              <span className={`player-fantasy-form-rating is-${formRating.code}`}>{formRating.label}</span>
            ) : formValue != null ? String(formValue) : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt><img src={riskIcon} alt="" aria-hidden="true" />Injury risk:</dt>
          <dd>{injuryLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

function PlayerNewsList({ profile }: FantasySectionProps) {
  const news = Array.isArray(profile?.news)
    ? [...profile.news].sort((left, right) => {
        const leftDate = Date.parse(text(asRecord(left)?.published_at) ?? "");
        const rightDate = Date.parse(text(asRecord(right)?.published_at) ?? "");
        if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return rightDate - leftDate;
        if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) {
          return Number.isFinite(leftDate) ? -1 : 1;
        }
        return 0;
      })
    : [];
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [profile]);
  const pageCount = Math.ceil(news.length / HISTORY_PAGE_SIZE);
  const visibleNews = news.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);

  return (
    <section className="player-fantasy-column" aria-labelledby="player-fantasy-news-title">
      <h3 id="player-fantasy-news-title">
        <span className="player-fantasy-news-heading-icon" aria-hidden="true" />
        Latest news
      </h3>
      {news.length === 0 ? (
        <p className="player-fantasy-empty">No recent news available.</p>
      ) : (
        <>
          <ul className="player-fantasy-news-list">
          {visibleNews.map((item, index) => {
            const row = asRecord(item);
            const title = text(row?.title) ?? "News article";
            const href = newsItemHref(row);
            const published = newsDate(row?.published_at);
            const key = `${title}|${text(row?.url) ?? index}`;

            return (
              <li key={key}>
                <img src={fantasyNewsIcon} alt="" aria-hidden="true" />
                <div>
                  {published ? <time dateTime={text(row?.published_at) ?? undefined}>{published} · </time> : null}
                  {href ? (
                    <NewsTitleLink href={href} title={title} />
                  ) : (
                    <span className="player-fantasy-news-title">{title}</span>
                  )}
                  {text(row?.source) ? (
                    <span className="player-fantasy-news-source"> · {text(row?.source)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
          </ul>
          <HistoryNavigator
            page={page}
            pageCount={pageCount}
            total={news.length}
            label="News"
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

function PlayerInjuryHistory({ profile }: FantasySectionProps) {
  const history = Array.isArray(profile?.injury_history)
    ? [...profile.injury_history].sort((left, right) => {
        const leftRow = asRecord(left);
        const rightRow = asRecord(right);
        const leftDate = Date.parse(text(leftRow?.start ?? leftRow?.startDate) ?? "");
        const rightDate = Date.parse(text(rightRow?.start ?? rightRow?.startDate) ?? "");
        if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return rightDate - leftDate;
        if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) {
          return Number.isFinite(leftDate) ? -1 : 1;
        }
        return 0;
      })
    : [];
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [profile]);
  const pageCount = Math.ceil(history.length / HISTORY_PAGE_SIZE);
  const visibleHistory = history.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);

  return (
    <section className="player-fantasy-column" aria-labelledby="player-fantasy-injury-title">
      <h3 id="player-fantasy-injury-title">
        <img className="player-fantasy-heading-icon" src={injuryRed} alt="" aria-hidden="true" />
        Injury history
      </h3>
      {history.length === 0 ? (
        <p className="player-fantasy-empty">No injury history available.</p>
      ) : (
        <>
          <ul className="player-fantasy-injury-list">
          {visibleHistory.map((item, index) => {
            const row = asRecord(item);
            if (!row) return null;
            const formatted = formatInjuryHistoryEntry(row);
            const start = displayDate(row.start ?? row.startDate);
            const end = row.ongoing === true ? "Currently" : displayDate(row.end ?? row.endDate);
            const duration = durationLabel(row, formatted.duration);
            const key = `${formatted.diagnosis}|${start ?? ""}|${index}`;

            return (
              <li key={key}>
                <p className="player-fantasy-injury-diagnosis">
                  {formatted.diagnosis}{duration ? ` · ${duration}` : ""}
                </p>
                <p>
                  {start ? <><strong>Start date:</strong> {start}</> : null}
                  {start && end ? " · " : ""}
                  {end ? <><strong>End date:</strong> {end}</> : null}
                </p>
              </li>
            );
          })}
          </ul>
          <HistoryNavigator
            page={page}
            pageCount={pageCount}
            total={history.length}
            label="Injury records"
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

export function PlayerFantasySection({ profile }: FantasySectionProps) {
  return (
    <section className="player-detail-panel player-fantasy-section" aria-labelledby="player-fantasy-title">
      <h2 id="player-fantasy-title">Fantasy data</h2>
      {profile ? (
        <div className="player-fantasy-grid">
          <FantasyProfile profile={profile} />
          <PlayerNewsList profile={profile} />
          <PlayerInjuryHistory profile={profile} />
        </div>
      ) : (
        <p className="player-fantasy-empty">Fantasy data is temporarily unavailable.</p>
      )}
    </section>
  );
}
