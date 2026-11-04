# Changelog

Notable changes to LaLiga Fantasy Builder are recorded here. Version 0.1.0
summarizes the application through 27 October 2026; it is the first changelog
entry, not a claim that every optional provider or deployment gate is complete.

## [Unreleased]

### Spanish and English

- Add Spanish and English application copy, structured football and Fantasy
  labels, and locale-aware dates, numbers and countdowns. Save the language
  preference and preserve open dialogs, drafts and pagination when switching.
- Keep language and light/dark controls inside the Options menu on mobile and
  desktop, removing the extra row of controls from the compact header.
- Add a globe-only language selector beside the theme control, with a localized
  accessible name, keyboard selection and a 44 × 44px target in both themes.
- Translate FutbolFantasy news headlines and injury prose into English through
  isolated browser readers. Keep source text available when translation fails.
- Complete market action, bid-limit, offer and release-clause messages; refine
  football terminology and use «pronóstico» for match weather forecasts.
- Consolidate equivalent dictionary entries while preserving fragment spacing,
  and resize value/form tooltips to contain translated content on narrow screens.

## [0.2.1] - 2026-11-03

### Weekly radar refresh

- Enable the Terraform-managed weekly refresh by default, keeping Wednesday
  07:10 Europe/Madrid scheduling with up to ten minutes of randomized delay.
  Installations can opt out with `radar_discovery_enabled = false`.
- Load public host configuration in the radar systemd service so Docker Compose
  receives the required `APP_DOMAIN`.
- Check that catalog, registry and audit files are nonempty and the captures
  directory exists before starting the weekly attempt, avoiding consumption of
  the weekly slot when those deployment inputs are missing.
- Update API and scraping configuration examples and document bootstrap,
  deployment and timer verification on an existing VM. Production activation
  still requires reviewed data, service configuration and Terraform/bootstrap;
  this release does not perform a live deployment.

### Release metadata

- Align Python package versions, runtime service versions, the scraper User-Agent
  and generated OpenAPI documents with v0.2.1.

## [0.2.0] - 2026-11-03

### Player performance profiles

- Added seven-axis performance radars for goalkeepers, centre-backs, full-backs,
  midfielders, wingers, and strikers, with an accessible metric table and
  responsive light and dark layouts.
- Place Performance profile inside Overview, below Fantasy outlook. Remove
  repeated player identity details and group provenance, dates, reference-sample
  limitations, and percentile guidance under Source and methodology.
- Pin radar requests and comparisons to 2026/27 and remove the season selector.
  Hide the subsection when no published profile exists, load profiles near the
  viewport, and preserve displayed data when a refresh fails.
- Validate comparison compatibility on the server and offer comparisons only
  when metric definitions and reference populations are verified.
- Show the player's current age in Overview when a birth date is available,
  calculating completed years using the current date in Europe/Madrid.

### Radar simplification

- Serve only pinned local publications; retire request-time mappings and reject
  legacy store configuration explicitly. Keep reviewed ingestion imports.
- Share derived publication views and extract weekly orchestration into a typed
  application service. Separate frontend queries, comparison UI and methodology.

### Radar data and operations

- Added authenticated radar API and CLI reads, validated response contracts,
  and a private, opt-in DataMB adapter with robots checks, rate limits, and
  restricted profile URLs.
- Added master-ID catalog inventory, versioned identity review, observed profile
  discovery, six-role metric audits, and explicit coverage and absence reasons.
- Added checkpointed ingestion, validation, immutable publication, provenance
  checks, reporting, and rollback. API reads use local publications without
  starting provider ingestion from the browser.
- Expanded discovery to all 20 LaLiga clubs for 2026/27. Removed the initial
  300-minute cutoff, restoring the 26 previously excluded players. The local
  publication verified on 3 November contains 333 players and 348 role snapshots;
  238 active-roster players remain unresolved. The latest review added 66 players;
  two observed profile links remain pending after returning HTTP 404.
- Added Terraform-managed weekly discovery on the existing VM for Wednesday
  at 07:10 Europe/Madrid, with read-only policy inputs, a durable attempt guard,
  and opt-in activation. Removed the recurring LLM task; local checks remain available.

- Removed the superseded two-club manifest, retired daily timer template,
  duplicate job environment example, and product preview route. Keep shared radar
  fixtures outside production source for contract and browser regression tests.

### Documentation and availability

- Updated API schemas, frontend guidance, deployment configuration, and radar
  runbooks. Removed superseded plans, temporary research, and pilot reports,
  consolidating current operational and release requirements.
- Aligned Python package metadata, runtime service versions, and generated
  OpenAPI documents with v0.2.0.
- Published datasets and reviewed captures remain outside Git and require durable
  storage configuration. Production timers remain disabled. Native DataMB
  comparisons remain unavailable until their reference population is verified;
  missing data is never replaced with invented values.

## [0.1.1] - 2026-11-01

### Lineup and planning

- Added squad filters for position, season Fantasy points, club, starter
  probability, form, and availability, with draft previews and explicit apply,
  cancel, and clear actions.
- Added current-form icons, season points, and starter-probability badges to
  squad cards. Load profiles in parallel and reveal the squad together once
  requests settle; pagination and swaps do not replay the entrance animation.
- Highlight empty editable lineup positions and eligible squad replacements.
  Highlight scorers and goalkeepers with a played clean sheet on fixture lineups.
- Explain fixture points with event counts, signed points, and DAZN ratings.
  Manager rankings show the active matchweek score alongside season totals,
  retaining the previous week until the next matchweek starts.
- Group player actions into Market, Details, and Lineup, fix clipped squad
  pagination borders, and keep standings names on one line.
- Show the next kickoff countdown once in the fixture panel.

### Market and visual system

- Enlarge footballer portraits and comparison rows, add manager avatars to
  sellers and owners, and identify LaLiga listings with a compact logo.
- Keep comparison details visible in labeled phone cards and horizontally
  scrollable tablet rows. Align yellow and orange signals across the interface.
- Replace the market expiry rail with a warning icon during the final minute.
- Treat omitted market bid counts as zero while preserving null or invalid
  counts as unavailable.

### LaLiga linking

- Added a guided macOS helper for linking a cloud account, with verified-account
  confirmation and a return to the website after pairing. Preserve existing
  native callback handlers instead of replacing another application's handler.
- Added optional desktop manual pairing using a copied native callback URL,
  server-held PKCE, and owner- and browser-bound state.
- Let users choose among enabled browser, manual, and helper methods. Refresh
  the website connection status on focus and offer an explicit connection check.
- Keep the interactive application sign-in window open during terminal account
  confirmation; an empty response repeats the prompt.

### Documentation and availability

- Updated linking setup, authentication contracts, release checks, cloud helper
  instructions, and frontend behavior documentation.
- Manual pairing and helper advertising remain disabled by default and require
  their documented live compatibility checks before deployment. Browser pairing
  still requires an approved HTTPS callback; an installed background helper
  remains planned work.
- The product gallery retains its dated 27 October captures; it does not depict
  every interface change in this version.

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
