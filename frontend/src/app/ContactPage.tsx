import { copy as localizeCopy, useLanguage } from "../i18n";
import { LinkedInIcon, MailIcon } from "../features/shell/icons";
import {
  AUTHOR_NAME,
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  LINKEDIN_URL,
} from "../features/shell/siteLinks";
import "./ContactPage.css";

export function ContactPage() {
  useLanguage();
  return (
    <section className="gate contact-page">
      <h1>{localizeCopy("Contact")}</h1>
      <p>{localizeCopy(AUTHOR_NAME)}</p>
      <ul className="contact-links">
        <li>
          <a href={CONTACT_MAILTO}>
            <MailIcon />
            {localizeCopy(CONTACT_EMAIL)}
          </a>
        </li>
        <li>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
            <LinkedInIcon />
            {localizeCopy("LinkedIn")}</a>
        </li>
      </ul>
    </section>
  );
}
