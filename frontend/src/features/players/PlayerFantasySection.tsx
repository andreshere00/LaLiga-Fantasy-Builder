import { dateFormatter } from "../../i18n/format";
import { ScrapedText } from "../translation/ScrapedText";
import { copy as localizeCopy, useLanguage, i18n } from "../../i18n";
import { NumberPagination } from "../../components/ui/NumberPagination";
import { Help } from "../../components/ui/Help";
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
import { playerFormPresentation } from "./playerForm";
import { starterProbabilityTone } from "./starterProbability";
import { useEffect, useId, useState } from "react";
import { asFiniteNumber, asRecord, text } from "../../api/mappers";
import { formatInjuryHistoryEntry, newsItemHref } from "./playerDetailFormat";
import "./playerDetailWidgets.css";
import "./PlayerNewsAndInjuries.css";

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

const INJURY_RISK_LABELS: Record<string, string> = {
  unknown: "Unknown",
  desconocido: "Unknown",
  bajo: "Low",
  low: "Low",
  medio: "Medium",
  medium: "Medium",
  alto: "High",
  high: "High",
};

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
  useLanguage();
  if (pageCount < 2) return null;
  const first = page * HISTORY_PAGE_SIZE + 1;
  const last = Math.min((page + 1) * HISTORY_PAGE_SIZE, total);

  return <NumberPagination page={page + 1} totalPages={pageCount}
    onPageChange={(next) => onPageChange(next - 1)} label={localizeCopy(label + " history pages")}
    caption={localizeCopy(first + "–" + last + " of " + total)} showArrows />;
}

function displayDate(value: unknown): string | null {
  const date = text(value);
  return date ? date.slice(0, 10) : null;
}

function durationLabel(row: Record<string, unknown>, fallback: string | null): string | null {
  if (row.ongoing === true) return null;
  const days = asFiniteNumber(row.durationDays);
  if (days != null && days > 0) return `${days} ${days === 1 ? "day" : "days"}`;
  const localized = fallback?.match(/^(\d+) (?:día(?:s)?|days?)$/);
  return localized ? `${localized[1]} ${localized[1] === "1" ? "day" : "days"}` : null;
}

