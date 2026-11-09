import { t } from "../../i18n";
import { dateFormatter, durationLabel } from "../../i18n/format";

function key(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The recovery steps FutbolFantasy publishes, in order. Unknown text returns null. */
export function injuryPhaseLabel(value: string | null | undefined): string | null {
  switch (key(value ?? "")) {
    case "pendiente pruebas": return t("Awaiting tests");
    case "tratamiento": return t("Treatment");
    case "postoperatorio": return t("Post-operative");
    case "rehabilitacion": return t("Rehabilitation");
    case "trabajo de campo": return t("Field work");
    case "parcial con el grupo": return t("Partial training with the group");
    case "grupo sin el alta": return t("Training with the group");
    default: return null;
  }
}

function bodyPart(value: string): string | null {
  switch (value) {
    case "rodilla": return t("knee");
    case "tobillo": return t("ankle");
    case "cuadriceps": return t("quadriceps");
    case "isquiotibiales": return t("hamstring");
    case "gemelo": return t("calf");
    case "soleo": return t("soleus");
    case "muslo": return t("thigh");
    case "hombro": return t("shoulder");
    case "cadera": return t("hip");
    case "espalda": return t("back");
    case "pie": return t("foot");
    case "pierna": return t("leg");
    case "pubis": return t("pubis");
    case "aductor": return t("adductor");
    case "tendon de aquiles": return t("Achilles tendon");
    case "menisco": return t("meniscus");
    case "ligamento cruzado": return t("cruciate ligament");
    case "ligamento cruzado anterior": return t("anterior cruciate ligament");
    case "ligamento lateral interno": return t("medial collateral ligament");
    default: return null;
  }
}

function injuryKind(value: string, part: string): string | null {
  switch (value) {
    case "lesion": return t("{{0}} injury", { 0: part });
    case "rotura": return t("{{0}} tear", { 0: part });
    case "molestias": return t("{{0}} discomfort", { 0: part });
    case "calambres": return t("{{0}} cramps", { 0: part });
    case "esguince": return t("{{0}} sprain", { 0: part });
    case "fractura": return t("{{0}} fracture", { 0: part });
    case "contusion": return t("{{0}} contusion", { 0: part });
    case "sobrecarga": return t("{{0}} overload", { 0: part });
    case "tendinitis": return t("{{0}} tendinitis", { 0: part });
    default: return null;
  }
}

function capitalised(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

/** "Lesión de rodilla" becomes "Knee injury". Wording outside the known vocabulary returns null. */
export function injuryDiagnosisLabel(value: string | null | undefined): string | null {
  const text = key((value ?? "").replace(/\blig\./gi, "ligamento"));
  if (text === "gastroenteritis") return t("Gastroenteritis");
  if (text === "molestias sin determinar") return t("Undetermined discomfort");
  if (text === "molestias musculares") return t("Muscle discomfort");
  const match = /^(lesion|rotura|molestias|calambres|esguince|fractura|contusion|sobrecarga|tendinitis)\s+(?:de|en)\s+(?:(?:el|la|los|las)\s+)?(.+)$/.exec(text);
  if (!match) return null;
  const parts = match[2].split(/\s+y\s+(?:el\s+|la\s+)?/).map(bodyPart);
  if (parts.length === 0 || parts.some((part) => part === null)) return null;
  const joined = parts.length === 1
    ? (parts[0] as string)
    : t("{{0}} and {{1}}", { 0: parts[0] as string, 1: parts[1] as string });
  const label = injuryKind(match[1], joined);
  return label === null ? null : capitalised(label);
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function untilMonth(period: string | undefined, when: string): string {
  switch (period) {
    case "principios": return t("Out until early {{0}}", { 0: when });
    case "mediados": return t("Out until mid-{{0}}", { 0: when });
    case "finales": return t("Out until late {{0}}", { 0: when });
    default: return t("Out until {{0}}", { 0: when });
  }
}

/**
 * "Baja hasta mayo 2027", "Baja hasta finales de diciembre", "Duda para la jornada 13".
 * Other wording returns null.
 */
export function expectedReturnLabel(value: string | null | undefined): string | null {
  const text = key(value ?? "");
  const until = /^baja hasta (?:(principios|mediados|finales) de )?(\p{L}+)(?:\s+(?:de\s+)?(\d{4}))?$/u.exec(text);
  if (until) {
    const month = MONTHS.indexOf(until[2]);
    if (month < 0) return null;
    const year = until[3] ? Number(until[3]) : 2000;
    const when = dateFormatter(until[3]
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));
    return untilMonth(until[1], when);
  }
  const matchday = /^(baja confirmada|baja|duda|disponible) para la jornada (\d+)$/.exec(text);
  if (!matchday) return null;
  const number = { 0: matchday[2] };
  switch (matchday[1]) {
    case "baja confirmada": return t("Confirmed out for matchday {{0}}", number);
    case "baja": return t("Out for matchday {{0}}", number);
    case "duda": return t("Doubtful for matchday {{0}}", number);
    default: return t("Available for matchday {{0}}", number);
  }
}

/** Whole days between an ISO date and today, never negative. */
export function daysSince(startedOn: string, today: Date = new Date()): number | null {
  const start = new Date(`${startedOn}T12:00:00Z`).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12) - start) / 86_400_000));
}

/** "Since 17 Oct · 23 days". */
export function startedLabel(startedOn: string, today: Date = new Date()): string {
  const parsed = new Date(`${startedOn}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return startedOn;
  const date = dateFormatter({ day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
  const days = daysSince(startedOn, today);
  const since = t("Since {{0}}", { 0: date });
  return days === null ? since : `${since} · ${durationLabel(days * 1440, true)}`;
}
