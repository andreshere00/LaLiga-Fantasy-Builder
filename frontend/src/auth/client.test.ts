// ---- Mocks, fixtures & helpers ---- //

import { describe, expect, it, vi } from "vitest";

import { AuthClient, connectionReady, refreshDelayMs, startLaligaLogin, startLogin } from "./client";
import { resolveGate } from "./gate";
import { MemoryTokenStore } from "./tokenStore";
import type { LaligaConnection, SessionView } from "./types";

const SESSION: SessionView = {
  user: { userId: "user-1", email: "demo@fantasy-builder.local", name: "Demo" },
  csrfToken: "csrf-1",
};

const LINKED: LaligaConnection = {
  linked: true,
  needsReauth: false,
  managerId: "mgr-1",
  managerName: "Andreshere",
  avatar: "https://cdn.example/mgr.png",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- Happy path ---- //

describe("startLogin", () => {
  it("startLogin_default_navigates_to_auth_login", () => {
    const urls: string[] = [];
    startLogin((url) => urls.push(url));
    expect(urls).toEqual(["/auth/login"]);
  });

  it("startLaligaLogin_default_navigates_to_laliga_login", () => {
    const urls: string[] = [];
    startLaligaLogin((url) => urls.push(url));
    expect(urls).toEqual(["/laliga/login"]);
  });
});

describe("AuthClient", () => {
  it("currentSession_bound_fetch_does_not_throw_illegal_invocation", async () => {
    const store = new MemoryTokenStore();
    const fetchFn = vi.fn(async function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return json({ error: "unauthorized" }, 401);
    });
    const client = new AuthClient(fetchFn, store);

    await expect(client.currentSession()).resolves.toBeNull();
  });

  it("exchange_with_csrf_keeps_token_out_of_local_storage", async () => {
    const store = new MemoryTokenStore();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/auth/token") {
        return json({
          access_token: "jwt-1",
          token_type: "Bearer",
          expires_in: 900,
          expires_at: 1_800_000_000,
        });
      }
      return json({ error: "unauthorized" }, 401);
    });
    const client = new AuthClient(fetchFn, store);

    await client.exchange("csrf-1");

    expect(store.get()).toBe("jwt-1");
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledWith(
      "/auth/token",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-1" }),
      }),
    );
    setItem.mockRestore();
  });

  it("exchange_invalid_token_response_does_not_store_token", async () => {
    const store = new MemoryTokenStore();
    const client = new AuthClient(
      vi.fn(async () =>
        json({
          access_token: "jwt-1",
          token_type: "Bearer",
          expires_in: true,
          expires_at: 1_800_000_000,
        }),
      ),
      store,
    );

    await expect(client.exchange("csrf-1")).rejects.toThrow();
    expect(store.get()).toBeNull();
  });

  it("exchange_error_response_uses_validated_generic_error_without_detail", async () => {
    const store = new MemoryTokenStore();
    const client = new AuthClient(
      vi.fn(async () => json({ error: "provider_error", detail: "private detail" }, 503)),
      store,
    );

    await expect(client.exchange("csrf-1")).rejects.toThrow("Unable to exchange the session");
    expect(store.get()).toBeNull();
  });

  it("logout_after_exchange_clears_memory_token", async () => {
    const store = new MemoryTokenStore();
    const fetchFn = vi.fn(async (input: string) => {
      if (input === "/auth/token") {
        return json({
          access_token: "jwt-1",
          token_type: "Bearer",
          expires_in: 900,
          expires_at: 1_800_000_000,
        });
      }
      return json({ ok: true });
    });
    const client = new AuthClient(fetchFn, store);
    await client.exchange("csrf-1");

    await client.logout("csrf-1");

    expect(client.token()).toBeNull();
  });
});

describe("resolveGate", () => {
  it("connectionReady_linked_without_reauth_leaves_the_gate", () => {
    expect(connectionReady(LINKED)).toBe(true);
    expect(connectionReady({ ...LINKED, linked: false })).toBe(false);
    expect(connectionReady({ ...LINKED, needsReauth: true })).toBe(false);
  });

  it("resolveGate_api_needs_reauth_returns_reconnect_state", () => {
    expect(
      resolveGate({ session: SESSION, connection: LINKED, needsReauth: true }),
    ).toBe("needs-reauth");
    expect(
      resolveGate({
        session: SESSION,
        connection: { ...LINKED, needsReauth: true },
        needsReauth: false,
      }),
    ).toBe("needs-reauth");
  });
});

// ---- Error paths ---- //

describe("resolveGate errors", () => {
  it("resolveGate_missing_session_returns_signed_out", () => {
    expect(resolveGate({ session: null, connection: LINKED, needsReauth: false })).toBe(
      "signed-out",
    );
  });

  it("resolveGate_unlinked_connection_returns_unlinked", () => {
    expect(
      resolveGate({
        session: SESSION,
        connection: { ...LINKED, linked: false },
        needsReauth: false,
      }),
    ).toBe("unlinked");
  });
});

// ---- Edge cases ---- //

describe("refreshDelayMs", () => {
  it("refreshDelayMs_before_expiry_subtracts_skew", () => {
    expect(refreshDelayMs(1_000, 900_000)).toBe(40_000);
  });

  it("refreshDelayMs_past_skew_window_is_zero", () => {
    expect(refreshDelayMs(10, 20_000)).toBe(0);
  });
});
