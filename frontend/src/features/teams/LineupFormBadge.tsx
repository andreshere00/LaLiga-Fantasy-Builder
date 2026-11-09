import { t } from "../../i18n";
import { playerFormPresentation } from "../players/playerForm";

/** Form icon with its word; the icon shape differs per rating so colour is never alone. */
export function LineupFormBadge({ rating, iconOnly = false }: { rating: string | null | undefined; iconOnly?: boolean }) {
  const form = playerFormPresentation(rating);
  if (!form) return null;
  return (
    <span className="team-mvp-form" data-form={form.code} title={iconOnly ? t(form.label) : undefined}>
      <img className="is-light" src={form.icons.light} alt="" />
      <img className="is-dark" src={form.icons.dark} alt="" />
      {iconOnly ? <span className="visually-hidden">{t("Form")}: {t(form.label)}</span> : t(form.label)}
    </span>
  );
}
