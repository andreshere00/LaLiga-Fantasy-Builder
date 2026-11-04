import { t, useTranslation } from "../i18n";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  useTranslation();
  return (
    <section className="gate">
      <h1>{t("Page not found")}</h1>
      <p>{t("There is no page at this address.")}</p>
      <Link to="/">{t("Back to lineup")}</Link>
    </section>
  );
}
