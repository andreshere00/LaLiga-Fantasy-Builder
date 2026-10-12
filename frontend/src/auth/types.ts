export type { AccessToken, LaligaConnection, SessionUser, SessionView } from "./schemas";

export type GateStatus = "signed-out" | "unlinked" | "needs-reauth" | "ready";

export type AuthStatus = GateStatus | "loading" | "unavailable";
