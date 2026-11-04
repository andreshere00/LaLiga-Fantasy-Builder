# Spanish and English localization

Implemented on 4 November 2026. The frontend keeps its existing i18next dependency,
EUR currency formatting and Europe/Madrid fixture times. Backend contracts are unchanged.

## Application messages

`frontend/src/i18n/index.ts` owns the bundled English and Spanish catalogs, language
selection and React subscription. Resolve language from `lfb-language`, then the
first supported browser language, then English. Update the document language when
the user selects a language. The Options panel keeps the globe selector beside
the theme control; selection restores focus to the globe.

Use exact phrase keys and explicit numeric interpolation parameters:

```tsx
const t = useTranslation();
return <span>{t("Fixture {{0}} scores are unavailable.", { 0: week })}</span>;
```

`t(key, parameters?)` accepts strings and returns a string. `useTranslation()`
subscribes a component to language changes and returns that function. Helpers may
import `t` directly when their rendering component subscribes. There is no regex
message matching, whitespace inference, array traversal or React-tree translation.
Translate complete sentences and singular/plural count messages. Translate nested
application labels before interpolation. Explicit catalog entries preserve any
intentional fragment spacing.

Translate copy where it is produced. Generic UI primitives render their supplied
props and children unchanged; they translate only their own defaults and controls.
Do not translate formatted numbers, dates, email addresses or club, player and
manager identities. Translate missing-data fallbacks separately. Distinguish builder
source kinds from manager names. Notifications store untranslated message keys in
their title component props and translate during rendering, so both visible titles
and live announcements follow language changes.

Language changes preserve provider instances, component identity, dialogs, unsaved
drafts and independent pagination. Formatters read the current locale at use time.
Whole-euro input accepts validated English or Spanish thousands grouping without
reinterpreting an existing draft.

## Automatic prose translation

Only public FutbolFantasy injury diagnoses, free-form availability notes and news
headlines request machine translation. Spanish renders the source. English uses
one opaque `sandbox="allow-scripts"` reader per visible text block. An intersection
observer defers loading until the block approaches the viewport.

The parent sends only the public text and a fresh random channel. The reader
accepts a single initialization message from its parent, loads GTranslate Free,
and returns text or an error. The parent validates the source window, channel,
message type and text length. It renders the result with React in the parent
document, so the reader needs no sizing messages, resize observer or style transfer.
Effects remove listeners and clear timers on cleanup. Readers are unmounted when
restoring source text, changing language or retrying; stale responses cannot update
the replacement reader. A 15-second timeout or blocked service leaves the original
Spanish visible. Show original, Retry translation and GTranslate attribution remain
available. Translation state is ephemeral and never enters API or query storage.

The browser must reach `cdn.gtranslate.net` and the vendor's translation service
(currently `translate-pa.googleapis.com`). News links open the original publisher
article; the API supplies headlines rather than article bodies. Optional generated
builder explanations remain separately identified as original English prose.
GTranslate Free is intended for this personal, noncommercial app and provides no
manual translation editing or translated SEO.

## Validation

Verified: lint, production build, 91 Vitest files (771 tests), 137 deterministic
browser checks across 12 affected suites, and the opt-in real GTranslate smoke.

Catalog checks require exact literal keys in both languages and matching numeric
parameters. Regression tests cover complete fixture errors and accessible names,
Athletic identities, names containing interpolation delimiters, translated
notifications across switching, builder sources/counts, and reader success,
blocked service, timeout, retry, stale messages and deferred loading.

Run from `frontend/`:

```bash
bun run lint
bun run build
bun run test
bun run test:browser -- localization.spec.ts builder-setup.spec.ts lineup-builder.spec.ts player-form.spec.ts player-news-injuries.spec.ts market-bids.spec.ts ux-fields.spec.ts
LFB_LIVE_TRANSLATION=1 bun run test:browser -- localization.spec.ts -g 'live free'
```

Browser fixtures cover routes, dialogs, drafts, independent history pagination,
keyboard focus restoration, preference persistence and tooltip viewport bounds.
They use fictional data and never perform live Fantasy writes. The real-service
smoke is opt-in; deterministic checks mock the vendor.
