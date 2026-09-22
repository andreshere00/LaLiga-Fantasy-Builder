/** In-memory holder for the internal JWT. Never touches browser storage. */
export class MemoryTokenStore {
  private accessToken: string | null = null;

  get(): string | null {
    return this.accessToken;
  }

  set(accessToken: string): void {
    this.accessToken = accessToken;
  }

  clear(): void {
    this.accessToken = null;
  }
}
