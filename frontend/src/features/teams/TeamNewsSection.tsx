import { t, useTranslation } from "../../i18n";
import { dateFormatter } from "../../i18n/format";
import { ScrapedText } from "../translation/ScrapedText";
import type { ClubDossierDto } from "../../api/schemas";
import "../players/PlayerNewsAndInjuries.css";

export function TeamNewsSection({ news }: { news: NonNullable<ClubDossierDto["news"]> }) {
  useTranslation();
  return (
    <section id="team-news" className="player-updates-news" aria-labelledby="team-news-title">
      <h2 id="team-news-title" className="player-section-title">{t("News")}</h2>
      <ul className="player-news-list">
        {news.items.slice(0, 5).map((item, index) => (
          <li key={item.url} className={index === 0 ? "is-lead" : undefined}>
            <article>
              <div className="player-news-article">
                <span className="player-news-metadata">
                  {item.publishedAt ? (
                    <time dateTime={item.publishedAt}>{publishedLabel(item.publishedAt)}</time>
                  ) : null}
                </span>
                <h4><ScrapedText text={item.title} textId={item.url} /></h4>
                <a className="player-news-read" href={item.url} target="_blank" rel="noreferrer">
                  {t("Read article")}
                </a>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function publishedLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return dateFormatter({
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(parsed);
}
