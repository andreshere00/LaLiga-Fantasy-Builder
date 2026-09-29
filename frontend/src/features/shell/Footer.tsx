import { Link } from "react-router-dom";

import { GitHubIcon, MailIcon } from "./icons";
import { AUTHOR_NAME, GITHUB_URL, SITE_YEAR } from "./siteLinks";
import "./Footer.css";

export function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        © {SITE_YEAR} {AUTHOR_NAME}
      </p>
      <nav className="app-footer-links" aria-label="Author">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          GitHub
        </a>
        <Link to="/contact">
          <MailIcon />
          Contact
        </Link>
      </nav>
    </footer>
  );
}
