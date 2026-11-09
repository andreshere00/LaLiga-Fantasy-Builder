import hierarchyGod from "../../assets/button_hierarchy_god.svg";
import hierarchyKey from "../../assets/button_hierarchy_key.svg";
import hierarchyImportant from "../../assets/button_hierarchy_important.svg";
import hierarchyRotation from "../../assets/button_hierarchy_rotation.svg";
import hierarchyReserve from "../../assets/button_hierarchy_reserve.svg";

const HIERARCHY_LABELS: Record<string, string> = {
  dios: "God",
  god: "God",
  clave: "Key player",
  key: "Key player",
  importante: "Important",
  important: "Important",
  rotacion: "Rotation",
  rotation: "Rotation",
  revulsivo: "Impact substitute",
  otro: "Other",
  other: "Other",
  reserva: "Reserve",
  reserve: "Reserve",
};

export type HierarchyPresentation = {
  /** Source label as published, empty when the profile has none. */
  raw: string | null;
  /** English catalog key to pass through `t()`. */
  label: string;
  icon: string;
  /** True for the generic icon, which is drawn muted. */
  neutral: boolean;
  /** False when the source label is not one the app knows. */
  known: boolean;
};

export function normalizedFantasyValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\s-]+/g, "_");
}

/** The squad role the player details page shows, with its icon. */
export function hierarchyPresentation(raw: string | null | undefined): HierarchyPresentation {
  const value = raw ? normalizedFantasyValue(raw) : "";
  const known = value in HIERARCHY_LABELS;
  const icon = value.includes("dios") || value === "god"
    ? hierarchyGod
    : value.includes("clave") || value.includes("key")
      ? hierarchyKey
      : value.includes("rotacion") || value.includes("rotation")
        ? hierarchyRotation
        : value.includes("reserva") || value.includes("reserve")
          ? hierarchyReserve
          : hierarchyImportant;
  return {
    raw: raw || null,
    label: raw ? (HIERARCHY_LABELS[value] ?? "Unknown") : "Unavailable",
    icon,
    neutral: icon === hierarchyImportant,
    known,
  };
}
