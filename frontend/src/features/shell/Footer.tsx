import { t, useTranslation } from "../../i18n";
import { Link } from "react-router-dom";

import { GitHubIcon, MailIcon } from "./icons";
import { AUTHOR_NAME, GITHUB_URL, SITE_YEAR } from "./siteLinks";
import "./Footer.css";

export function Footer() {
  useTranslation();
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        © {SITE_YEAR} {AUTHOR_NAME}
        {" · "}<a href="https://football-logos.cc/" target="_blank" rel="noopener noreferrer">{t("Badges: football-logos.cc")}</a>
        {" · "}<a href="https://www.flaticon.com/free-icon/auction_9367178" target="_blank" rel="noopener noreferrer">Flaticon</a>
      </p>
      <nav className="app-footer-links" aria-label={t("Author")}>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          {t("GitHub")}</a>
        <Link to="/contact">
          <MailIcon />
          {t("Contact")}</Link>
      </nav>
    </footer>
  );
}