const reportDateFormat = dateFormatter({
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function reportDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? reportDateFormat.format(parsed) : raw.slice(0, 10);
}

function ArticleArrow() {
  useLanguage();
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M7 17 17 7M7 7h10v10" />
  </svg>;
}

export function PlayerFantasySummary({ profile }: FantasySectionProps) {
  useLanguage();
  const hierarchy = asRecord(profile?.hierarchy);
  const startProbability = asRecord(profile?.startProbability);
  const form = asRecord(profile?.form);
  const injuryRisk = asRecord(profile?.injuryRisk);
  const hierarchyRaw = text(hierarchy?.label);
  const hierarchyKeyValue = hierarchyRaw ? normalizedFantasyValue(hierarchyRaw) : "";
  const hierarchyLabel = hierarchyRaw
    ? HIERARCHY_LABELS[hierarchyKeyValue] ?? "Unknown"
    : "Unavailable";
  const reportedStartPercent = asFiniteNumber(startProbability?.percent);
  const startPercent = reportedStartPercent != null && reportedStartPercent >= 0 &&
    reportedStartPercent <= 100 ? reportedStartPercent : null;
  const startMatchweek = asFiniteNumber(startProbability?.matchweek);
  const formValue = asFiniteNumber(form?.value);
  const formRatingRaw = text(form?.rating);
  const formRating = playerFormPresentation(formRatingRaw);
  const formIcons = formRating?.icons;
  const injuryRaw = text(injuryRisk?.level) ?? text(injuryRisk?.raw);
  const injuryLabel = injuryRaw
    ? INJURY_RISK_LABELS[normalizedFantasyValue(injuryRaw)] ?? "Unknown"
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
  const starterIcon = { low: starterLow, mid: starterMid, high: starterHigh }[
    starterProbabilityTone(startPercent) ?? "low"
  ];
  const riskIcon = injuryRisk?.level === "low"
    ? injuryGreen
    : injuryRisk?.level === "medium"
      ? injuryYellow
      : injuryRisk?.level === "high"
        ? injuryRed
        : injuryGray;

  return (
    <dl className="player-fantasy-profile-list player-detail-fantasy-summary"
      aria-label={localizeCopy("Fantasy profile")}>
      <Help content={localizeCopy("Probability that the player starts the game from the first minute.")}
        trigger={<div tabIndex={0} className="player-fantasy-summary-block player-fantasy-summary-block--starter"
          data-unavailable={startPercent == null || undefined} />}>
        <dt>{localizeCopy("Starter likelihood")}<span className="player-outlook-help" aria-hidden="true" /></dt>
        <dd>
          <span className="player-outlook-starter-readout">
            <span className="player-fantasy-summary-value player-outlook-probability">
              <span>{localizeCopy(startPercent != null ? `${startPercent}%` : "Unavailable")}</span>
            </span>
            {startPercent != null ? <img className="player-outlook-starter-icon" src={starterIcon}
              alt="" aria-hidden="true" /> : null}
          </span>
          {startPercent != null ? <meter className="player-outlook-meter" min={0} max={100}
            value={startPercent} aria-label={localizeCopy("Estimated chance of starting")} /> : null}
          <span className="player-fantasy-matchday">
            {localizeCopy(startMatchweek != null ? `Matchday ${startMatchweek}` : "Matchday unavailable")}
          </span>
        </dd>
      </Help>
      <Help content={localizeCopy("Indicates the player's role on the team. From highest to lowest importance: God, Key player, Important, Rotation, Impact substitute, Reserve.")}
        trigger={<div tabIndex={0} className="player-fantasy-summary-block player-fantasy-summary-block--hierarchy" />}>
        <dt>{localizeCopy("Hierarchy")}<span className="player-outlook-help" aria-hidden="true" /></dt>
        <dd>
          <span className="player-fantasy-summary-value">
            <span className="player-outlook-icon" aria-hidden="true">
              {hierarchyRaw ? <img src={hierarchyIcon} alt=""
                className={hierarchyIcon === hierarchyImportant ? "player-outlook-neutral-icon" : undefined} /> : "—"}
            </span>
            <span>{localizeCopy(hierarchyLabel)}</span>
            {hierarchyRaw && !HIERARCHY_LABELS[hierarchyKeyValue] ? <small>{i18n.t("Original source label: {{0}}", { 0: hierarchyRaw })}</small> : null}
          </span>
          <span className="player-outlook-caption">{localizeCopy("Role in the squad")}</span>
        </dd>
      </Help>
      <Help content={localizeCopy("The player's form and performance in recent matches: poor, average, good, or very good.")}
        trigger={<div tabIndex={0} className="player-fantasy-summary-block" />}>
        <dt>{localizeCopy("Form")}<span className="player-outlook-help" aria-hidden="true" /></dt>
        <dd>
          <span className="player-fantasy-summary-value">
            <span className="player-outlook-icon" aria-hidden="true">
              {formIcons ? <>
                <img className="player-form-rating-icon is-light" src={formIcons.light} alt="" />
                <img className="player-form-rating-icon is-dark" src={formIcons.dark} alt="" />
              </> : "—"}
            </span>
            <span>{localizeCopy(formRating?.label ?? (formValue != null ? String(formValue) : "Unavailable"))}</span>
          </span>
          <span className="player-outlook-caption">{localizeCopy("Recent performances")}</span>
        </dd>
      </Help>
      <Help content={localizeCopy("Indicates the player's injury risk based on recent injuries. For players new to the league, the risk may be Unknown.")}
        trigger={<div tabIndex={0} className="player-fantasy-summary-block" />}>
        <dt>{localizeCopy("Injury risk")}<span className="player-outlook-help" aria-hidden="true" /></dt>
        <dd>
          <span className="player-fantasy-summary-value">
            <span className="player-outlook-icon" aria-hidden="true">
              <img className={`player-fantasy-risk-icon${riskIcon === injuryGray ? " is-unknown" : ""}`}
                src={riskIcon} alt="" />
            </span>
            <span>{localizeCopy(injuryLabel)}</span>
          </span>
          <span className="player-outlook-caption">{localizeCopy("Injury history")}</span>
        </dd>
      </Help>
    </dl>
  );
}

function PlayerNewsList({ profile }: FantasySectionProps) {
  useLanguage();
  const news = Array.isArray(profile?.news)
    ? [...profile.news].sort((left, right) => {
        const leftDate = Date.parse(text(asRecord(left)?.publishedAt) ?? "");
        const rightDate = Date.parse(text(asRecord(right)?.publishedAt) ?? "");
        if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return rightDate - leftDate;
        if (Number.isFinite(leftDate) !== Number.isFinite(rightDate)) {
          return Number.isFinite(leftDate) ? -1 : 1;
        }
        return 0;
      })
    : [];
  const externalHintId = useId();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [profile]);
  const pageCount = Math.ceil(news.length / HISTORY_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visibleNews = news.slice(currentPage * HISTORY_PAGE_SIZE, (currentPage + 1) * HISTORY_PAGE_SIZE);

  return (
    <section className="player-updates-news" aria-labelledby="player-fantasy-news-title">
      <header className="player-updates-column-heading">
        <h3 id="player-fantasy-news-title">{localizeCopy("Latest news")}</h3>
        {news.length > 0 ? <span>{news.length} {localizeCopy(news.length === 1 ? "article" : "articles")}</span> : null}
      </header>
      <span className="visually-hidden" id={externalHintId}>{localizeCopy("Opens in a new tab.")}</span>
      {news.length === 0 ? (
        <p className="player-updates-empty">{localizeCopy("No recent news available.")}</p>
      ) : (
        <>
          <ul className="player-news-list">
            {visibleNews.map((item, index) => {
              const row = asRecord(item);
              const title = text(row?.title) ?? "News article";
              const href = newsItemHref(row);
              const published = text(row?.publishedAt);
              const source = text(row?.source);
              const lead = currentPage === 0 && index === 0;
              const contents = <>
                <span className="player-news-metadata">
                  {source ? <span className="player-news-source">{source}</span> : null}
                  {published ? <time dateTime={published}>{localizeCopy(reportDate(published))}</time> : null}
                </span>
                <h4 aria-labelledby={`${externalHintId}-${index}`}><ScrapedText text={title} textId={`${externalHintId}-${index}`} /></h4>{href ? <a href={href} aria-labelledby={`${externalHintId}-${index}`} aria-describedby={externalHintId} target="_blank" rel="noopener noreferrer">{localizeCopy("Read article")}</a> : null}
                {href ? <span className="player-news-read" aria-hidden="true"><ArticleArrow /></span>
                  : <span className="player-news-unavailable">{localizeCopy("Article link unavailable")}</span>}
              </>;
              return <li key={`${title}|${href ?? index}`} className={lead ? "is-lead" : undefined}>
                <article>
                  {href ? <div className="player-news-article"
                    >
                    {contents}
                  </div> : <div className="player-news-article">{contents}</div>}
                </article>
              </li>;
            })}
          </ul>
          <HistoryNavigator page={currentPage} pageCount={pageCount} total={news.length}
            label={localizeCopy("News")} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

function PlayerInjuryHistory({ profile }: FantasySectionProps) {
  const injuryTextId = useId();
  useLanguage();
  const history = Array.isArray(profile?.injuryHistory)
    ? [...profile.injuryHistory].sort((left, right) => {
        const leftRow = asRecord(left);
        const rightRow = asRecord(right);
        const currentFirst = Number(rightRow?.ongoing === true) - Number(leftRow?.ongoing === true);
        if (currentFirst !== 0) return currentFirst;
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
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visibleHistory = history.slice(currentPage * HISTORY_PAGE_SIZE, (currentPage + 1) * HISTORY_PAGE_SIZE);

  return (
    <section className="player-updates-injuries" aria-labelledby="player-fantasy-injury-title">
      <header className="player-updates-column-heading">
        <h3 id="player-fantasy-injury-title">{localizeCopy("Injury history")}</h3>
        {history.length > 0 ? <span>{history.length} {localizeCopy(history.length === 1 ? "record" : "records")}</span> : null}
      </header>
      {history.length === 0 ? (
        <p className="player-updates-empty">{localizeCopy("No injury history available.")}</p>
      ) : (
        <>
          <p className="player-injury-order">{localizeCopy(history.some((item) => asRecord(item)?.ongoing === true)
            ? "Current records first · Newest to oldest" : "Newest to oldest")}</p>
          <ul className="player-injury-timeline">
            {visibleHistory.map((item, index) => {
              const row = asRecord(item);
              if (!row) return null;
              const formatted = formatInjuryHistoryEntry(row);
              const start = displayDate(row.start ?? row.startDate);
              const end = displayDate(row.end ?? row.endDate);
              const ongoing = row.ongoing === true;
              const ended = !ongoing && end != null && Number.isFinite(Date.parse(end));
              const duration = durationLabel(row, formatted.duration);
              const days = duration?.match(/^(\d+) (days?)$/);
              return <li key={`${formatted.diagnosis}|${start ?? ""}|${index}`}
                className={ongoing ? "is-current" : undefined}>
                <article className="player-injury-record">
                  <div className="player-injury-record-content">
                    <span className={`player-injury-status${ongoing ? " is-current" : ""}`}>
                      {localizeCopy(ongoing ? "Current injury" : ended ? "Ended" : "End date unreported")}
                    </span>
                    <h4 aria-labelledby={`${injuryTextId}-${index}`}><ScrapedText text={formatted.diagnosis} textId={`${injuryTextId}-${index}`} /></h4>
                    <p className="player-injury-period">
                      {start ? <><span className="visually-hidden">{localizeCopy("Start date: ")}</span>
                        {localizeCopy(ongoing ? "Since " : null)}<time dateTime={start}>{localizeCopy(reportDate(start))}</time>
                      </> : <span>{localizeCopy("Start date unreported")}</span>}
                      {!ongoing && end ? <><span aria-hidden="true"> → </span>
                        <span className="visually-hidden">{localizeCopy("End date: ")}</span>
                        <time dateTime={end}>{localizeCopy(reportDate(end))}</time></> : null}
                    </p>
                  </div>
                  {days ? <span className="player-injury-duration" aria-label={i18n.t(days[1] === "1" ? "{{0}} day" : "{{0}} days", { 0: days[1] })}>
                    <strong>{localizeCopy(days[1])}</strong><span>{localizeCopy(days[2])}</span>
                  </span> : null}
                </article>
              </li>;
            })}
          </ul>
          <HistoryNavigator page={currentPage} pageCount={pageCount} total={history.length}
            label={localizeCopy("Injury records")} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}

export function PlayerFantasySection({ profile }: FantasySectionProps) {
  useLanguage();
  return (
    <section className="player-detail-panel player-fantasy-section" aria-labelledby="player-fantasy-title">
      <header className="player-updates-heading">
        <h2 className="player-section-title" id="player-fantasy-title" tabIndex={-1}>{localizeCopy("News & injuries")}</h2>
        <p>{localizeCopy("Recent reports and recorded absences.")}</p>
      </header>
      {profile ? (
        <div className="player-updates-layout">
          <PlayerNewsList profile={profile} />
          <PlayerInjuryHistory profile={profile} />
        </div>
      ) : (
        <p className="player-fantasy-empty">{localizeCopy("News & injuries data is temporarily unavailable.")}</p>
      )}
    </section>
  );
}
