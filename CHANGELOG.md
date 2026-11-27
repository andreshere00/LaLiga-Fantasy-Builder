# Changelog

Notable changes to LaLiga Fantasy Builder are recorded here. Version 0.1.0
summarizes the application through 27 October 2026; it is the first changelog
entry, not a claim that every optional provider or deployment gate is complete.

## [Unreleased]

### Frontend

- Cancelling a bid now asks for confirmation (**Cancel bid** / **Keep bid**) from every row menu
  and from My bids, and the success toast says "Bid cancelled" instead of "Bid updated".
- Bid dialogs show your balance and the listing's time left; the release-clause dialog shows
  your balance before and after paying and says the payment can't be undone.
- Loading the last saved or original lineup asks before discarding unsaved lineup edits.
- **List all my players…** lists the players (with market value) it is about to put on the
  market instead of only their count.
- Auto-market rule amounts use thousands separators, and buy rules state the maximum bid
  instead of leaving you to add 20% of the squad value to your cash.
- Rejecting a received offer now asks for inline confirmation, like accepting one.
- Cancelling an auto-market rule now asks for inline confirmation and shows its progress.
- Unlinking a sign-in provider on the account page now asks for confirmation.
- Squad and lineup-builder sale dialogs stay open while a sale is in flight, start on the safe
  choice for withdrawals and immediate sales, show a specific progress label, translate listing
  errors and label the own-listing actions **Modify listing** / **Withdraw listing**.
- Spanish: the balance help, release-clause placeholders, form ratings and the Players "Free
  Agent" owner (display, filter and search) are now translated; the minimum bid hint says
  "importe" instead of "saldo", and balance copy uses "pujas" for bids.
- Spanish: sale, withdrawal, offer and result-count sentences are translated as whole
  sentences (fixing word order such as "Vender … para …"); player market dates use the
  reader's locale instead of ISO dates; the match countdown, radar season, "Not published",
  "News article" and "No email" are translated.
- Sign-in, registration and account pages no longer show library or upstream error text; they
  show translated, actionable messages instead.

### Identity

- Add `uv run poe seed-dev-user`, which creates or resets a verified mock user for local
  development without SMTP. It only runs against a loopback database (the Compose
  `postgres` host needs `ALLOW_DEV_SEED=1`), validates the password policy, and resets an
  existing account only if it is `dev@example.com` or `DEV_USER_FORCE=1` is set. It also
  refuses database URLs that override the host (`host`, `hostaddr` or several hosts).

### Infrastructure

- Add `infra/config-schema.json`, a locator that maps every secret to its local dotenv
  file, Secret Manager payload, consuming services and provider console, with a test that
  keeps it aligned with the example and local dotenv templates and rejects credential-like
  values. It holds no secret values.

## [0.7.0] - 2026-11-24

### Auto-market

- Worker: a rate-limited write keeps its rule armed, unexpected write errors fail the rule once
  instead of leaving it running, a rejected service token degrades the league instead of asking
  users to relink, and buy rules skip closed listings to bid on an open one.
- Rules: an edit that clashes with another live rule returns 409, re-saving a rule resumes a
  paused league, and cancelling no longer fails when the unused grant cannot be revoked.
- Compose: only the worker requires `AUTO_MARKET_SERVICE_TOKEN`; Auth starts without it.
- Market screen: when a polled rule turns `listed` or `executed`, reload the league's market,
  offers, squad, lineup and money. The worker writes in the background, so its listings were
  invisible until a manual page reload.
- Fix sell rules failing with `left_squad` when the league player card omits `playerTeamId`: the
  worker now confirms the squad entry on the roster instead of comparing it with `None`.
- Start `fantasy-auto-market-worker` from `scripts/dev-local.sh` (and stop it in
  `dev-clean.sh`): without it, armed rules were never executed in local development.
- Add list-only and list-now sell rules (`triggerKind: none`, `listNow`, migration
  `0004_auto_market_list_now.sql`): the worker lists a player on the next pass without
  waiting for its threshold, and a list-only rule never accepts an offer. A player that is
  already on the market is adopted instead of listed twice.
