import { copy as localizeCopy, useLanguage } from "../../i18n";
import { Link } from "react-router-dom";

import { GitHubIcon, MailIcon } from "./icons";
import { AUTHOR_NAME, GITHUB_URL, SITE_YEAR } from "./siteLinks";
import "./Footer.css";

export function Footer() {
  useLanguage();
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        © {SITE_YEAR} {localizeCopy(AUTHOR_NAME)}
        {" · "}<a href="https://football-logos.cc/" target="_blank" rel="noopener noreferrer">{localizeCopy("Badges: football-logos.cc")}</a>
      </p>
      <nav className="app-footer-links" aria-label={localizeCopy("Author")}>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          {localizeCopy("GitHub")}</a>
        <Link to="/contact">
          <MailIcon />
          {localizeCopy("Contact")}</Link>
      </nav>
    </footer>
  );
}
