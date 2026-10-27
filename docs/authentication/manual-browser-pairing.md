# Manual desktop LaLiga pairing

`LALIGA_MANUAL_LINK_ENABLED=false` by default. This fallback needs no local
installation, but the user must copy a one-time native callback URL in desktop
DevTools. It does not silently capture a callback and is not a mobile flow.

## User journey

1. Sign in to Fantasy Builder and open `/connect-laliga`. Confirm the displayed
   application account, then choose **Start LaLiga sign-in**.
2. Keep the Fantasy Builder tab open. In the new LaLiga tab, open DevTools →
   Network, turn on **Preserve log**, and sign in with Google or another offered
   LaLiga method.
3. Find the canceled request beginning
   `authredirect://com.lfp.laligafantasy`, copy its **full URL**, and paste it
   into the original tab. Submit once, before the attempt expires.
4. Auth consumes the owner- and browser-bound state, exchanges the code with
   server-held PKCE, confirms the Fantasy manager and stores sealed tokens. The
   frontend re-reads `/laliga/connection` for the signed-in account and returns
   to `/` only when linked. Existing refresh-on-use handles later access; if the
   refresh grant fails permanently, repeat the manual flow.

The callback must stay out of email, query strings, screenshots and support
logs. The page holds it only in memory while the form is open. Cancellation,
account switching and expiry discard the current form. A failed exchange needs
a new attempt; a code is never exchanged twice.

## Server contract and security

- `POST /laliga/manual/start`: verified application JWT and exact frontend
  `Origin`; returns `{authorize_url, expires_at}` and sets an HttpOnly, Secure,
  SameSite=Lax cookie scoped to `/laliga/manual`.
- `POST /laliga/manual/complete`: same JWT owner, Origin and browser cookie;
  body `{callback}` (20–4096 characters); returns public connection status.
  Requests over 8192 bytes are rejected before JSON parsing without echoing
  submitted content.
- `DELETE /laliga/manual/pending`: cancels only that owner's attempt in that
  browser. `GET /laliga/link-options` advertises `manual_available` separately
  from the registered HTTPS browser callback and native helper.

Auth validates the exact native scheme, authority and path, rejects duplicate
query keys and malformed callbacks, then atomically consumes a live state only
when owner and browser proof match. A replacement attempt invalidates the old
state. Validation responses do not echo submitted values; access logs contain
only path/status. `/laliga/pairings/complete-redirect` cannot consume these
browser-bound states. Tokens and callback codes are not returned to the browser.

The normal `/laliga/login` HTTPS callback remains unavailable without an
actually registered HTTPS redirect URI. Reuse of LaLiga's native client for a
public website still needs an explicit suitability review before release.

## Release gate

Keep the flag off until the consented desktop live tests in
[release checks](release-checks.md) pass, including canceled callback capture,
read-only lookup, refresh, restart, two-account isolation and failure recovery.
Then enable the flag for a limited audience and retain flag rollback. No live
provider trial or production rollout was performed as part of this code change.

See [browser-only feasibility](browser-only-laliga-feasibility.md) for why an
automatic web callback requires a LaLiga-supported registration.
