import { copy as localizeCopy, useLanguage } from "../i18n";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  useLanguage();
  return (
    <section className="gate">
      <h1>{localizeCopy("Page not found")}</h1>
      <p>{localizeCopy("There is no page at this address.")}</p>
      <Link to="/">{localizeCopy("Back to lineup")}</Link>
    </section>
  );
}
