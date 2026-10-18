export class NeedsReauthError extends Error {
  constructor() {
    super("needs_reauth");
    this.name = "NeedsReauthError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly diagnostics: { code: string; playerId: string | null }[] = [],
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** Preserve authentication recovery across HTTP and streamed error responses. */
export function errorForStatus(
  status: number, code: string, diagnostics: ApiError["diagnostics"] = [],
): ApiError | NeedsReauthError {
  return status === 401 && code === "needs_reauth"
    ? new NeedsReauthError()
    : new ApiError(status, code, diagnostics);
}

/** A successful HTTP operation returned an unusable response. */
export class ApiContractError extends Error {
  constructor() {
    super("The server returned an invalid response.");
    this.name = "ApiContractError";
  }
}
