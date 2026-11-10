import { t } from "../../i18n";
import { normalizeSearchText } from "../../searchText";

export type Tone = "good" | "warn" | "neutral";

/** Matchday predictability words FutbolFantasy publishes, in English. Unknown text returns null. */
export function predictabilityLabel(value: string | null | undefined): { label: string; tone: Tone } | null {
  switch (normalizeSearchText(value ?? "")) {
    case "muy previsible": return { label: t("Very predictable"), tone: "good" };
    case "previsible": return { label: t("Predictable"), tone: "good" };
    case "poco previsible": return { label: t("Hard to predict"), tone: "warn" };
    case "imprevisible":
    case "muy imprevisible": return { label: t("Unpredictable"), tone: "warn" };
    default: return null;
  }
}

/** Short fixed rotation phrases. Longer free text stays with the translation widget. */
export function rotationsLabel(value: string | null | undefined): string | null {
  switch (normalizeSearchText(value ?? "")) {
    case "sin rotaciones": return t("No rotations");
    case "pocas rotaciones": return t("Few rotations");
    case "algunas rotaciones": return t("Some rotations");
    case "muchas rotaciones": return t("Many rotations");
    default: return null;
  }
}

/** "2.64 jugs" becomes "2.64 players"; any other wording returns null. */
export function substituteRiskLabel(value: string | null | undefined): string | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*jug(?:s|\.|adores)?$/i.exec((value ?? "").trim());
  return match ? t("{{0}} players", { 0: match[1].replace(",", ".") }) : null;
}
