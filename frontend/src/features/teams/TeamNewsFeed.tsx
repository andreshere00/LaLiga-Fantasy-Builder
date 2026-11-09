import { useMemo, useState } from "react";
import { t, useTranslation } from "../../i18n";
import { dateFormatter, durationLabel } from "../../i18n/format";
import { ScrapedText } from "../translation/ScrapedText";
import type { ClubDossierDto } from "../../api/schemas";
import { newsKindLabel, newsTitleLabel } from "./teamNewsLabels";
import {
  collapseDepartures, feedChoices, feedSpanDays, groupByDay, limitFeed, type FeedLimit,
} from "./teamNews";

export type NewsItem = NonNullable<NonNullable<ClubDossierDto["news"]>["items"][number]>;

const DEFAULT_LIMIT: FeedLimit = 10;

export function TeamNewsFeed({ events }: { events: readonly NewsItem[] }) {
  useTranslation();
  const [limit, setLimit] = useState<FeedLimit>(DEFAULT_LIMIT);
  const items = useMemo(() => collapseDepartures(events), [events]);
  if (items.length === 0) return <p>{t("No recent club events were published.")}</p>;
  const choices = feedChoices(items.length);
  const visible = limitFeed(items, limit);
  const groups = groupByDay(visible);
  return (
    <div className="team-feed">
      {choices.length > 0 ? (
        <div className="team-control">
          <span className="team-control-label" id="team-feed-limit-label">{t("Events shown")}</span>
          <div className="team-filter" role="group" aria-labelledby="team-feed-limit-label">
            {choices.map((choice) => (
              <button key={choice} type="button" aria-pressed={limit === choice}
                onClick={() => setLimit(choice)}>
                {choice === "all" ? t("All") : choice}
              </button>
            ))}
          </div>
          <p className="team-note" role="status">
            {t("Showing {{0}} of {{1}} events, covering {{2}}.", {
              0: visible.length,
              1: items.length,
              2: durationLabel(feedSpanDays(events) * 1440, true),
            })}
          </p>
        </div>
      ) : null}
      {groups.map((group, groupIndex) => (
        <section key={`${group.day}-${groupIndex}`} className="team-feed-day">
          {group.day ? <h4 className="team-feed-day-title">{dayLabel(group.items[0].publishedAt)}</h4> : null}
          <ol className="team-feed-list">
            {group.items.map((item, index) => {
              const id = `news-${group.day}-${groupIndex}-${index}`;
              const label = item.departures
                ? t("{{0}} players leave for international duty: {{1}}", {
                  0: item.departures.length, 1: item.departures.join(", "),
                })
                : newsTitleLabel(item.title);
              return (
                <li key={id} className="team-feed-item">
                  {item.publishedAt ? (
                    <time className="team-news-date" dateTime={item.publishedAt}>
                      {timeLabel(item.publishedAt)}
                    </time>
                  ) : <span />}
                  <span className="team-feed-kind" data-kind={item.kind ?? "other"}>
                    {newsKindLabel(item.kind)}
                  </span>
                  <p className="team-feed-title">
                    {label ?? <ScrapedText text={item.title} textId={id} />}
                  </p>
                  <a className="team-news-read" href={item.url} target="_blank" rel="noreferrer">
                    {item.target === "match" ? t("View match")
                      : item.target === "article" ? t("Read article") : t("View on FutbolFantasy")}
                    <span aria-hidden="true"> ↗</span>
                    <span className="visually-hidden"> {t("Opens in a new tab.")}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function dayLabel(value: string | null | undefined): string {
  const parsed = new Date(value ?? "");
  if (!Number.isFinite(parsed.getTime())) return "";
  return dateFormatter({
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid",
  }).format(parsed);
}

function timeLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return dateFormatter({ hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(parsed);
}
