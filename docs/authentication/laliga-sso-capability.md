# LaLiga SSO capability record

Recorded 25 October 2026. The installation owner reports that no approved
LaLiga web OAuth client or registered HTTPS callback is available yet.

| Phase 1 requirement | Current evidence |
| --- | --- |
| Approved web client, tenant, policy and scopes | Not supplied or verified |
| Exact registered HTTPS browser callback | Not available |
| Browser code exchange with PKCE | Not tested |
| Verified subject, issuer, audience and claims | Not captured |
| Read-only Fantasy profile access and refresh | Not tested |
| Google, Facebook or Apple preselection under the LaLiga policy | Not tested |

The existing configured `authredirect://com.lfp.laligafantasy` callback belongs
to native pairing. It does not establish a registered browser callback. The
application therefore exposes `laligaSso: false` in
`GET /auth/sign-in-options` and offers only configured direct providers and
username/email credentials. Existing authenticated LaLiga pairing remains
available after application sign-in.

The [SSO implementation plan](laliga-sso-implementation-plan.md) requires a
consented browser proof, sanitized token/profile findings and verified framework
integration before enabling anonymous LaLiga SSO. No production browser SSO
support is claimed by this record.

## Native helper to cloud

As of 27 October 2026, the repository has a connection-only macOS command,
fixed cloud destination, owner confirmation, and a capability-gated web screen.
An ordinary DNS and certificate-verified HTTPS HEAD request to
`https://fantasybuilder.es` returned HTTP 200 on 27 October 2026.
On the same date, a consented read-only `leagues-analysis` trial from the
owner's Mac reached the deployed origin without TLS overrides. Application
login succeeded in the helper's separate browser. Auth created a pairing;
the macOS helper captured the native return; the local PKCE exchange and cloud
completion returned successfully. The helper's read-only analysis exited zero.
Opening `/connect-laliga` in a production browser session for the same
application account went to the lineup, and that lineup loaded a league and
squad. No tokens, callback URL, or secrets were saved in this record.
After the trial, macOS Launch Services listed the helper app as the only
registered `authredirect` scheme claimant visible in its registry. The new
helper code checks registered claimants before registration and falls back
without replacing a different app. This observation does not prove ownership
or official support for LaLiga's native client registration.

The first attempt timed out because the user was viewing an already signed-in
`localhost:3000` tab rather than the helper's separate production browser.
That local tab uses local auth services and is not evidence of cloud linking.

The successful native-helper trial used Google sign-in. Facebook, Apple, and
other LaLiga sign-in methods have not been tested. Automated tests use synthetic
accounts and callbacks. An actual token refresh, service restart, and
second-user isolation remain unverified. The advertised helper
capability therefore defaults to off. This record does not establish ownership
of the existing native return URI or justify replacing another installed
application's handler. Enable the flag only after recording the remaining
sanitized results for the checks in the
[cloud helper plan](laliga-cloud-helper-implementation-plan.md).
