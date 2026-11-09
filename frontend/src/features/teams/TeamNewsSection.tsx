import { t, useTranslation } from "../../i18n";
import { dateFormatter } from "../../i18n/format";
import { ScrapedText } from "../translation/ScrapedText";
import type { ClubDossierDto } from "../../api/schemas";

export function TeamNewsSection({ news }: { news: NonNullable<ClubDossierDto["news"]> }) {
  useTranslation();
  return (
    <section id="team-news" tabIndex={-1} aria-labelledby="team-news-title">
      <h2 id="team-news-title" className="team-section-title">{t("News")}</h2>
      <ul className="team-news-list">
        {news.items.slice(0, 5).map((item, index) => (
          <li key={item.url} className={index === 0 ? "is-lead" : undefined}>
            <article>
              {item.publishedAt ? (
                <time className="team-news-date" dateTime={item.publishedAt}>
                  {publishedLabel(item.publishedAt)}
                </time>
              ) : null}
              <h3><ScrapedText text={item.title} textId={item.url} /></h3>
              <a className="team-news-read" href={item.url} target="_blank" rel="noreferrer">
                {t("Read article")}
                <span aria-hidden="true"> ↗</span>
                <span className="visually-hidden"> {t("Opens in a new tab.")}</span>
              </a>
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
