// ---- Mocks, fixtures & helpers ---- //
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPages";
import { authClient } from "./auth-client";

const remembered = vi.hoisted(() => ({ reload: vi.fn() }));
const client = vi.hoisted(() => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn(), username: vi.fn(), social: vi.fn() },
  emailOtp: { verifyEmail: vi.fn() },
  sendVerificationEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => remembered }));
vi.mock("./auth-client", () => ({ authClient: client }));

const EMAIL_KEY = "lfb-pending-verification-email";
const unverified = {
  data: null,
  error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
};
const accepted = { data: { status: true }, error: null };

function renderAuth(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    {["sign-in", "register", "verify-email"].map(route =>
      <Route key={route} path={`/${route}`} element={<AuthPage />} />)}
  </Routes></MemoryRouter>);
}

function fill(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

function emailValue(): string {
  const field = screen.getByLabelText("Email");
  if (!(field instanceof HTMLInputElement)) throw new Error("Email control is not an input");
  return field.value;
}

beforeEach(() => {
  sessionStorage.clear();
  remembered.reload.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    credentials: true, laligaSso: false,
    directProviders: { google: false, facebook: false, apple: false },
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---- Happy path ---- //
it("submit_registrationSucceeds_prefillsVerificationEmail", async () => {
  vi.mocked(authClient.signUp.email).mockResolvedValue(accepted);
  renderAuth("/register");
  fill("Name", "Alice Fixture");
  fill("Username", "alice");
  fill("Email", "alice@example.test");
  fill("New password (at least 12 characters)", "synthetic-password-123");
  fireEvent.click(screen.getByRole("button", { name: "Create your account" }));
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeTruthy();
  expect(emailValue()).toBe("alice@example.test");
  cleanup();
  renderAuth("/verify-email");
  expect(emailValue()).toBe("alice@example.test");
});

it("submit_emailSignInNeedsVerification_prefillsThatAddress", async () => {
  vi.mocked(authClient.signIn.email).mockResolvedValue(unverified);
  renderAuth("/sign-in");
  fill("Username or email", "alice@example.test");
  fill("Password", "synthetic-password-123");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(await screen.findByRole("link", { name: "Verify your email" }));
  expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeTruthy();
  expect(emailValue()).toBe("alice@example.test");
});

function identifierValue(): string {
  const field = screen.getByLabelText("Username or email");
  if (!(field instanceof HTMLInputElement)) throw new Error("Identifier control is not an input");
  return field.value;
}

it("submit_verificationSucceeds_opensSignInWithRegisteredUsername", async () => {
  vi.mocked(authClient.signUp.email).mockResolvedValue(accepted);
  vi.mocked(authClient.emailOtp.verifyEmail).mockResolvedValue(accepted);
  renderAuth("/register");
  fill("Name", "Alice Fixture");
  fill("Username", "ALICE");
  fill("Email", "alice@example.test");
  fill("New password (at least 12 characters)", "synthetic-password-123");
  fireEvent.click(screen.getByRole("button", { name: "Create your account" }));
  await screen.findByRole("heading", { name: "Verify your email" });
  fill("Verification code", "12345678");
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Your email is verified");
  expect(identifierValue()).toBe("alice");
  expect(sessionStorage.getItem(EMAIL_KEY)).toBeNull();
});

it("submit_verificationSucceeds_dropsRememberedEmail", async () => {
  sessionStorage.setItem(EMAIL_KEY, "alice@example.test");
  vi.mocked(authClient.emailOtp.verifyEmail).mockResolvedValue(accepted);
  renderAuth("/verify-email");
  expect(emailValue()).toBe("alice@example.test");
  fill("Verification code", "12345678");
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(identifierValue()).toBe("alice@example.test");
  expect(sessionStorage.getItem(EMAIL_KEY)).toBeNull();
  cleanup();
  renderAuth("/verify-email");
  expect(emailValue()).toBe("");
});

// ---- Error paths ---- //
it("submit_weakPassword_blocksRegistrationAndExplainsWhy", async () => {
  renderAuth("/register");
  fill("Name", "Alice Fixture");
  fill("Username", "alice");
  fill("Email", "alice@example.test");
  fill("New password (at least 12 characters)", "alice-loves-football");
  expect(screen.getByText("Do not include your username or email.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create your account" }));
  expect((await screen.findByRole("alert")).textContent).toContain("stronger password");
  expect(authClient.signUp.email).not.toHaveBeenCalled();
});

// ---- Edge cases ---- //
it("submit_usernameSignInNeedsVerification_leavesEmailEmpty", async () => {
  vi.mocked(authClient.signIn.username).mockResolvedValue(unverified);
  renderAuth("/sign-in");
  fill("Username or email", "ALICE");
  fill("Password", "synthetic-password-123");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(await screen.findByRole("link", { name: "Verify your email" }));
  expect(emailValue()).toBe("");
});

it("submit_usernameSignInAfterRegistration_keepsTheRegisteredEmail", async () => {
  sessionStorage.setItem(EMAIL_KEY, "alice@example.test");
  vi.mocked(authClient.signIn.username).mockResolvedValue(unverified);
  renderAuth("/sign-in");
  fill("Username or email", "ALICE");
  fill("Password", "synthetic-password-123");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(await screen.findByRole("link", { name: "Verify your email" }));
  expect(emailValue()).toBe("alice@example.test");
});

it("AuthPage_withoutPriorEmail_leavesVerificationEmailEmpty", () => {
  renderAuth("/verify-email");
  expect(emailValue()).toBe("");
});
