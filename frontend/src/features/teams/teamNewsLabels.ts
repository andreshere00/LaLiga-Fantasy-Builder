import { t } from "../../i18n";

function key(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type NewsKind = "injury_update" | "lineup" | "call_up" | "national_team" | "other";

export function newsKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "injury_update": return t("Injury update");
    case "lineup": return t("Lineup");
    case "call_up": return t("Squad list");
    case "national_team": return t("International duty");
    default: return t("Update");
  }
}

function availability(value: string): string | null {
  switch (value) {
    case "baja": return t("out");
    case "duda": return t("a doubt");
    case "tocado": return t("knocked");
    case "tocado o al margen": return t("knocked or sidelined");
    case "disponible": return t("available");
    case "recuperado": return t("recovered");
    default: return null;
  }
}

/** Status in "moves from X to Y": the same words without the article. */
function transition(value: string): string | null {
  switch (value) {
    case "baja": return t("out");
    case "duda": return t("doubtful");
    case "tocado": return t("knocked");
    case "disponible": return t("available");
    case "recuperado": return t("recovered");
    default: return null;
  }
}

/**
 * Translates the changelog sentences FutbolFantasy generates ("X pasa de duda a baja").
 * Player names are kept as published. Free-text article headlines return null.
 */
export function newsTitleLabel(title: string): string | null {
  const text = title.trim();
  const folded = key(text);
  // Match on the accent-folded text, then cut names from the original so accents survive.
  const split = (pattern: RegExp): string[] | null => {
    const match = new RegExp(pattern.source, "d").exec(folded);
    if (!match?.indices) return null;
    return match.indices.slice(1).map((range) => (range ? text.slice(range[0], range[1]) : ""));
  };
  let found: string[] | null;
  if ((found = split(/^(.+) se marcha con su seleccion$/))) {
    return t("{{0}} leaves for international duty", { 0: found[0] });
  }
  if ((found = split(/^(.+) (?:esta|es) ahora (tocado o al margen|recuperado|baja|duda|disponible)$/))) {
    const status = availability(key(found[1]));
    return status ? t("{{0}} is now {{1}}", { 0: found[0], 1: status }) : null;
  }
  if ((found = split(/^(.+) pasa de (baja|duda|tocado|disponible) a (baja|duda|tocado|disponible|recuperado)$/))) {
    const from = transition(key(found[1]));
    const to = transition(key(found[2]));
    return from && to ? t("{{0}} moves from {{1}} to {{2}}", { 0: found[0], 1: from, 2: to }) : null;
  }
  if ((found = split(/^actualizada posible alineacion de (.+)$/))) {
    return t("Probable lineup updated for {{0}}", { 0: found[0] });
  }
  if ((found = split(/^publicada posible alineacion de (.+)$/))) {
    return t("Probable lineup published for {{0}}", { 0: found[0] });
  }
  if ((found = split(/^alineacion confirmada de (.+)$/))) {
    return t("Confirmed lineup for {{0}}", { 0: found[0] });
  }
  if ((found = split(/^convocatoria de (.+) disponible$/))) {
    return t("Squad list available for {{0}}", { 0: found[0] });
  }
  return null;
}
