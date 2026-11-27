// ---- Mocks, fixtures & helpers ---- //
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountPage } from "./AccountPage";

const auth = vi.hoisted(() => ({ user: { userId: "u1", email: "u@example.com" }, forgetDeletedAccount: vi.fn() }));
const client = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  unlinkAccount: vi.fn(),
  linkSocial: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("./auth-client", () => ({ authClient: client }));

const accounts = [
  { id: "a-credential", providerId: "credential", accountId: "u1" },
  { id: "a-google", providerId: "google", accountId: "g1" },
];

function renderAccount() {
  return render(<MemoryRouter><AccountPage /></MemoryRouter>);
}

beforeEach(() => {
  client.listAccounts.mockResolvedValue({ data: accounts, error: null });
  client.unlinkAccount.mockResolvedValue({ data: { status: true }, error: null });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    directProviders: { google: true, facebook: false, apple: false },
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function openUnlink() {
  renderAccount();
  const unlink = await screen.findByRole("button", { name: "Unlink" });
  await waitFor(() => expect((unlink as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(unlink);
  return screen.findByRole("dialog", { name: "Unlink Google" });
}

// ---- Happy path ---- //
it("unlink_afterConfirmation_removesProviderAndReportsIt", async () => {
  const dialog = await openUnlink();

  fireEvent.click(within(dialog).getByRole("button", { name: "Unlink Google" }));

  await waitFor(() => expect(client.unlinkAccount).toHaveBeenCalledWith({ accountId: "a-google" }));
  expect(await screen.findByText("Google unlinked.")).toBeTruthy();
});

// ---- Edge cases ---- //
it("unlink_beforeConfirmation_sendsNoRequest", async () => {
  const dialog = await openUnlink();

  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  expect(client.unlinkAccount).not.toHaveBeenCalled();
});
