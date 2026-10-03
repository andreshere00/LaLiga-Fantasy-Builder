import { text } from "../../../api/mappers";

export type Availability = "available" | "questionable" | "unavailable";

export const AVAILABILITY_TOOLTIPS: Record<Availability, string> = {
  available: "This player is ready and can play the next matchday",
  questionable: "This player may not play the next matchday",
  unavailable: "This player cannot play the next matchday",
};

const QUESTIONABLE = new Set(["doubtful", "questionable", "uncertain", "doubt"]);
const AVAILABLE = new Set(["ok", "available", "fit", "active"]);

/** Maps the Fantasy ``playerStatus`` string to the three displayed states. */
export function availabilityOf(status: unknown): Availability {
  const value = text(status)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
  if (value == null || AVAILABLE.has(value)) return "available";
  return QUESTIONABLE.has(value) ? "questionable" : "unavailable";
}