- Market screen: add an **Auto market** sheet (with a cycle icon) (rules grouped by selling, buying and history),
  **Auto-buy…** in each row's Options menu, and an arm dialog with a live preview of the
  threshold. Arming names the effect and asks for the spending cap on buys. English and
  Spanish copy included. See [frontend](docs/frontend.md#automatic-rules).
- Auto market: sort the sheet by concern. *Selling* holds the player list, **List all my players…**, the sell favorites and the active auto-sells; *Buying* holds the player search, the buy favorites and the active auto-buys; *History* follows. Each section says when it has no active rules.
- Auto market: show each player's photo, club badge, FSYP and market value when choosing a player to sell.
- Auto market: add **List all my players…** to put every squad player that is not on the market yet there at once (players already listed are left alone), and show the player's photo and club in the arm dialog. Players are only listed by default; one general rule (sell to an offer at a gain, or list when each value rises) can be applied to all of them, and any single player can have their own. When none of the rules can be armed, the message now reflects the real failure instead of always saying the rule was rejected.
- Auto market: the sell arm dialog can list a player right away and either never sell automatically or accept an offer from a gain or amount.
- Auto market: search any player to auto-buy them even when they are not on the market (the rule waits and bids only within the target value), and add the **Auto market** button to the Players page.
- Market screen: group **Favorites**, **Auto market** and **My bids** into one **Market options** menu beside Offers, keeping the balance on the same line on desktop and the two buttons side by side on phones.
- Auto market: add **Auto-buy favorites…** and **Auto-sell favorites…** to arm rules for several favorite players at once, at their market value or at an amount (no backend change: they use absolute-trigger rules).
- Auto market: flag the feature with **New!** until it is opened once in this browser.
- Auto market: list players already on the market (or with an offer) in the sell picker and adopt their listing, and relist a player automatically when its listing lapses without an accepted offer instead of closing the rule.

- Auth issues a separate, expiring `auto_market_write` delegation (migration 0007) that a
  user JWT creates and revokes per league. Redemption needs the new
  `AUTO_MARKET_SERVICE_TOKEN`, which must differ from the scouting and ordinary service
  tokens. Unlinking, re-pairing and connection changes revoke these grants.
- Add the `/auto-market` API: users arm one-shot sell and buy rules with a relative or
  absolute market-value threshold, priced at the threshold or at market value, and stored
  in application PostgreSQL (migration `0002_auto_market.sql`). Rules, their derived
  threshold and attempt history are readable, replaceable and cancellable; cancelling the
  last live rule revokes the write delegation. See
  [automatic market rules](docs/api/auto-market/README.md).
- Add the auto-market executor: a pass lists a player when its value reaches a sell
  threshold and accepts the best pending offer at or above a stored floor, bids on market
  listings, and pays unlocked, unshielded release clauses, within `maxSpend`, cash, bidding
  and squad-size limits. Each write is claimed first and never retried.
- Add the `fantasy-auto-market-worker` process and `auto-market-worker` Compose service
  (local and Google Cloud). The new `AUTO_MARKET_SERVICE_TOKEN` is provisioned to Auth and the
  worker only; existing installations must add it before upgrading.
- Document the policy change: arming an auto-market rule is the user's confirmation, and
  its worker is the only background process allowed to write. Scouting, CLIs and
  browser-session flows remain read-only.

### Versioning

- Set the application, API, auth and scraping packages, their OpenAPI documents and the
  scraper user agent to 0.7.0.

## [0.6.2] - 2026-11-17

### Deployment

- Fix image publishing failing with `No valid published digest` after a successful push.
  `scripts/publish-images.sh` read the first `RepoDigests` entry, which is not always the
  Artifact Registry one. It now selects the entry for the target registry path and falls
  back to the digest printed by `docker push`. It still fails closed and leaves no
  `release-images.env` unless all five digests are valid.

### Versioning

- Set the application, API, auth and scraping packages, their OpenAPI documents and the
  scraper user agent to 0.6.2.

## [0.6.1] - 2026-11-13

### Lineup builder

- Plans may end in debt, down to 20% of the final squad value (rules version
  `2026-11-12.1`). Each plan reports `funding_status` (funded, within the debt limit,
  or needing more sales), its `final_floor`, any `shortfall` and `listing_suggestions`.
- Add a **Non-negative balance at kickoff** option. Plans then sell until the balance
  reaches 0, crediting the highest pending offer at its amount (including offers below
  market value) and, with the advanced **immediate sale** option, selling at half the
  market value for the remaining shortfall. When that is not enough, plans list players
  to put on the market; listing money is never counted as cash. Starters are never sold
  or listed. The new request fields are validated against their prerequisite (422
  otherwise); API and CLI defaults are unchanged.
- Suggest bid amounts: the market value, plus 1 € when other managers have bid, or the
  advanced **Maximum profitable bid** from 14-day market momentum. A bid below the
  minimum return is not planned and the build reports `bid_below_min_return`; incomplete
  history keeps the default bid. The bid dialog starts from the suggestion, and clause
  steps show a conditional direct offer that never funds a plan.
- Result cards offer **Accept offer**, **Sell now** and **List for sale** confirmations,
  one per action. **Use as draft** no longer depends on cash, since setting a lineup costs
  nothing; a negative balance only shows a note.
- Purchase and sale recommendations start checked in the builder dialog, and the options
  are grouped into Purchases, Sales and Balance. External starters must also outscore the
  owned player they replace.
- A forecast for the target round now takes precedence over an ongoing injury in the
  injury history. Without such a forecast, an ongoing injury still excludes the player.
- Fix a failed accept, sale or listing showing as confirmed in the results, which hid
  its button and the retry. Accept a decimal comma in **Minimum return (%)**.
- Fix a suggested bid's return rate serializing in exponent form, which the browser
  rejected as an invalid response. See the [lineup builder](docs/api/lineup-builder.md).

### Versioning

- Set the application, API, auth and scraping packages, their OpenAPI documents and the
  scraper user agent to 0.6.1.

## [0.6.0] - 2026-11-11

### Frontend UX pass

- Link names across the app: club names and crests, player names, bid sellers, managers,
  positions and a club's squad now open their Teams, Players or Lineup views through shared
  `ClubLink`, `PlayerLink` and `ManagerLink` components. A crest shared by two clubs
  resolves to neither. See [Linked data](docs/frontend.md).
- Group the Lineup fixture matches by day, each day with its own heading and list, mark the
  next match, put the kickoff time first on the cards and move the matchweek navigator to the
  panel's right edge. The list slides in the direction of the matchweek change.
- Add icons to the section tabs, swap the Players and Teams icons and group the mobile options
  menu into preferences, league and account. A persistent alerts bell opens the scouting
  dialog on the current page; signed-out visits drop a stale `?scouting=` link and the dialog
  returns focus to its opener.
- Show the availability column filter as an accessible checkbox list with hints and let the
  squad filter adapt to phone, iPad and Mac; a group is highlighted by its selection, not by
  its translated text. Redesign the player option dialogs with a team page entry and mark your
  own listed players on the squad cards.
- Fit the Players, Market and squad lists on tablets and phones: three players per row and
  nine at a time on narrow screens, compact fixture cards, a reworked Market top panel with
  the balance first and a shared Teams section tab bar.
- Load Market, Players, Teams and player details on demand and warm their code and first
  read-only requests on hover, focus or touch. Prefetch and screens share one `staleTime`, so
  hovering never refetches fresh data. Content fades in on section change and dialogs and
  sheets animate with shared `--fb-motion-*` tokens, all zeroed under reduced motion.
- Open the Teams hierarchy list when its `#team-hierarchy` link is followed while the section
  is already mounted.

### Lineup builder

- Generate lineups when the estimated balance is already negative. The trade planner keeps
  each sale and purchase step at or above `min(starting balance, -20% of squad value)`, so a
  plan that does not worsen a deficit already past the debt limit is accepted, while purchases
  still need `market value <= cash + 20% of squad value`. See the
  [lineup builder](docs/api/lineup-builder.md).

### Versioning

- Set the application, API, auth and scraping packages, their OpenAPI documents and the
  scraper user agent to 0.6.0.

## [0.5.0] - 2026-11-10

### Teams

- Add a **Teams** tab (`/teams`, `/teams/{clubId}`) with one dossier per current LaLiga
  club: a crest strip to switch clubs, league position and points, and sticky
  Performance, Players, Lineup and News & Injuries sections. The club and the
  `section`, `competition` and `window` filters live in the URL.
- Performance shows wins, draws, losses, W/D/L form chips, the home/away split and goals
  for a competition (National league, European, Domestic cup, Other) over the last 5, 10,
  20 or whole-season matches, beside previous and upcoming matches with competition
  logos, linked clubs and a highlighted next match.
- Players shows the top three MVPs by FSYP with photo, age, form, last five LaLiga points,
  starter likelihood and radar, a sortable squad table of LaLiga season totals that folds
  players without minutes, and a Hierarchy levels dialog.
- Lineup shows the predicted XI on the Lineup pitch with form and FSYP on each token, a
  coach report, collapsible alternatives with hierarchy, and a starter dialog with a radar,
  the last five matches and market buttons.
- News & Injuries merges the club news feed and injured players. Known Spanish wording is
  translated from local maps; other text uses on-demand translation.
- Describe each widget with an About line, show a pulse ring and per-section skeletons
  while a dossier loads, and announce a failed club index or dossier instead of drawing
  an empty page. Phones get equal-width section tabs and icon-only competition filters.
- Add the read-only clubs API (`GET /clubs`, `/clubs/{club_id}` and
  `/clubs/{club_id}/roster-stats`) and private scraping routes for the club page and the
  full capped news changelog. Cup and European matches take their venue from the club's
  own printed name, and unrecognised competitions stay in the Other group.
  See the [Clubs API](docs/api/clubs/README.md).
- Refresh the README and frontend gallery with sixteen captures of Lineup, Market,
  Players, Teams, player details and the lineup builder in both themes.

## [0.4.0] - 2026-11-05

### Favorites and scouting

- Confirm favorite saves and removals with localized success toasts after persistence;
  preserve clear error and partial alert-activation feedback.

- Align offer and release-clause indicators in fixed slots across Market and Players
  rows. Stack notification and clause indicators in one column within the name
  field and vertically center the bookmark and name alongside them.

- Align 44px row bookmarks before player names in Market and Players; highlight
  saved player portraits with `#FFC2BF` without tinting whole rows. Keep toolbar
  labels on one line and wrap complete destination buttons on narrow screens.
- Make notification close controls usable with touch, mouse and keyboard; use
  compact body text and keep the notification stack above mobile navigation.
- Update setup and infrastructure upgrade instructions for the app database,
  shared-image worker, runtime secrets and three-database backup/recovery sets.

- Compact favorite cards with grouped market/clause status, recent form badges and
  collapsible alert settings that keep the saved configuration visible. Add inline
  save errors and consistent keyboard, touch and theme styling.
- Accept authenticated league responses that omit the optional manager block when
  enabling scouting. Resolve ownership from the caller's roster so own sales remain
  excluded, and stop stale host workers during development restarts.

- Persist favorite players across devices and share bookmarks across Market, Players
  and player details. Import existing device favorites without enabling alerts.
- Add a shared Favorites/Alerts sheet with basic player information, search, filters,
  per-league settings and return navigation that preserves browsing context.
- Monitor official and rival listings and clause unlocks with the website closed.
  Configure advance warnings at 1, 6 or 24 hours; keep a persistent in-app inbox with
  unread counts and explicit read actions.
- Add isolated PostgreSQL app storage, revocable Auth delegations, a separate read-only
  worker, account cleanup, CLI reads and backups for the new database. Existing volumes
  need app database provisioning and the new runtime secrets before deployment.

### Development deployment

- Automatically activate published main-branch images on the development VM
  through a separate federated deployment identity and IAP. Preserve runtime
  secrets, serialize deployments, skip superseded commits, and check HTTPS after
  the existing deployment helper completes its container health checks.

## [0.3.0] - 2026-11-04

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
- Use explicit translation keys and parameters for complete messages and counts.
  Preserve club/player/manager identities, translate existing notifications when
  switching languages, and simplify isolated prose readers to return text only.
- Resize value/form tooltips to contain translated content on narrow screens.

### Documentation and release metadata

- Document language selection, explicit message keys, locale-aware formatting,
  isolated prose translation, source fallback and localization validation.
- Align Python package versions, runtime service versions, the scraper User-Agent
  and generated OpenAPI documents with v0.3.0.
- Product gallery captures remain dated 27 October and do not show the new
  language controls. English scraped prose translation requires access to the
  external translation service; failed requests preserve the Spanish source.

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
