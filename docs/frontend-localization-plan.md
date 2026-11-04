# Spanish and English implementation plan

Status: implemented on 4 November 2026. The sections below preserve the design
proposal; the delivered choices are recorded here where they differ:

- i18next uses bundled literal-source catalogs (`src/i18n/en.json`, `es.json`)
  and a React external-store hook. Catalog keys and interpolation parameters have
  parity tests. The Spanish catalog was drafted offline using Argos Translate;
  navigation, football terms and interpolation templates received explicit
  corrections. Further editorial review of long help/error copy is welcome.
- The header trigger displays only a globe in a 44 × 44px target, with a
  localized accessible name and hover title. Native language names and the
  selected option remain visible in the popup. Keyboard selection restores
  focus to the trigger.
- The vendor runs in opaque `sandbox="allow-scripts"` reader documents, one per
  visible prose block. No GTranslate code runs in the authenticated app window.
  Plain source text crosses a source/channel-validated message boundary; results
  are held only in component state and rendered by React. Offscreen blocks defer
  loading until they approach the viewport. Source restoration unmounts readers.
- Whole-euro input accepts either strictly validated thousands separator, so a
  saved edit remains numerically identical when the selected language changes.
- Optional generated builder prose is identified separately as its original
  English explanation; structured reasons and scores use local translations.
- Real CDN/library Spanish-to-English translation was verified in Chromium with
  fictional public text in the opaque sandbox. CI uses a mocked vendor; the real
  service check is opt-in with `LFB_LIVE_TRANSLATION=1`.

## Validation completed

- `bun run build` and `bun run lint`: passed.
- Vitest: 90 files, 759 tests passed.
- Browser checks: ES/EN at 375/800/1440px in both themes, saved-language reload,
  independent history pagination across switching, blocked-vendor recovery,
  market bid reconciliation, player catalog ownership/actions, lineup builder
  drafts, news/injury keyboard pagination, and lineup toolbar layouts passed.
- Value tooltip bounds and translated market guidance were checked in
  Spanish and English at 375/1440px in both themes, including the locked-clause
  explanation and countdown. The globe control was checked at 375/800/1440px
  in both themes for keyboard selection, focus restoration and persistence.
- The opt-in real GTranslate sandbox smoke passed using fictional public prose.
- The API and scraping schemas were unchanged; no live Fantasy writes or
  deployment were performed.

## Outcome and scope

Support exactly two languages: Spanish (`es`, formatting locale `es-ES`) and
English (`en`, formatting locale `en-GB`). Use one language selector immediately
to the left of the dark/light control in the main header.

Use two translation paths:

1. Bundled, reviewed translation dictionaries for application copy and structured
   data from Weather, LALIGA, lineup, market, and player screens. This path has
   no translation service dependency at runtime.
2. GTranslate Free for the Spanish prose already returned by the FutbolFantasy
   scraper: injury descriptions and news headlines. Spanish displays the source
   text; English requests automatic Spanish-to-English translation.

