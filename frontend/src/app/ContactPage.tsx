import { LinkedInIcon, MailIcon } from "../features/shell/icons";
import {
  AUTHOR_NAME,
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  LINKEDIN_URL,
} from "../features/shell/siteLinks";
import "./ContactPage.css";

export function ContactPage() {
  return (
    <section className="gate contact-page">
      <h1>Contact</h1>
      <p>{AUTHOR_NAME}</p>
      <ul className="contact-links">
        <li>
          <a href={CONTACT_MAILTO}>
            <MailIcon />
            {CONTACT_EMAIL}
          </a>
        </li>
        <li>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            <LinkedInIcon />
            LinkedIn
          </a>
        </li>
      </ul>
    </section>
  );
}
