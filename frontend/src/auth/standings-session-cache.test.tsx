// ---- Mocks, fixtures & helpers ---- //
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";

vi.mock("./client", () => ({
  AuthClient: class {
    async currentSession() { return null; }
    clearToken() {}
  },
  connectionReady: vi.fn(), refreshDelayMs: vi.fn(), startLaligaLogin: vi.fn(), startLogin: vi.fn(),
}));
afterEach(cleanup);

// ---- Error paths ---- //
it("should remove cached standings when the auth service reports an expired session", async () => {
  // Arrange
  const client = new QueryClient();
  const key = ["competition-standings", "user-a", 1, 2026, "completed"];
  client.setQueryData(key, { previousSession: true });
  // Act
  const view = render(<QueryClientProvider client={client}><AuthProvider><div /></AuthProvider></QueryClientProvider>);
  // Assert
  await waitFor(() => expect(client.getQueryData(key)).toBeUndefined());
  view.unmount();
  client.clear();
});
