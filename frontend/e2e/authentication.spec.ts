import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`credential and recovery screens ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(value => { localStorage.setItem("lfb-theme", value); }, theme);
      const requests: { path: string; body: Record<string, string> }[] = [];
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== "http://127.0.0.1:3100") return route.abort();
        if (!url.pathname.startsWith("/auth/")) return route.continue();
        if (url.pathname === "/auth/get-session") return route.fulfill({ json: null });
        if (url.pathname === "/auth/sign-in-options") return route.fulfill({ json: {
          credentials: true, laligaSso: false,
          directProviders: { google: true, facebook: true, apple: true },
        } });
        requests.push({ path: url.pathname, body: request.postDataJSON() ?? {} });
        if (url.pathname === "/auth/sign-in/social") return route.fulfill({ status: 404, json: { code: "PROVIDER_NOT_FOUND", message: "Provider not found" } });
        if (url.pathname === "/auth/sign-in/username") return route.fulfill({ status: 403, json: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" } });
        if (url.pathname === "/auth/sign-up/email") return route.fulfill({ json: { user: { id: "alice" }, token: null } });
        return route.fulfill({ json: { status: true } });
      });
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.goto("/");
      await page.locator("main").getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await page.goto("/");
      if (width < 1000) await page.getByRole("button", { name: "Open settings and account options" }).click();
      await page.locator("header").getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      for (const provider of ["Google", "Facebook", "Apple"]) {
        const button = page.getByRole("button", { name: `Continue with ${provider}` });
        await expect(button).toBeVisible();
        await expect(button.locator("img").filter({ visible: true })).toBeVisible();
        await expect.poll(() => button.locator("img").filter({ visible: true }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      }
      await page.getByRole("button", { name: "Continue with Google" }).focus();
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeFocused();
      await page.screenshot({ path: `/tmp/fantasy-auth-${theme}-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Continue with Google" }).click();
      await expect(page.getByRole("alert")).toContainText("not configured for this installation");
      expect(requests.find(item => item.path === "/auth/sign-in/social")?.body.callbackURL).toContain("/connect-laliga");
      await page.getByLabel("Username or email").fill("ALICE");
      await page.getByLabel("Password", { exact: true }).fill("synthetic-password-123");
      await page.getByRole("button", { name: "Show password" }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Verify your email");
      await expect(page.getByLabel("Username or email")).toHaveValue("ALICE");
      await page.getByRole("link", { name: "Create account", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Alice Fixture");
      await page.getByLabel("Username", { exact: true }).fill("ALICE");
      await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
      await page.getByLabel("New password (at least 12 characters)").fill("synthetic-password-123");
      await page.getByRole("button", { name: "Create your account" }).click();
      await expect(page).toHaveURL(/\/verify-email$/);
      await expect(page.getByRole("heading")).toContainText("Verify your email");
      expect(requests.find(item => item.path === "/auth/sign-up/email")?.body.username).toBe("alice");
      await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
      await page.getByLabel("Verification code").fill("12345678");
      await page.getByRole("button", { name: "Verify email", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Your email is verified");
      await page.getByRole("link", { name: "Forgot password?" }).click();
      await expect(page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible();
      await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
      await page.getByRole("button", { name: "Reset your password" }).click();
      await expect(page.getByRole("status")).toContainText("If this address has an account");
      await page.goto("/reset-password?token=synthetic-reset-token");
      await page.getByLabel("New password (at least 12 characters)").fill("replacement-password-123");
      await page.getByRole("button", { name: "Choose a new password" }).click();
      await expect(page.getByRole("status")).toContainText("Your password has changed");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(requests.some(item => item.path === "/auth/email-otp/verify-email")).toBe(true);
      expect(pageErrors).toEqual([]);
    });
  }
}

for (const provider of ["google", "facebook", "apple", "username"]) {
  test(`${provider} sign-in continues into LaLiga authorization`, async ({ page }) => {
    const origin = "http://127.0.0.1:3100";
    let signedIn = false;
    let starts = 0;
    const iat = Math.floor(Date.now() / 1000);
    const applicationToken = `fixture.${Buffer.from(JSON.stringify({ sub: "alice", iat, exp: iat + 900 })).toString("base64url")}.signature`;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === "https://login.laliga.es") return route.fulfill({ contentType: "text/html", body: "<h1>LaLiga authorization fixture</h1>" });
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/auth/sign-in-options") return route.fulfill({ json: {
        credentials: true, laligaSso: false,
        directProviders: { google: true, facebook: true, apple: true },
      } });
      if (url.pathname === "/auth/get-session") return route.fulfill({ json: signedIn ? {
        user: { id: "alice", name: "Alice Fixture", email: "alice@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        session: { id: "alice-session", userId: "alice", token: "synthetic-session", expiresAt: new Date(Date.now() + 86400000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      } : null });
      if (url.pathname === "/auth/sign-in/social") {
        expect(request.postDataJSON().provider).toBe(provider);
        expect(request.postDataJSON().callbackURL).toBe("/connect-laliga");
        signedIn = true;
        // Simulate the provider callback returning a verified application session.
        return route.fulfill({ json: { url: `${origin}/connect-laliga`, redirect: true } });
      }
      if (url.pathname === "/auth/sign-in/username") {
        expect(request.postDataJSON().username).toBe("alice");
        signedIn = true;
        return route.fulfill({ json: { user: { id: "alice", email: "alice@example.test", name: "Alice Fixture" }, token: "synthetic-session" } });
      }
      if (url.pathname === "/auth/token") return route.fulfill({ json: { token: applicationToken } });
      if (url.pathname === "/laliga/connection") return route.fulfill({ json: { linked: false, needs_reauth: false, manager_id: null, manager_name: null, avatar: null } });
      if (url.pathname === "/laliga/login") {
        expect(request.method()).toBe("POST");
        expect(request.headers().authorization).toBe(`Bearer ${applicationToken}`);
        expect(request.postData()).toBeNull();
        starts += 1;
        if (provider === "facebook" && starts === 1) return route.fulfill({ status: 503, json: { error: "unavailable" } });
        return route.fulfill({ json: { authorize_url: "https://login.laliga.es/authorize?state=synthetic-state&code_challenge=synthetic-challenge" } });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: [] });
      return route.continue();
    });
    await page.goto("/sign-in");
    if (provider === "username") {
      await page.getByLabel("Username or email").fill("alice");
      await page.getByLabel("Password", { exact: true }).fill("synthetic-password-123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    } else {
      const label = provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "Apple";
      await page.getByRole("button", { name: `Continue with ${label}` }).click();
    }
    if (provider === "facebook") {
      await expect(page.getByRole("alert").last()).toContainText("LaLiga sign-in could not start");
      await page.getByRole("button", { name: "Try again", exact: true }).click();
    }
    await expect(page).toHaveURL(/https:\/\/login\.laliga\.es\/authorize\?/);
    await expect(page.getByRole("heading", { name: "LaLiga authorization fixture" })).toBeVisible();
    expect(starts).toBe(provider === "facebook" ? 2 : 1);
    expect(errors).toEqual([]);
  });
}

test("unconfigured social providers are not offered as sign-in choices", async ({ page }) => {
  let socialStarts = 0;
  await page.route("**/auth/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/auth/")) return route.continue();
    if (path === "/auth/get-session") return route.fulfill({ json: null });
    if (path === "/auth/sign-in-options") return route.fulfill({ json: {
      credentials: true, laligaSso: false,
      directProviders: { google: false, facebook: false, apple: false },
    } });
    if (path === "/auth/sign-in/social") socialStarts++;
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with (Google|Facebook|Apple)/ })).toHaveCount(0);
  await expect(page.getByLabel("Username or email")).toBeVisible();
  await page.goto("/register");
  await expect(page.getByRole("button", { name: /Continue with (Google|Facebook|Apple)/ })).toHaveCount(0);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(socialStarts).toBe(0);
});
