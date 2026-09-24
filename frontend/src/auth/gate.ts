import type { GateStatus, LaligaConnection, SessionView } from "./types";

export function resolveGate(input: {
  session: SessionView | null;
  connection: LaligaConnection | null;
  needsReauth: boolean;
}): GateStatus {
  if (!input.session) return "signed-out";
  if (input.needsReauth || input.connection?.needs_reauth) return "needs-reauth";
  if (!input.connection?.linked) return "unlinked";
  return "ready";
}
