import { t } from "../../i18n";

/** The widgets on the Teams page that carry a short description under their heading. */
export type TeamWidget =
  | "overview" | "previous" | "upcoming" | "mvps" | "squad" | "hierarchy"
  | "starters" | "coach" | "alternatives" | "injuries" | "news";

/**
 * What a widget is, in one short sentence. It never states results: the numbers are in the widget
 * itself, so the description stays true whatever the data says and reads the same on every visit.
 * Each case uses a literal key so the translation catalogs can be checked.
 */
export function widgetDescription(widget: TeamWidget): string {
  switch (widget) {
    case "overview":
      return t("Results, recent form, home and away record, and goals over the selected matches.");
    case "previous":
      return t("Finished matches in the selected window, newest first, with score and result.");
    case "upcoming":
      return t("Scheduled matches in the selected window, soonest first, with date and kickoff time.");
    case "mvps":
      return t("The club's top scorers by FSYP, with form, recent points and standout stats.");
    case "squad":
      return t("Every player in the squad with position, FSYP and season statistics. Select a column to sort.");
    case "hierarchy":
      return t("A list of every player grouped by squad role, from most to least important.");
    case "starters":
      return t("The predicted starting XI on the pitch, with each player's chance of starting.");
    case "coach":
      return t("The coach's report and average figures for the predicted XI.");
    case "alternatives":
      return t("Players who could replace a starter, with form, role and chance of starting.");
    case "injuries":
      return t("Players who are injured or doubtful, with their role, FSYP, injury and expected return.");
    case "news":
      return t("Recent events published for the club, grouped by day.");
  }
}
