# Authentication endpoints

Use the shared frontend origin (port 3000). Python delegation schemas are in
[auth OpenAPI](../../backend/auth/openapi.json). Better Auth's configured routes
are provided by its pinned plugins and are separate from Python OpenAPI.

| Method | Path | Credential / behavior |
| --- | --- | --- |
| GET | `/auth/sign-in-options` | Public availability flags for credential, direct provider and LaLiga SSO choices; no secrets |
| POST | `/auth/sign-up/email` | Name, email, username, password; verification email |
| POST | `/auth/sign-in/email` | Verified email and password |
| POST | `/auth/sign-in/username` | Verified credential account, username and password |
| POST | `/auth/sign-in/social` | Configured Google, Facebook or Apple provider; framework state/PKCE |
| GET/POST | `/auth/callback/{provider}` | Provider callback proof; Apple supports form POST |
| GET | `/auth/get-session` | Better Auth session cookie; public user and session |
| POST | `/auth/sign-out` | Better Auth session and origin protections |
| GET | `/auth/token` | Session cookie; `{token}` application JWT |
| GET | `/auth/jwks` | Public Ed25519 verification keys |
| POST | `/auth/send-verification-email` | Generic verification delivery response |
| POST | `/auth/email-otp/verify-email` | Email and single-use verification code |
| POST | `/auth/request-password-reset` | Generic recovery response |
| POST | `/auth/reset-password` | Single-use reset token and new password |
| POST | `/auth/change-password` | Session, current password, new password |
| GET | `/auth/list-accounts` | Session; linked methods |
| POST | `/auth/link-social` | Recent session plus provider proof |
| POST | `/auth/unlink-account` | Recent session; requires another usable method |
| POST | `/laliga/login` | Application JWT; `{authorize_url}` when a registered HTTPS callback is configured, otherwise 503 `browser_unavailable` |
| GET | `/laliga/callback` | Registered HTTPS authorization callback; one-time state/PKCE proof, then fixed frontend redirect |
| GET/DELETE | `/laliga/connection` | Application JWT; connection status / unlink |
| POST | `/laliga/pairings` | Application JWT; one-time helper challenge |
| DELETE | `/laliga/pairings` | Application JWT; cancel this owner's challenges |
| POST | `/laliga/pairings/complete-redirect` | `{callback}`; native state/PKCE proof |
| POST | `/laliga/pairings/{id}/complete` | Existing `{secret, token_response}` contract |
| GET | `/internal/laliga/bearer` | Private service token + user JWT; unchanged bearer contract |
| POST | `/internal/laliga/retry-after-unauthorized` | Private service token + user JWT |

Provider token retrieval, OTP sign-in and alternate OTP recovery endpoints are
intentionally disabled. Health is available at `/health/live` and `/health/ready`
on each service's private origin (Python also retains `/health`).
