# Production macOS helper and automatic return

Status: implementation plan, 27 October 2026. The guided CLI and cloud pairing
routes exist. The web page now rechecks its owner-scoped connection when it
regains focus; the CLI opens the fixed `/connect-laliga` URL after successful
pairing. The installed background helper described here is not implemented or
released.

## Desired experience

1. A signed-in user chooses **Connect LaLiga** on `fantasybuilder.es`.
2. The installed macOS helper starts on that user's Mac without a terminal.
   It opens interactive Fantasy Builder sign-in only if it cannot confirm the
   same account through a secure, short-lived handoff. The user approves the
   account and signs in to LaLiga in their normal browser.
3. The helper receives the native callback, exchanges the authorization code
   with PKCE, and submits the tokens to the existing cloud Auth pairing route.
   The exchange and cloud completion run in the helper while the browser waits;
   the user does not copy a code or run a command.
4. On confirmed completion, the helper opens the fixed
   `https://fantasybuilder.es/connect-laliga` URL. The existing tab also checks
   its connection on focus. The website navigates to the application only when
   its own verified JWT's owner has `linked=true` and `needs_reauth=false`.

Provider sign-in remains interactive. A background process cannot legitimately
enter provider credentials or replace the user's browser interaction. The
helper must run in the macOS user's session; a VM service cannot receive that
Mac's native callback.

## Gaps and implementation work

### 1. Native registration and distribution decision

- Confirm that this product may use the existing native client and
  `authredirect://com.lfp.laligafantasy` registration for distributed users.
  The successful single-Mac trial establishes technical feasibility only.
  If ownership or permission cannot be established, stop the installed-app
  release and seek a provider-supported return URI. Do not seize another
  installed application's default handler.
- Package a dedicated macOS app under a Fantasy Builder-owned bundle ID.
  Sign and notarize it, publish versioned checksums and update provenance,
  and test install, upgrade, uninstall and rollback. The current generated,
  ad-hoc-signed AppleScript callback app is a development artifact and is not
  the production distribution.
- Implement the callback in the installed app, with strict scheme, host, path,
  state, size and expiry checks. Keep the PKCE verifier and pairing secret in
  memory. Remove the shared callback file and the Playwright interception
  fallback from the production path. Leave existing developer CLI behavior
  available only as a separate, explicit mode.

### 2. Event-driven background execution

- Install a per-user LaunchAgent or login item that starts the helper on
  demand. It must have a visible status or error surface and quit after an
  attempt; do not keep application JWTs or provider tokens in a daemon.
- Register a Fantasy Builder-owned launch protocol for the website button.
  Its URL may contain only a short-lived, opaque transaction identifier and
  public client proof. Fix the production origin in the signed app; reject
  arbitrary API hosts, return URLs, commands and credentials from the link.
- Add an Auth transaction bound to the initiating verified JWT `sub`, the
  helper's proof, a short expiry and one-time consumption. The helper
  independently authenticates the same application account before creating
  a native pairing. A mismatched or expired transaction fails closed. Test
  concurrent attempts, replay, cancellation and account switches.
- Keep the existing pairings and encrypted vault as the sole owner of LaLiga
  credentials. Do not put tokens in the launch URL, a browser cookie, logs,
  local storage, a push notification or a new cloud queue.

### 3. Browser completion and recovery

- The connection endpoint remains authoritative. The waiting page checks on
  focus and after opening the fixed completion URL. A later release may use a
  bounded, authenticated status channel while the page is visible to navigate
  immediately even if no focus event occurs. It must stop on unmount, logout,
  account switch and timeout. No helper-supplied success flag may unlock the UI.
- Show a clear `needs_reauth` and retry state. On uncertain cloud completion,
  query the connection before starting another pairing. Do not retry a possibly
  redeemed authorization code.
- Verify the existing tab, a fresh tab and a different-account tab. A different
  account stays unlinked and sees a precise account-mismatch explanation.

### 4. Release and production activation

- Add Auth and frontend contracts, generated Auth OpenAPI, browser tests and
  macOS integration tests for the new transaction and app launch. Test the
  provider callback on a clean Mac with Google and each advertised method.
- Verify two separate application users, real refresh, container restart,
  reconnection, logout, cancellation and rollback on a staging release.
  Preserve the live vault key and existing connections.
- Publish immutable Auth/frontend images through the main-branch CI and deploy
  one pinned release with `fantasybuilder-deploy`. Keep
  `LALIGA_HELPER_ENABLED=false` until the installed helper and these gates pass.
  Then upload a new Auth secret version and redeploy to advertise it. Keep
  `LALIGA_BROWSER_REDIRECT_URI` unset unless LaLiga registers that exact HTTPS
  callback separately.
- Distribute the signed helper to the intended Macs, verify the launched
  version, and monitor sanitized pairing failures. Roll back by disabling the
  helper advertisement and withdrawing the installer; retain the vault and
  existing sealed credentials.

## Current deploy blockers

The repository currently has no signed, notarized macOS distribution, no
Fantasy Builder-owned launch protocol or server handoff transaction, and no
verified right to distribute the existing native callback integration. The
single successful Google trial did not verify refresh, restart or two-user
isolation. The current GitHub CLI credentials are invalid and the operator
account cannot SSH to the VM, so the pinned-release deployment steps cannot
be executed from this workspace. Do not advertise the CLI as an installed
background helper or set `LALIGA_HELPER_ENABLED=true` on this evidence.
