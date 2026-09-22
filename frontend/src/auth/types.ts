export type SessionUser = {
  user_id: string;
  email: string | null;
  name: string | null;
};

export type SessionView = {
  user: SessionUser;
  csrf_token: string;
};

export type AccessToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
};

export type LaligaConnection = {
  linked: boolean;
  needs_reauth: boolean;
  manager_id: string | null;
  manager_name: string | null;
};

export type GateStatus = "signed-out" | "unlinked" | "needs-reauth" | "ready";

export type AuthStatus = GateStatus | "loading";
