import { t, useTranslation } from "../../i18n";
import { ScrapedText } from "../translation/ScrapedText";
import type { ClubDossierDto } from "../../api/schemas";

export function TeamNewsSection({ news }: { news: NonNullable<ClubDossierDto["news"]> }) {
  useTranslation();
  return (
    <section id="team-news" aria-labelledby="team-news-title">
      <h2 id="team-news-title">{t("News")}</h2>
      <ul className="team-news-list">
        {news.items.slice(0, 5).map((item) => (
          <li key={item.url}>
            <a href={item.url} target="_blank" rel="noreferrer">
              <ScrapedText text={item.title} textId={item.url} />
            </a>
            {item.publishedAt ? <time dateTime={item.publishedAt}>{item.publishedAt}</time> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
