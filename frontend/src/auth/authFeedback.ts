import { hasMessage } from "../i18n";

/** Application copy that was already composed and translated before it was thrown. */
export class ComposedMessageError extends Error {}

/** A thrown error's message when it is application copy; library or upstream text becomes the fallback. */
export function feedbackMessage(error: unknown, fallback: string): string {
  if (error instanceof ComposedMessageError) return error.message;
  return error instanceof Error && hasMessage(error.message) ? error.message : fallback;
}
