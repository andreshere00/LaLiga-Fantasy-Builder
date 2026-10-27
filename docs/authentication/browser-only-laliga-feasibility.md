# Browser-only LaLiga linking without a local helper

Research recorded 27 October 2026. This is an assessment of publicly visible
capabilities, not a production authorization or a successful browser login.

## What the current integration can prove

The configured LaLiga policy uses an Azure AD B2C authorization-code flow with
PKCE. Its production client ID is paired in this repository with the native
`authredirect://com.lfp.laligafantasy` return URI. A consented macOS trial
received that callback and completed a read-only Fantasy lookup. No registered
HTTPS return URI for `fantasybuilder.es` has been demonstrated.

LaLiga's [public OpenID configuration](https://login.laliga.es/laligadspprob2c.onmicrosoft.com/v2.0/.well-known/openid-configuration?p=B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN)
was fetched on 27 October 2026. It lists authorization, token, logout and JWKS
endpoints, and `query`, `fragment` and `form_post` response modes. It does not
list a device-authorization endpoint. Its `claims_supported` includes a field
named `device_code`; that field is **not** evidence that the OAuth device grant
is enabled. Public discovery does not disclose which redirect URIs are
registered for a particular client.

Microsoft's [B2C authorization-code documentation](https://learn.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow)
requires the request's `redirect_uri` to match one registered for the client.
The [redirect-URI guidance](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
explains why an unregistered website cannot receive the code. Adding a proxy,
another cloud service, DNS record, CORS header or frontend route does not
change the provider's client registration. A native private-use URI is delivered
to an OS application, as described in [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252#section-7.1).

## Alternatives examined

| Approach | Result for a normal browser-only production flow |
| --- | --- |
| Reuse the native `authredirect://` callback on the cloud VM | The browser dispatches that scheme on the user's device. The VM does not receive it. A browser page cannot register that arbitrary scheme through `navigator.registerProtocolHandler`; the [web API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/registerProtocolHandler) limits custom schemes to `web+...`. |
| Reuse LaLiga's own website session or its HTTPS callback | The website's callback and cookies are on LaLiga's origin. Fantasy Builder cannot read another origin's cookie, page or popup URL under the [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy). A LaLiga-operated integration would have to expose a supported handoff. |
| Add a device-code or QR broker | The checked policy metadata has no device-authorization endpoint, and [Microsoft's MSAL guidance](https://learn.microsoft.com/en-us/entra/msal/dotnet/acquiring-tokens/desktop-mobile/device-code-flow) says Azure AD B2C does not support device-code flow. A QR can carry an authorization URL or a Fantasy Builder pairing ticket, but the phone still needs a supported way to return LaLiga's grant to our service. Verify an explicit LaLiga-supported endpoint before designing around it. |
| Collect LaLiga credentials on our server (ROPC) | This would handle passwords and still exclude the tested Google sign-in: Microsoft's [B2C ROPC guidance](https://learn.microsoft.com/en-us/azure/active-directory-b2c/configure-ropc) says federated providers such as Google and Facebook are unsupported. It also describes server-to-server use as unsupported. |
| Stream or automate a browser hosted on our server | Users would enter provider credentials into a browser controlled by this service. Google [disallows OAuth in developer-controlled embedded user agents](https://developers.google.com/identity/protocols/oauth2/policies). This adds credential-handling and reliability problems and is not a supported substitute for a callback. |
| Ask the user to copy a native callback URL or token into the website | Two community projects demonstrate manual DevTools copying. It requires users to handle authorization material and does not provide the requested automatic browser experience. Treat it as a separate, explicitly manual design, not a substitute for the registered callback. |
| Authenticate directly with Google in Fantasy Builder | This can sign the user into **this** application, but it does not issue a LaLiga Fantasy bearer. It cannot replace the LaLiga account connection. |

### Loopback server and automated-browser proposals

A temporary `http://127.0.0.1:<port>/callback` server is a valid native-app
OAuth pattern only when that loopback redirect is registered for the selected
client. The current LaLiga client is known here with `authredirect://...`; no
loopback registration has been verified. Changing the request parameter alone
does not register a new URI. If the listener runs on a user's device, it is
still a local helper. If it runs on the VM, `localhost` in the user's normal
browser points to the user's device, not to the VM. See Microsoft's
[exact redirect rule](https://learn.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow)
and [RFC 8252's loopback guidance](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3).

Playwright can observe a custom-scheme navigation inside the **browser process
it controls**. This repository's development fallback listens to several
events, including requests, failed requests, frame navigation, response
`Location` and Chromium CDP events, because one `page.on("request")` listener
alone is not a dependable capture contract. Running that browser on each Mac
requires local software; running it on the VM would require a remote
interactive-browser service and would put provider sign-in into a browser
controlled by this application. `fantasybot` does not use Playwright: its
documented login copies the callback from DevTools by hand.

## Community implementations checked

- [Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp/tree/21fcca06221ef0133870dd19bf1ded1d45020097)
  is an Electron desktop app. Its [main-process OAuth handler](https://github.com/Externoak/LaLigaApp/blob/21fcca06221ef0133870dd19bf1ded1d45020097/electron/ipc-handlers.js#L73-L205)
  opens an Electron `BrowserWindow`, intercepts navigation to
  `authredirect://com.lfp.laligafantasy`, validates state and returns a code to
  its renderer for PKCE exchange. Its [web UI](https://github.com/Externoak/LaLigaApp/blob/21fcca06221ef0133870dd19bf1ded1d45020097/src/components/Auth/Login.js#L549-L612)
  explicitly hides that one-click path outside Electron. The browser fallback
  asks the user to copy a complete token response from LaLiga's DevTools
  Network panel and paste it. Its [mobile QR flow](https://github.com/Externoak/LaLigaApp/blob/21fcca06221ef0133870dd19bf1ded1d45020097/server/pairing.js#L3-L69)
  transfers already obtained tokens from a running PC server over the LAN;
  it does not authenticate a fresh user through a browser-only OAuth flow.
- [jonortega20/fantasybot](https://github.com/jonortega20/fantasybot/tree/31de2bc57a529cfe9e8ea7d2c195b41d8a0f99ec)
  uses the same native callback. Its [README](https://github.com/jonortega20/fantasybot/blob/31de2bc57a529cfe9e8ea7d2c195b41d8a0f99ec/README.md#L9-L22)
  instructs users to copy the canceled `authredirect://` request from browser
  DevTools. Its [auth code](https://github.com/jonortega20/fantasybot/blob/31de2bc57a529cfe9e8ea7d2c195b41d8a0f99ec/fantasybot/auth.py#L158-L179)
  stores a PKCE verifier locally, then exchanges the pasted code for tokens.
  This is a two-step command-line login, not an automatic web callback.
- [DanielTomaro13/football-invincibles/LALIGA_API.md](https://github.com/DanielTomaro13/football-invincibles/blob/main/LALIGA_API.md)
  documents `apim.laliga.com/public-service` for standings, matches, club
  squads and Opta player statistics from the public LaLiga **website**. It
  describes a key present in the website's runtime configuration, rather than
  an account OAuth token. Those endpoints do not expose the user's LaLiga
  **Fantasy** leagues, roster or market operations. They may help public
  football-data features, but cannot link a Fantasy account.

The manual token response used by LaLigaApp is not directly compatible with
this application's existing one-time pairing: the server checks a nonce bound
to its own challenge, whereas an independently completed login on LaLiga's
website has a different nonce. A manual-import feature would need a separate
owner-scoped consent and validation design, issuer/audience/client allowlists,
profile verification, secure token transfer and refresh testing. It could
offer no-install linking for consenting users, but it would still require
DevTools and explicit paste rather than an automatic return.

### Manual no-install fallback

The implemented, disabled-by-default flow and its release gates are in
the [manual browser pairing guide](manual-browser-pairing.md).

This manual variant follows fantasybot's **code** capture rather
than LaLigaApp's complete token-response paste:

1. A signed-in Fantasy Builder browser requests an owner-bound, short-lived
   pairing. Auth stores the PKCE verifier, state, nonce and browser proof on
   the server, then returns the fixed native-client authorize URL.
2. The user signs in in their ordinary browser, copies the resulting
   `authredirect://` request URL from DevTools and pastes it into a form on
   the original Fantasy Builder tab. No local program is required.
3. The form POSTs the URL body over HTTPS. Auth checks the same application
   session and browser proof, exact native URI, state, expiry and one-time
   challenge. Auth exchanges the code with the held verifier, validates the
   signed LaLiga token and Fantasy profile, seals credentials under the JWT
   `sub`, then returns a connection status. Codes and tokens never appear in
   application URLs, logs or local storage.

The implementation reuses the existing vault and account binding with a
server-held transaction and explicit UI. It still needs a consented browser test on
each supported platform to confirm that DevTools exposes the entire callback,
that Google sign-in completes, and that the provider accepts the flow. Its
manual steps and dependence on the native client's registration remain
material release limitations. It returns to the application automatically
after the user pastes and submits the callback, but cannot capture the first
callback automatically.

## Feasible decision

There is no verified, fully automatic, browser-only LaLiga linking path from
the current native-client configuration. The architecture that meets an
**automatic** “website and ordinary browser, no local install” journey needs
a LaLiga-supported web or device/account-linking flow whose completion is
delivered to this service.
That need not mean a new Google/Facebook client owned by Fantasy Builder:
LaLiga can keep its social-provider integrations. It does require an upstream
capability or an existing handoff that LaLiga explicitly makes available to
this website.

If such a flow becomes available, implement the existing
[LaLiga SSO plan](laliga-sso-implementation-plan.md): a server-held PKCE
transaction, exact approved callback, verified identity, owner binding,
encrypted vault completion and automatic return to the app. Until then, keep
fully automatic browser linking unavailable and allow public data browsing.
The manual fallback remains feature-disabled until its release gate passes. The macOS
helper is the separate technically demonstrated path for linking a consenting
user, with its own distribution and callback-ownership gates.