The project is intended to remain personal and noncommercial. GTranslate's
[current terms](https://gtranslate.io/terms) exclude commercial or
revenue-generating use of its free version. Its [free plan](https://gtranslate.io/)
does not include translation editing or translated-page search indexing.

This is browser-side translation of the scraped text displayed in the app.
It does not add English strings to the scraper's stored records or API responses.

## Current implementation and consequences

| Existing area | Observation | Planned change |
| --- | --- | --- |
| `frontend/src/features/shell/Header.tsx` | Theme control is first in the actions panel; small screens collapse that panel into Options. | Add a shared language/theme group with language first; keep the pair visible in the mobile header. |
| `frontend/src/main.tsx`, `frontend/index.html` | Theme initializes before rendering; document language is fixed to English. | Initialize language before rendering too; update the document language when the user switches. |
| `frontend/src/components/weather.ts`, `features/players/playerDetailWidgets.ts` | Conditions and unavailable reasons already map from codes to English labels. | Map codes to translation keys; retain current weather semantics and icon selection. |
| `frontend/src/api/format.ts` | Money display and input parsing use Spanish separators. | Introduce locale-aware formatters and explicitly paired amount parsers. |
| `frontend/src/features/players/playerDetailFormat.ts` | Injury dates and durations include hard-coded Spanish; other date helpers use English. | Consolidate date, count, duration, and plural formatting. |
| `frontend/src/features/players/PlayerFantasySection.tsx` | News and injury history each paginate five records independently. | Preserve pagination; isolate only headline and diagnosis text for GTranslate. |
| `frontend/src/features/players/PlayerDetailPage.tsx` | Current injury and availability text also appear in the profile header. | Cover these additional scraped-text locations. |
| `frontend/src/api/schemas.ts` | Profile news exposes title, URL, publication date, and source. | Translate the title; retain source, URL, and locally formatted date. |

The scraper's `NewsItem` model also permits a summary, but the current frontend
news contract does not expose an article body or summary. Translating full
external articles is outside this plan. Opening an article continues to open
the publisher's original page.

## 1. Language state and deterministic dictionaries

Add `i18next` and `react-i18next`, using their TypeScript resource typing. Pin
compatible versions through Bun without upgrading unrelated dependencies.
Use local resources rather than a hosted translation management platform.
The libraries support [typed keys](https://www.i18next.com/overview/typescript)
and [reactive language changes](https://react.i18next.com/latest/usetranslation-hook).

Proposed structure:

```text
frontend/src/i18n/
  index.ts                 # instance, bundled resources, initialization
  language.ts              # en/es type, locale map, preference validation
  i18next.d.ts             # typed resource keys
  format.ts                # dates, numbers, EUR, percentages, durations
  domainLabels.ts          # existing API codes/IDs -> message keys
  locales/en/{common,weather,lineup,market,players,errors}.json
  locales/es/{common,weather,lineup,market,players,errors}.json
frontend/src/features/shell/LanguageSelector.tsx
frontend/src/features/translation/
  GTranslateBridge.ts      # vendor loading and language lifecycle
  ScrapedText.tsx          # controlled raw-text boundary
```

Resolve language from a valid `lfb-language` localStorage preference, then the
first supported browser language, then English. Normalize regional variants
such as `es-MX` to `es`; reject other stored values. If storage is unavailable,
retain the preference in memory. English remains the dictionary fallback.
Bundle both dictionaries so switching cannot suspend or remount the app.

Keep language state above routes and feature providers. Language changes must
not recreate the auth, league, query, or lineup-draft providers. Do not add
language to query keys for the existing language-neutral API data, or refetch
those data just to change their presentation.

Use semantic keys, interpolation, and plural forms. For example:

| Key | English | Spanish |
| --- | --- | --- |
| `weather.condition.rain` | Rain | Lluvia |
| `weather.reason.beyond_forecast_horizon` | Outside the forecast window | Fuera del plazo de previsión |
| `players.availability.doubtful` | Doubtful | Duda |
| `players.injury.ongoing` | Ongoing | En curso |
| `players.injury.days_one` | {{count}} day | {{count}} día |
| `players.injury.days_other` | {{count}} days | {{count}} días |

Verify dictionary key parity, interpolation arguments, and plural coverage in
CI. Generate or draft initial translations during development and commit the
reviewed results. No machine translation is needed for this path in production.

## 2. Translate structured data at presentation boundaries

| Data or screen | Deterministic method |
| --- | --- |
| Weather | Map `conditionCode` through known weather conditions to dictionary keys; retain icon fallback. Translate unavailable reasons by their existing codes. Ignore provider prose when a verified code supplies the label. Keep °C, km/h, timestamps, and probabilities as typed data. |
| Lineup | Translate tabs, formation/position labels, filters, countdown units, empty states, save feedback, tooltips, builder stages, diagnostics, and score explanations using keys and parameters. Preserve formation values, IDs, eligibility, and scoring. |
| LALIGA responses | Map position IDs, normalized availability, verified match states, ownership/listing states, stat codes, and API error codes to local keys. Keep player/club/manager/league names, IDs, URLs, and numeric values intact. |
| Market | Translate columns, filters, seller categories, actions, lock/shield states, bid/offer dialogs, confirmations, and errors. Store filter values and transaction values using stable codes and numbers. |
| Players and details | Translate columns, profile labels, known metric codes, radar labels/tooltips, position/availability/risk/form enums, match outcomes, pagination, and empty/partial states. Use the same domain labels as Market and Lineup. |
| Injury/news chrome | Translate headings, Read article, current/ended/unreported-end states, source labels, record counts, dates, and duration units locally. Only the source prose uses GTranslate. |

Keep validation and normalization in the existing API/schema/model layers.
Translate as late as practical in components and presentation helpers. A
translated label must never become a filter value, cache key, identifier,
status comparison, or mutation parameter. Replace module-level translated
constants with keys or functions accepting the current translator.

Known finite FutbolFantasy labels, such as availability, injury risk and form,
use their parsed enums. Map hierarchy or similar labels only where their
meaning is verified; an ordinal rank alone is not sufficient evidence for an
invented English role. Unknown structured values show a localized Unknown or
Unavailable state. Preserve any useful original label separately and identify
its source language rather than guessing or sending it to GTranslate.

Use API error codes for local messages; never translate arbitrary upstream
error bodies. Retain the existing distinction between zero, missing values,
unavailable segments, and `needs_reauth`.

The builder also has optional generated explanation prose in `explanations`.
That prose cannot be translated by enum lookup. Use localized template
summaries derived from existing scores, evidence, and diagnostic codes as the
primary explanation. If retaining the optional generated text, identify it
as an original explanation separately. Do not expand GTranslate beyond the
requested news/injury scope or introduce another runtime translation service.

### Number, date, and amount-input rules

Use [`Intl`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
with the selected locale. Currency remains EUR and physical units remain the
existing units. Fixture timestamps remain in Europe/Madrid. Parse date-only
news/injury values as calendar dates so changing locale or timezone cannot
move them to the previous day.

Handle input parsing separately from display formatting. For example, Spanish
`1.234` and English `1,234` must both represent 1234 in their respective input
locales. Reject ambiguous/invalid grouping rather than silently changing value.
When language changes during editing, retain the draft's input locale until
commit or cancel; do not reinterpret its raw string using the new locale.
Validate the numeric value and submit the same whole-euro contract as today.

## 3. GTranslate for scraped prose only

### Field allowlist

| Field | Behavior |
| --- | --- |
| `profile.news[].title` | Original Spanish in ES; automatic translation requested in EN. |
| `profile.injury.diagnosis` | Same behavior, including the player header. |
| `profile.injuryHistory[].diagnosis` | Same behavior for each visible record. |
| `profile.injury.availabilityText` | Prefer the verified structured status; route a genuinely free-form injury note through the same raw-text boundary. Avoid duplicating the mapped label and note. |
| Future news summary/body | Explicit follow-up requiring a verified API contract and source; not implicitly included now. |

Render the source as plain text; never insert scraper HTML. Preserve publication
dates, durations, article URLs, source names, player names outside prose, and
record ordering. Names embedded inside a headline are part of the translation
input: the free widget does not promise a glossary or exact name preservation.

### Selective translation and React ownership

GTranslate documents the `notranslate` class for both
[free and paid widgets](https://gtranslate.support/en/articles/1349930-how-to-skip-translations).
Its dashboard CSS-selector and phrase exclusions on that page are paid features.
Use the free class mechanism rather than depending on those settings.

Mark deterministic regions with `className="notranslate"` and `translate="no"`:
the header, footer, gates, lineup/market/catalog screens, dialogs and portals,
plus local labels and metadata inside player details. Keep the allowed scraped
text in separate siblings outside those exclusion wrappers. Do not put
`notranslate` on `html`, `body`, the app root, or another ancestor of an allowed
text block: a child flag cannot reliably undo an ancestor exclusion.

`data-machine-translate` can identify app-owned allowed blocks for auditing; it
is not a documented GTranslate allowlist API. Scope completeness must be checked
in the rendered DOM, including portaled controls and asynchronous content.

The proposed `ScrapedText` component renders an empty, stable container. An
effect inserts its plain source text into a child subtree owned by the adapter;
React does not render or reconcile that subtree's text nodes. GTranslate can
modify that subtree without competing with JSX text updates. This follows
React's distinction between managed DOM and [containers React leaves empty](https://react.dev/learn/manipulating-the-dom-with-refs).
Recreate the subtree from the original source when its identity, source text,
or language generation changes. Never feed already translated DOM back in as
the source, scrape translated output into the query cache, or patch global
`Node`/React methods to suppress reconciliation errors.

For news links, derive the accessible name from the visible headline using
`aria-labelledby` or native content. The current fixed Spanish `aria-label`
must not override a translated visible headline. Keep external-link hints and
other accessibility copy in the deterministic dictionaries.

### Shared adapter and switching

Use one `GTranslateBridge`, lazy-loaded only when English is selected and
allowed scraped text is present. Configure the source as Spanish, independently
of the UI's English document language. Do not load a second floating selector;
the main-header control owns the requested language. Preserve required vendor
attribution and supported UI elements.

The [widget configurator](https://gtranslate.io/website-translator-widget)
documents language and display configuration, but does not establish a stable
per-string translation API or completion callback. During the spike, verify
the current free widget's supported custom-control integration, programmatic
selection, Spanish reset, late-content behavior, and status signals. Do not
assume old `doGTranslate`, `googtrans`, or `.goog-te-combo` examples apply to the
current widget. Local storage remains the app's language preference authority;
provider state must be synchronized with it rather than independently selecting
the app language.

On an English request, update deterministic UI immediately and request
translation of fresh Spanish source nodes. On return to Spanish, reset the
vendor to source mode and restore original text. Use generation identities for
rapid switching, player changes, refreshed sources, and pagination so old work
cannot overwrite a newer visible block. Effects, scripts, observers, and
subscriptions must tolerate React StrictMode and clean up when appropriate.

Keep original text visible while translation is requested. Offer Show original
and Retry translation for the affected section. Show original Spanish with a
localized explanation when loading fails or the widget is blocked. A loaded
script or changed language cookie is not proof that every block was translated;
use only verified completion signals for translated/pending state. If the free
widget supplies none, use neutral Automatic translation requested wording and
avoid an indefinite spinner or a false success label. This failure never blocks
the rest of the player profile or application.

Use only supported widget calls. Do not call undocumented Google endpoints,
create a backend proxy to the free widget, or save its output as a translation
database. The scraper and its robots/rate-limit behavior remain unchanged.
`notranslate` is a translation-scope mechanism, not a security boundary for
third-party JavaScript; inspect actual vendor requests with synthetic account
data before release and update provider/privacy documentation accordingly.

If the free widget cannot satisfy the custom-control or dynamic-content
requirements, record that result before broad integration. Test an isolated
reader document as a fallback: GTranslate runs only there, receives public
scraped fields and ES/EN requests, and reports height/state through validated
messages. It must have effective origin/sandbox isolation, no auth credentials,
and pass widget storage, focus, responsive-layout and reset checks. This is a
fallback design to validate, not a claim that the free widget supports iframes.
If neither approach passes, report the limitation and keep original text usable;
changing translation provider would be a separate decision.

## 4. Header and interaction

Desktop order:

```text
Brand | Lineup · Market · Players | [Globe] [Theme] [League] [Account]
```

Use a Base UI language select with native names Español and English in its
popup; omit flags. Its globe-only trigger sits immediately before ThemeToggle
in one appearance-controls group. Give it a localized Language/Idioma
accessible name and hover title, a visually hidden selected value, keyboard
selection, focus restoration, and a 44 × 44px target. Mark the selected language
in the popup.

At mobile widths, retain the language/theme pair together in the header outside
the collapsible account menu. Allow a second header row when space is limited;
league and account controls remain under Options, and screen tabs remain in the
existing bottom navigation. Reuse the header height observer and theme tokens.

Switch without navigation or a full reload. Preserve current route, league,
fixture, filters, independent news/injury pages, scroll, focus, open dialogs,
amount drafts, and unsaved lineup. Persist only the preference. Language
selection stays usable if GTranslate is unavailable. Keep source-language
metadata accurate when Spanish source text is displayed in an English UI.

## 5. Implementation sequence and completion criteria

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 0. GTranslate spike | Minimal representative player header, news/injury blocks, local UI, and a custom ES/EN selector; inspect the actual current free widget. | Verify exclusions, control integration, source/reset, late data, pagination, StrictMode/remounts, rapid toggling, accessible names, and blocked-script recovery. Record supported hooks and limitations. |
| 1. Foundation and selector | Typed bundled ES/EN resources, preference initialization, locale helpers, header language/theme group. | Works signed in/out, with unavailable storage, on phone/desktop and in both themes; switching preserves feature-provider state. |
| 2. Deterministic migration | Weather and common domain labels, shell/gates, lineup/builder, market, players/detail/radar, dialogs and errors. | All in-scope known data and app copy have reviewed keys in both languages; identifiers, values, calculations and write bodies remain stable. |
| 3. Scraped-text integration | Adapter and controlled text boundaries for the explicit fields above. | Only allowed prose changes; source restoration, source refresh, separate pagination, error fallback and accessible link text pass the spike's regression cases. |
| 4. Release validation and docs | Focused automated tests, real-vendor browser smoke check, updated frontend/provider docs. | All acceptance cases below pass; document any vendor-dependent limitation. |

### Validation

- Unit/contract checks: dictionary/parameter parity, code mappings and unknown
  fallbacks, locale formatting, date-only stability, plural forms, EUR input
  parsing, and unchanged filter/mutation values.
- Component checks: selector position and keyboard behavior, saved preference,
  blocked storage, source restoration, translated visible/accessibility text,
  adapter cleanup/races, and failure recovery.
- Playwright: ES/EN × light/dark at representative 375px, 800px, and 1440px
  widths. Switch while a lineup draft, player filter, news page, injury page,
  and mocked bid-amount draft are open. Assert state and numeric amounts survive.
- Reuse `frontend/e2e/player-news-injuries.spec.ts`, shell/header checks, weather
  cases, and existing lineup/market/player fixtures. Test long English headlines,
  current injury header, later-arriving content, unknown codes, partial profile
  failure, script timeout/blocking, and rapid EN→ES→EN changes.
- Mock the adapter in deterministic CI. Separately run a real-widget browser
  smoke check with fictional data: mocks cannot establish vendor compatibility,
  real network behavior, required attribution, or successful translation.
- From `frontend/`, run `bun run lint`, `bun run test`, `bun run build`, and the
  affected Playwright specs. No real bids, clauses, shields, or lineup writes.

Update `docs/frontend.md` for supported languages, placement, formatting, and
fallback behavior. Record the vendor domains and browser data flow in the
existing provider documentation. The baseline plan does not change API routes
or schemas, so generated OpenAPI files do not need regeneration. If a later
contract change is necessary, first follow the API guides and regenerate the
affected schemas and references as required by AGENTS.md.

The completed feature has no added translation subscription or paid API usage:
the app ships its dictionaries, Spanish scraper prose stays original, and the
free widget handles English prose where supported.
