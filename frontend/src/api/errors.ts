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
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** A successful HTTP operation returned an unusable response. */
export class ApiContractError extends Error {
  constructor() {
    super("The server returned an invalid response.");
    this.name = "ApiContractError";
  }
}
