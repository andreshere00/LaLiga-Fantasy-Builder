# Changelog

Notable changes to LaLiga Fantasy Builder are recorded here. Version 0.1.0
summarizes the application through 27 October 2026; it is the first changelog
entry, not a claim that every optional provider or deployment gate is complete.

## [0.1.0] - 2026-10-27

### Application and identity

- Introduced the React application with one frontend origin, responsive Lineup,
  Market, and Players navigation, light and dark themes, shared dialogs and
  fields, loading and error states, and keyboard-accessible controls.
- Replaced Keycloak and custom application sessions with Better Auth. Added
  username/email and password sign-in, registration, email verification,
  password recovery and reset, account settings, session management, and
  application JWT issuance. Google, Facebook, and Apple are supported when
  their provider credentials and callbacks are configured.
- Added branded verification and recovery email through authenticated SMTP,
  with Resend as the documented provider. Enforced password rules on the
  server and in registration/reset flows.
- Kept LaLiga authentication in a separate service with browser and native
  pairing, encrypted connection storage, bearer refresh, and private bearer
  exchange for authenticated API calls. Bound browser callbacks to the session
  that initiated pairing and hardened state, nonce, PKCE, and account isolation.

### Lineup and planning

- Added league selection, manager rankings, opponent-team views, current and
  historical lineups, formation editing, full-lineup save, squad paging, player
  actions, team value, and matchweek scores.
- Added the current/next matchweek panel with fixtures, results, club crests,
  Madrid-local kickoff times, optional stadium forecasts, and independent
  fixture navigation.
- Added a LALIGA club standings widget with completed-match totals and form,
  reconciliation against the official table, refresh and failure states, and
  an optional API-Football source.
- Added the authenticated, read-only lineup builder. It evaluates owned,
  market, and opponent players, mandatory players, formations, budget and
  deadline constraints, and produces ranked starting XIs, explanations,
  projections, and ordered trade plans. The browser streams build progress and
  can apply a recommendation as a local draft; acquisitions require separate
  manual confirmation.

### Market and players

- Added the league market with search, column filters, form history, player
  availability, value changes, seal countdowns, balance and debt guidance,
  bid counts, active bids, and projected spending.
- Added user-confirmed bidding, bid modification/cancellation, listing
  withdrawal and sale actions, direct offers, received-offer review and
  accept/reject actions, and release-clause purchase flows with eligibility
  and lock explanations.
- Added the player catalog with search, filtering, pagination, ownership,
  favorites, recent form, market actions, and responsive rows.
- Added player profiles that combine Fantasy catalog data with fixture form,
  per-match averages, market-value history, recent/upcoming matches, weather,
  news, injuries, and availability. Partial stat-source failures retain
  available sections and identify failed segments.

### Services and contracts

- Added separate API domains for leagues, teams, players, calendar, market,
  buyout, standings, and lineup recommendations, with generated OpenAPI and
  endpoint-schema documentation.
- Added a private scraping service and offline parser for FutbolFantasy player
  profiles and match data, plus official standings extraction. Scraping routes
  use a service token, respect robots and rate limits, and hold no LaLiga
  credentials.
- Added read-only analysis CLIs and browser-session flows for supported
  domains. Automated flows do not place bids, pay clauses, activate shields,
  or save lineups.
- Enforced Pydantic and Zod validation across HTTP boundaries, verified JWT
  subject authorization, encoded upstream path segments, explicit write
  schemas, and fail-closed handling of unexpected upstream payloads.

### Operations and documentation

- Added Docker Compose development and HTTPS deployment configurations,
  separate identity and vault databases, and a cost-focused Google Cloud
  Terraform template with networking, secrets, backups, and image deployment.
- Split CI into test, build, and deploy stages and added image publishing after
  successful main-branch builds.
- Added service, API, architecture, authentication, and frontend guides. The
  product gallery contains ten browser captures from a signed-in application
  session, covering five views in both themes.

### Availability notes

- Direct social providers require their own configured credentials and callback
  registrations. Browser LaLiga linking depends on the approved redirect URI;
  the local cloud helper and LaLiga SSO flows remain proposals.
- The default standings mode covers completed matches. Live provider coverage
  and external release checks remain subject to provider access and validation.
