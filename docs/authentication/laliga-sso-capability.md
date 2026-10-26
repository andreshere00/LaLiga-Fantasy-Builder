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
