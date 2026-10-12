# Fantasy Builder — component styling specification

This specification extends the supplied visual briefing into a component system for the existing React 19 + Vite frontend. It is a design/refactor plan and a standalone demonstration; it does not change the production frontend or perform live lineup saves or market actions.

## Reading the specification

- **Typography width:** interpreted as **weight** (400/500/600). Actual control width is stated under Shape. Use normal font stretch; do not horizontally scale the fonts.
- **Anton correction:** the supplied Anton family has a single 400 face. Use that actual face for the visually heavy display headings rather than inventing 600/700 font files or relying on synthetic bold. Keep the requested sizes, line heights and uppercase roles. Updated main/section heading letter spacing is +0.03em for clearer character separation. [Official Anton metadata](https://github.com/google/fonts/blob/main/ofl/anton/METADATA.pb).
- **AT Aero:** self-host the provided 400, 500 and 600 faces; the existing frontend has 400/500/700 but needs the real Semibold file for button weight 600. Fonts are included alongside this preview. Production font asset paths will differ.
- **Primitive family:** use the shadcn **Base UI** family consistently, including its `render` composition. Avoid mixing Radix `asChild` and `data-state` assumptions into Base UI components. Styling hooks below are added to the local generated component files; remove conflicting radius, shadow, focus-shadow and animation utilities there. [Vite setup](https://ui.shadcn.com/docs/installation/vite), [Button API](https://ui.shadcn.com/docs/components/base/button).
- **Implementation scope:** the code snippets are adaptation examples assuming the named shadcn primitives are installed. The complete native Button, PulseRing and NumberPagination references are separate source files and included in the appendices. The interactive HTML uses native controls to demonstrate appearance and states; it does not claim to implement every Base UI primitive.

## Shared foundations

Rectangular panels, inputs, menus, tables and navigation have **0px radius**. Standalone action buttons use **8px radius**. Buttons attached to a larger graphic, navigation or a control group are square. No gradients, drop shadows, glow, blur or bouncing spring motion. A 1px neutral border establishes structure. Use 160ms color transitions and at most 200ms restrained panel translation; respect reduced motion.

Use one coral primary action per section when possible. Cyan and purple identify a small number of highlights, not every surface. Semantic colors are for status indicators accompanied by text/icon; main and secondary color do not automatically mean shadcn `primary` and `secondary` button variants.

| Role | Light | Dark | Use |
|---|---|---|---|
| Primary / failure | #FF4B44 | #FF4B44 | Primary action fills, active rules, error indicators |
| Secondary | #35353D | #E5E5E5 | Main body text and icons |
| Tertiary | #000000 | #FFFFFF | Display titles and high-contrast focus outlines |
| Cyan accent | #24CEE5 | #24CEE5 | Limited accents, on-state control track |
| Purple accent | #C04FFD | #E3AFFF | Optional highlight or category accent |
| Coral accent | #FFC2BF | #B85A55 | Hover and selected auxiliary surfaces |
| Success | #10BD00 | #10BD00 | Status rails, marks and icons |
| Warning | #FFC413 | #CA9C10 | Status rails and warning marks |
| Page background (added neutral) | #F3F3F4 | #18181C | Main canvas |
| Component surface (added neutral) | #FFFFFF | #24242B | Opaque panel/popup/table surface |
| Quiet fill (added neutral) | #EDEDEF | #303039 | Header rows, skeletons, off tracks |
| Structural border (added neutral) | #CDCDD2 | #50505B | Section dividers |
| Control border (added neutral) | #797981 | #9898A3 | Input and actionable outline boundaries |
| Helper text (added neutral) | #5B5B64 | #B7B7C2 | Secondary annotations |

**Foreground pairing:** use black/dark ink on coral primary, cyan, purple, success and warning filled labels. White on #FF4B44 has only **3.31:1** contrast; black has **6.34:1**, so a 14px primary button uses black text/icons. On dark-mode coral #B85A55, white is **4.53:1**. These values are calculated from the supplied sRGB hex values. Small colored text on white is not automatically legible: prefer neutral text with a colored mark or filled badge. A failure state must have a label/icon because primary and failure share the same hue.

**shadcn token bridge:** map `--background` to page background, `--card` and component surfaces to `--fb-surface`, `--foreground`/`--card-foreground` to secondary text, `--primary` to coral, `--primary-foreground` to black, `--accent` to the hover coral and `--accent-foreground` to its paired ink. Map muted surface/text separately; map border/input separately. Set `--radius: 0`; the Button owns its explicit 8px exception. Do not globally disable outlines: replace shadow rings with a 2px outline. Portal content must inherit the active theme, e.g. theme class/tokens on the document root or an explicit themed portal container.

## Existing frontend migration points

| Existing files | Refactor direction |
|---|---|
| `frontend/src/styles/tokens.css`, `fonts.css`, `global.css` | Replace shared surface shadow, add theme roles and actual Anton/Semibold faces; preserve existing tokens during staged migration until every consumer is mapped. |
| `features/shell/Header.tsx` and `Header.css` | Three flat destination links; account and league controls stay separate. |
| `features/lineup/LineupPage.tsx`, `LineupPage.css`, `PlayerTile.css` | Square controls/panels and typography; preserve formation, fixture paging, saved draft and squad action logic. |
| `features/market/MarketPage.tsx`, `MarketPage.css` and action dialogs | Square rich rows/search/filter UI; share Button/Dialog/Toast presentation. |
| `features/players/PlayersPage.tsx` and `PlayersPage.css` | Number-only sliding pagination, search filters and styled rich rows; preserve URL state. |
| `features/players/PlayerBookmarkButton.*`, `favorites.ts` | Toggle presentation; preserve favorite identity and storage behavior. |
| `components/Modal.*` | Replace with Dialog; preserve focus restoration, inert background, close policies and form validation. |
| `components/TooltipPanel.css` and manual hover panels | Tooltip for short help; Dialog/Sheet for interactive details. |
| `features/players/PlayerScreenLoading.css`, `features/market/MarketScreenLoading.css` | Remove gradient shimmer; flat skeleton pulse and Pulse Ring. |
| `PlayersColumnFilterPopover` and equivalent market filters | Sheet/Drawer compositions; no generic Popover. |

Migration order: foundation tokens/fonts → Button/Input/focus → app navigation → overlays and filters → market/player rows and pagination → lineup/detail widgets → loader and notifications. Preserve verified auth gates, loading/error/degraded states and mutation eligibility. UI examples contain fictional data and local-only actions.

## Component specifications

### 01. Loading panel · Pulse Ring

**Component name:** Loading panel · Pulse Ring

**Purpose:** Initial lineup, market, player-detail and route loading states.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 12px, 20px.
- **Width / weight:** 400; use normal font stretch.
- **Role details:** AT Aero status 12px/140%, weight 400; optional Anton section title 20px/130%, weight 400.

**Colors**

- **Main:** outer ring #FF4B44 both modes.
- **Secondary:** inner ring #35353D / #E5E5E5.
- **Tertiary:** panel surface #FFFFFF / #24242B.

**Shape changes / attributes:** Square panel with 20–24px padding. Circular rings are the explicit animation exception. Ring sizes 16, 32, 48, 64px; proportional inner inset 22%; allow at least 12px outer breathing room.

**Code changes:** Replace fixed rose/zinc classes with semantic tokens. Replace inset-2 with proportional inset so sm does not collapse. Apply the provided PulseRing.tsx and CSS; use one live status label, aria-hidden rings and reduced-motion fallback. Replace page skeleton gradients with a flat pulse.

```tsx
<section className="fb-panel" aria-busy="true">
  <PulseRing size="lg" label="Loading lineup…" />
</section>
```

**Interaction and accessibility:** A 1.4s expanding coral outline and gently pulsing inner outline; no flashing or scale motion in reduced-motion mode. Keep partial refresh loaders local; never block a usable page for background polling.

**Application integration:** Replace the status paragraph in LineupPage.tsx and Suspense fallback in App.tsx; review MarketScreenLoading and PlayerScreenLoading.

### 02. Buttons

**Component name:** Buttons

**Purpose:** Save lineup, submit a bid, confirm filters, secondary actions and icon actions.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 16px.
- **Width / weight:** 600; use normal font stretch.
- **Role details:** AT Aero; 14px default / 16px large; weight 600; 100% line height; 0.01em tracking; uppercase key actions.

**Colors**

- **Main:** primary/destructive fill #FF4B44.
- **Secondary:** label/icon #000000 on the primary fill.
- **Tertiary:** hover coral #FFC2BF / #B85A55, with label #35353D / #FFFFFF. Outline buttons use neutral surface and content.

**Shape changes / attributes:** 8px corners for standalone actions; 0px in nav bars, attached control groups and row-integrated graphic elements. Heights 36/44/48px; touch actions ≥44px; 18px primary icon; 8px icon gap. Content centered in both axes.

**Code changes:** Complete native React implementation is included in code/Button.tsx and Appendix A. Use size, shape, variant and loading props. Replace the generated shadcn Button default styles or use this native version, preserving the public native button props. Remove shadow, ring-shadow and transition-all utilities. Links use buttonVariants on Link, never a button with link semantics.

```tsx
<Button icon={<Save aria-hidden="true" />} loading={savePending}
  disabled={!hasChanges} onClick={saveLineup}>Save lineup</Button>
<Button variant="outline" shape="square">Apply filters</Button>
```

**Interaction and accessibility:** 160ms fill/border/text transitions; no jump or glow. Default button type is button; submit is explicit. Busy state blocks repeat submission. Icon-only actions need aria-label; keep a visible pending label for longer operations. Success and destructive actions share coral but are distinguished by icon and wording.

**Application integration:** Map existing save-lineup-button, recommend-button and MarketActionDialogs actions. Keep existing disabled eligibility, confirmation and mutation handlers.

**Primitive reference:** [Buttons](https://ui.shadcn.com/docs/components/base/button).

### 03. Breadcrumb

**Component name:** Breadcrumb

**Purpose:** Player-detail location under Players, while top navigation stays limited to three destinations.

**Typography**

- **Font:** AT Aero.
- **Size:** 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero 12px/140%; links weight 400, current page weight 500; 0.01em tracking; sentence case player names.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Unboxed horizontal list with 8px gaps; 12px chevron separators. Ellipsis trigger is a square 36px control with a 44px touch target when needed.

**Code changes:** Use React Router Link in BreadcrumbLink render. Provide children explicitly: the supplied self-closing link examples have no visible label. Style BreadcrumbList with fb-breadcrumb and current-page text with tertiary ink. Overflow uses a square DropdownMenu.

```tsx
<BreadcrumbLink render={<Link to="/players" />}>Players</BreadcrumbLink>
<BreadcrumbPage>{player.name}</BreadcrumbPage>
```

**Interaction and accessibility:** aria-current=page on current item; separators decorative. Keyboard focus and underline accompany hover. Do not create fictitious nested nav pages.

**Application integration:** Place above the existing PlayerDetailPage title; use the current /players/:playerId route.

**Primitive reference:** [Breadcrumb](https://ui.shadcn.com/docs/components/base/breadcrumb).

### 04. Calendar

**Component name:** Calendar

**Purpose:** Fixture date selection and calendar views.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 18px, 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** Anton month title 18px/130%, weight 400; AT Aero day numbers 14px/140%, weight 500; weekday labels 12px/140%, weight 500.

**Colors**

- **Main:** neutral surface #FFFFFF / #24242B.
- **Secondary:** day text #35353D / #E5E5E5.
- **Tertiary:** selected day #FF4B44 with #000000 content; today uses a tertiary-ink outline.

**Shape changes / attributes:** Square calendar and cells; ≥36px day cells in compact desktop view, 44px on touch. Caption selectors have 0px corners. Calendar width around 320px; keep seven columns and enough horizontal room.

**Code changes:** Remove rounded-lg and all shadows from Calendar root. Also update generated CalendarDayButton and classNames for day buttons, selected states and caption selectors; wrapper styling alone will not remove internal rounded-full. Preserve Calendar controlled date and captionLayout dropdown.

```tsx
<Calendar mode="single" selected={date} onSelect={setDate}
  captionLayout="dropdown" className="fb-calendar" />
```

**Interaction and accessibility:** Retain the library keyboard grid, localized weekday ordering, disabled dates and screen-reader date labels. Today must remain different from selected. Do not stretch condensed Anton onto numeric day cells.

**Application integration:** Use fixture dates where a full date is meaningful; keep the existing fixture-number pager for matchweek navigation.

**Primitive reference:** [Calendar](https://ui.shadcn.com/docs/components/base/calendar).

### 05. Date picker · Dialog composition

**Component name:** Date picker · Dialog composition

**Purpose:** Compact date trigger without the excluded Popover primitive.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** date trigger neutral surface.
- **Secondary:** label #35353D / #E5E5E5.
- **Tertiary:** calendar selection #FF4B44 with black text; focus uses tertiary ink.

**Shape changes / attributes:** Standalone trigger 8px corners, ≥44px height, width 212–240px; dialog panel square, width min(360px, viewport − 32px). Integrated trigger is square.

**Code changes:** Replace Popover/PopoverContent/PopoverTrigger with Dialog, DialogContent and DialogTrigger; include DialogTitle. Keep controlled pending and committed dates separately; Apply commits, Cancel discards. On mobile use the same accessible dialog or a Drawer.

```tsx
<DialogTrigger render={<Button variant="outline" icon={<CalendarDays />} />}>
  {date ? format(date, "PPP") : "Pick a date"}
</DialogTrigger>
<DialogContent className="fb-popup">
  <DialogTitle>Fixture date</DialogTitle>
  <Calendar mode="single" selected={draftDate} onSelect={setDraftDate} />
</DialogContent>
```

**Interaction and accessibility:** Provide a visible title, cancel/apply controls, initial focus, Escape close and restored trigger focus. A formatted date is read aloud; the calendar icon is decorative.

**Application integration:** This explicitly supersedes the briefing’s Popover-based date-picker example.

**Primitive reference:** [Date picker · Dialog composition](https://ui.shadcn.com/docs/components/base/date-picker).

### 06. Carousel

**Component name:** Carousel

**Purpose:** Compact player-form or fixture highlights, where lateral browsing is useful.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 20px, 14px.
- **Width / weight:** 400, 600; use normal font stretch.
- **Role details:** Anton title 20px/130%, weight 400, tracking +0.03em, uppercase; AT Aero body 14px/150%, weight 400; AT Aero actions 14px/100%, weight 600.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square slides and cards with 1px separators; fixed internal gaps 12–16px. Square 44px arrow controls because they belong to the larger graphic. Reserve arrow space inside the section, not outside the viewport.

**Code changes:** Remove Card rounded/shadow defaults and p-1 wrappers that only accommodate shadows. Use Carousel root, content and items as provided; style Previous/Next with shape square and outline variant. Match slide height without forcing every slide to aspect-square.

```tsx
<Carousel className="fb-carousel">
  <CarouselContent>{slides.map((slide) => (
    <CarouselItem key={slide.id}><Card className="fb-panel">{slide.content}</Card></CarouselItem>
  ))}</CarouselContent>
  <CarouselPrevious className="fb-button--square" />
  <CarouselNext className="fb-button--square" />
</Carousel>
```

**Interaction and accessibility:** No autoplay. Retain labeled previous/next controls, swipe and keyboard behavior from the primitive; report slide position without excessive announcements.

**Application integration:** Potentially reuse for player-detail form widgets; keep core market data in a stable list/table.

**Primitive reference:** [Carousel](https://ui.shadcn.com/docs/components/base/carousel).

### 07. Collapsible

**Component name:** Collapsible

**Purpose:** Additional player statistics or bid details beneath a permanent summary row.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 18px, 14px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** Anton section title 18px/130%, weight 400; AT Aero summary/body 14px/150%, weight 400; values weight 500.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square border rows, 12–16px padding, 8px vertical spacing. Toggle square because it is attached to the section; no rounded-md on any inner row.

**Code changes:** Remove rounded-md from fixed and expanded panels. Apply fb-panel or bordered row classes to both. Use a square icon button in CollapsibleTrigger; rotate the chevron 90deg or switch icon at most, avoiding height bounce.

```tsx
<CollapsibleTrigger render={<Button variant="ghost" size="icon" shape="square"
  aria-label="Toggle player details" />}>
  <ChevronsUpDown aria-hidden="true" />
</CollapsibleTrigger>
```

**Interaction and accessibility:** Keep expanded state on the trigger via the primitive; content stays semantically adjacent to the summary. The summary and its title remain visible when closed.

**Application integration:** Use for player-detail sections that currently occupy large stacks of widgets.

**Primitive reference:** [Collapsible](https://ui.shadcn.com/docs/components/base/collapsible).

### 08. Combobox

**Component name:** Combobox

**Purpose:** Searchable team or owner selection; free-form player search remains an Input Group.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square input and popup; ≥44px options, 8px–12px padding, matching trigger width. Popup max height 240px with square scrollbars.

**Code changes:** Change generated ComboboxInput and ComboboxContent rounded/shadow defaults. Add fb-combobox-input and fb-popup hooks, use fb-item for highlighted options. Supply stable IDs for objects, a readable label and explicit empty results. Combobox internal popup is permitted; no generic Popover wrapper.

```tsx
<Combobox items={teams}>
  <ComboboxInput className="fb-combobox-input" placeholder="Select team" />
  <ComboboxContent className="fb-popup">
    <ComboboxEmpty>No teams match.</ComboboxEmpty>
    <ComboboxList>{(team) => <ComboboxItem key={team} value={team}
      className="fb-item">{team}</ComboboxItem>}</ComboboxList>
  </ComboboxContent>
</Combobox>
```

**Interaction and accessibility:** Preserve library arrow keys, Enter, Escape and active-option semantics. Clearing the filter must be available. Labels must not rely on placeholders.

**Application integration:** Team and owner lists in PlayersListHead and MarketListHead are candidates; retain current URL filter state where used.

**Primitive reference:** [Combobox](https://ui.shadcn.com/docs/components/base/combobox).

### 09. Dialog

**Component name:** Dialog

**Purpose:** Confirm a bid, clause payment, sale or lineup action.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 20px, 14px.
- **Width / weight:** 400, 600; use normal font stretch.
- **Role details:** Anton title 20px/130%, weight 400, tracking +0.03em, uppercase; AT Aero body 14px/150%, weight 400; AT Aero actions 14px/100%, weight 600.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square centered panel, 1px border, 24px padding; width min(480px, viewport − 32px). Solid neutral overlay with opacity; no blur, shadow or scaling spring. Standalone footer actions may have 8px corners.

**Code changes:** Use generated Dialog primitive for focus/inert behavior; apply fb-popup to DialogContent and fb-section-title to DialogTitle. Remove rounded, shadow-lg, ring-shadow and zoom animation utilities in generated source. Use a short opacity transition and explicit title, description, amount and actions.

```tsx
<DialogContent className="fb-popup">
  <DialogHeader><DialogTitle className="fb-section-title">Confirm bid</DialogTitle>
    <DialogDescription>Submit €1,250,000 for this player?</DialogDescription>
  </DialogHeader>
  <DialogFooter><Button variant="outline">Cancel</Button>
    <Button icon={<Gavel />} loading={pending}>Place bid</Button></DialogFooter>
</DialogContent>
```

**Interaction and accessibility:** Focus trap, Escape close and focus restoration come from the primitive. Preserve in-dialog errors on failure; do not close on a failed mutation. Block accidental repeated confirmation while pending.

**Application integration:** Replace custom components/Modal.tsx and its spring/scale animations; wire existing MarketActionDialogs handlers and validation.

**Primitive reference:** [Dialog](https://ui.shadcn.com/docs/components/base/dialog).

### 10. Drawer

**Component name:** Drawer

**Purpose:** Mobile filter editor or compact detail inspection from the bottom edge.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 20px, 14px.
- **Width / weight:** 400, 600; use normal font stretch.
- **Role details:** Anton title 20px/130%, weight 400, tracking +0.03em, uppercase; AT Aero body 14px/150%, weight 400; AT Aero actions 14px/100%, weight 600.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square top corners; maximum height 85dvh; 20px padding with safe-area-inset-bottom; rectangular 32×3px handle. Footer actions may be rounded.

**Code changes:** Remove rounded-t and shadow defaults from DrawerContent and handle. Use fb-popup styles; set bounded scroll region with persistent title/actions. Keep the library drag/dismiss logic and short translation behavior.

```tsx
<DrawerContent className="fb-popup">
  <DrawerHeader><DrawerTitle className="fb-section-title">Player filters</DrawerTitle></DrawerHeader>
  <div className="fb-scroll-area">{filters}</div>
  <DrawerFooter><Button>Apply filters</Button></DrawerFooter>
</DrawerContent>
```

**Interaction and accessibility:** Swipe is an addition to visible Close/Apply controls; never the only exit. No bounce. Keep unsaved filter changes clear and focus restoration intact.

**Application integration:** Use as the mobile alternative to the desktop Sheet; avoid nested Drawer+Dialog stacks.

**Primitive reference:** [Drawer](https://ui.shadcn.com/docs/components/base/drawer).

### 11. Dropdown menu

**Component name:** Dropdown menu

**Purpose:** Small contextual actions on a player or account; not site navigation.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero 14px/140%, weight 400; group labels 12px/140%, weight 500, uppercase; shortcut text 12px.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square popup and rows, 1px border, min width 180px, padding 4px; rows ≥36px desktop /44px touch. Square submenus and separators; no shadows.

**Code changes:** Update generated content, subcontent and item style defaults, not only trigger. Apply fb-popup, fb-item and shared neutral separators. Keep destructives labeled and pair red icon with readable content text.

```tsx
<DropdownMenuTrigger render={<Button size="icon" variant="ghost" shape="square"
  aria-label="Player actions" />}>…</DropdownMenuTrigger>
<DropdownMenuContent className="fb-popup" align="end">
  <DropdownMenuItem className="fb-item">View player</DropdownMenuItem>
</DropdownMenuContent>
```

**Interaction and accessibility:** Retain primitive menu keyboard and submenu behavior. Disabled actions remain readable with an explanatory reason elsewhere; avoid expensive operations on hover.

**Application integration:** Reuse squad-player action menus; keep the top navigation limited to Lineup, Market and Players.

**Primitive reference:** [Dropdown menu](https://ui.shadcn.com/docs/components/base/dropdown-menu).

### 12. Input

**Component name:** Input

**Purpose:** Amounts, text values and form fields.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square 44px field, 1px control border, 12px horizontal padding; width 100% of its form column. Error border 2px plus text message; no shadow focus ring.

**Code changes:** Replace rounded-md and shadow-xs in generated Input with fb-input. Retain native input props and explicit label. Use inputMode decimal for currency and validate amount separately; avoid formatted symbols inside editable numeric content.

```tsx
<label htmlFor="bid-amount" className="fb-label">Bid amount</label>
<Input id="bid-amount" className="fb-input" inputMode="decimal"
  aria-invalid={!!error} aria-describedby="bid-help" />
<p id="bid-help" className="fb-helper">{error || "Amount in euros"}</p>
```

**Interaction and accessibility:** Show focus via a 2px tertiary outline. No placeholder-only labels. Error text names the fix; keep entered value on failure.

**Application integration:** Replace/review NumericCounterField interactions without losing step, min, max or balance validation.

**Primitive reference:** [Input](https://ui.shadcn.com/docs/components/base/input).

### 13. Input group · Search

**Component name:** Input group · Search

**Purpose:** Player and market name/team/owner search.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square 44px combined field. Search icon 18px, 12px left inset; right-side Clear control is square as part of the group. Responsive width 240px minimum when space allows, otherwise 100%.

**Code changes:** Use InputGroup, InputGroupInput and InputGroupAddon. Remove wrapper rounded/shadow/ring defaults and duplicate child borders. Use focus-within outline. Give Clear an accessible name; preserve active-filter count outside the placeholder.

```tsx
<InputGroup className="fb-input-group">
  <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
  <InputGroupInput aria-label="Search players" placeholder="Name, team or owner" />
  <InputGroupAddon align="inline-end">{clearButton}</InputGroupAddon>
</InputGroup>
```

**Interaction and accessibility:** Search updates locally/through current state management; typing focus never jumps. Announce result count politely after updates, and distinguish no matches from load errors.

**Application integration:** Adapt MarketPlayerSearch and shared MarketToolbar; retain useDeferredValue and current matching behavior.

**Primitive reference:** [Input group · Search](https://ui.shadcn.com/docs/components/base/input-group).

### 14. Native select

**Component name:** Native select

**Purpose:** Short fixed options such as lineup formations.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square 44px field; formation width 140–180px desktop and flexible on small screens. Controlled 18px decorative chevron inset 12px from the right edge; reserve 44px end padding so the label cannot collide with the icon.

**Code changes:** Wrap NativeSelect in a position:relative fb-select-shell. Hide the platform arrow with appearance:none, reserve padding-inline-end:44px, and render a pointer-events:none chevron at inset-inline-end:12px. If generated NativeSelect already owns its chevron, reposition that icon instead of adding a second one. Preserve options/value/onChange, remove rounding/shadows, and keep the native option popup behavior.

```tsx
<div className="fb-select-shell">
  <select className="fb-native-select" value={formation}
    onChange={(event) => setFormation(event.target.value)} aria-label="Formation">
    <option value="4,3,3">4–3–3</option>
    <option value="4,4,2">4–4–2</option>
  </select>
  <ChevronDown className="fb-select-chevron" aria-hidden="true" />
</div>
```

**Interaction and accessibility:** Native selection behavior and keyboard access remain. Use this simpler control when options are short and fixed; custom Select is an alternative, not a second control next to it.

**Application integration:** Current LineupPage formation <select> is the direct migration point.

**Primitive reference:** [Native select](https://ui.shadcn.com/docs/components/base/native-select).

### 15. Navigation bar

**Component name:** Navigation bar

**Purpose:** Exactly Lineup, Market and Players destinations.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 14px, 20px.
- **Width / weight:** 500, 400; use normal font stretch.
- **Role details:** AT Aero 14px/140%, weight 500, tracking 0.01em, uppercase. Product wordmark may use Anton 20px/130%, weight 400.

**Colors**

- **Main:** surface #FFFFFF / #24242B.
- **Secondary:** text #35353D / #E5E5E5.
- **Tertiary:** active 4px bottom rule #FF4B44; hover coral #FFC2BF / #B85A55 with paired label.

**Shape changes / attributes:** Single flat horizontal rectangle, no floating pill container; links square, min height 56px, 16–20px horizontal padding. Small screens can use three equal-width columns; account controls remain outside these destinations.

**Code changes:** Use React Router NavLink, not shadcn NavigationMenu and no submenus. Lineup path is / and needs end to avoid matching every page. Remove existing nav tab SVG background shells and shared shadow; keep decorative icons accessible-hidden.

```tsx
<nav className="fb-nav" aria-label="Main">
  <NavLink to="/" end>Lineup</NavLink>
  <NavLink to="/market">Market</NavLink>
  <NavLink to="/players">Players</NavLink>
</nav>
```

**Interaction and accessibility:** Keep visible active underline plus aria-current supplied by NavLink. Player detail belongs to the Players context; explicitly keep Players visually active on detail routes. Contact remains a footer route.

**Application integration:** Update features/shell/Header.tsx and Header.css; preserve league/account selection and auth gates outside the three-page menu.

### 16. Pagination

**Component name:** Pagination

**Purpose:** Numbered results navigation in groups of three.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 500, 400; use normal font stretch.
- **Role details:** AT Aero numbers 14px/140%, weight 500; context 12px/140%, weight 400; tabular numerals.

**Colors**

- **Main:** neutral surface.
- **Secondary:** text #35353D / #E5E5E5.
- **Tertiary:** current page #FF4B44 with black text.

**Shape changes / attributes:** Three square 44px cells with 4px gaps; no Previous/Next words or arrow controls. Separate muted page-count caption may be shown.

**Code changes:** Replace Previous/Next buttons with NumberPagination.tsx (complete Appendix B). Use a sliding three-number window: start=clamp(current−1,1,total−2), adjusted for totals under three. Selecting the right boundary exposes the next number; selecting the left boundary exposes the previous number.

```tsx
<NumberPagination page={currentPage} totalPages={totalPages}
  onPageChange={(page) => setSearchParams(withPlayersPage(searchParams, page),
    { replace: true })} />
```

**Interaction and accessibility:** Always mark aria-current=page; hide when only one page. Clamp page after result count shrinks. Keep keyboard focus within the pagination when its window updates and announce the new count; do not force focus to the table.

**Application integration:** Direct replacement for the bottom navigation in PlayersPage.tsx; retain current search-param paging.

**Primitive reference:** [Pagination](https://ui.shadcn.com/docs/components/base/pagination).

### 17. Popover · Excluded

**Component name:** Popover · Excluded

**Purpose:** Explicit exclusion from the component set.

**Typography**

- **Font:** Not applicable.
- **Size:** Not applicable.
- **Width / weight:** Not applicable; use normal font stretch.
- **Role details:** Not applicable; do not introduce a styled Popover.

**Colors**

- **Main:** not applicable.
- **Secondary:** not applicable.
- **Tertiary:** not applicable.

**Shape changes / attributes:** No Popover primitive or Popover panel in the refactor.

**Code changes:** Remove generic Popover composition from the supplied DatePicker. Use Dialog/Drawer for date editing and Sheet/Drawer for column filters. Select, Combobox, DropdownMenu and Tooltip retain their own purpose-specific primitive popup behavior.

```tsx
// Date selection → Dialog + Calendar
// Detailed filters → Sheet (desktop) or Drawer (mobile)
// Do not import components/ui/popover for these compositions.
```

**Interaction and accessibility:** A popup used internally by a Select or Combobox is not a separate general-purpose Popover component. This decision keeps the briefing coherent without deleting essential selection behavior.

**Application integration:** Review PlayersColumnFilterPopover and analogous market filter UI during migration.

**Primitive reference:** [Popover · Excluded](https://ui.shadcn.com/docs/components/base/popover).

### 18. Radio group

**Component name:** Radio group

**Purpose:** Mutually exclusive position/availability filters.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square option rows with 8px gap and minimum 44px targets. An 18px radio indicator may remain circular to communicate native radio semantics; the surrounding graphic is rectangular.

**Code changes:** Preserve RadioGroup and RadioGroupItem behavior; style option labels as square rows, selected row via coral highlight and a clear checked indicator. No rounded option cards or shadows.

```tsx
<RadioGroup value={position} onValueChange={setPosition}>
  <label className="fb-item"><RadioGroupItem value="forward" /> Forwards</label>
  <label className="fb-item"><RadioGroupItem value="midfielder" /> Midfielders</label>
</RadioGroup>
```

**Interaction and accessibility:** One choice per group, arrow-key navigation, visible group label. A neutral All option makes clearing the filter explicit.

**Application integration:** Use in player/market filters; keep filter enum values and URL serialization stable.

**Primitive reference:** [Radio group](https://ui.shadcn.com/docs/components/base/radio-group).

### 19. Scroll area

**Component name:** Scroll area

**Purpose:** Overflow lists and bounded filter/detail panels.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400; use normal font stretch.
- **Role details:** Inherit child text roles; AT Aero 14px body, 12px helper, weight 400. Scrollbar has no typography.

**Colors**

- **Main:** neutral surface.
- **Secondary:** track #EDEDEF / #303039.
- **Tertiary:** thumb #24CEE5; use neutral high-contrast thumb if cyan is distracting in dense tables.

**Shape changes / attributes:** Square viewport, track and thumb; 8px desktop track and normal native scroll interaction. Only constrain regions that genuinely overflow.

**Code changes:** Remove rounded-full from generated ScrollBar and thumb. Keep ScrollAreaViewport and corner square; bound height and keep labels outside the viewport. Native overflow:auto is acceptable when custom scrollbars are unnecessary.

```tsx
<ScrollArea className="fb-scroll-area">{filterOptions}</ScrollArea>
```

**Interaction and accessibility:** Keep keyboard scrolling and touch intact, never hide all scrollbars. Do not create nested scroll traps or horizontal scrolling of the entire app.

**Application integration:** Use inside Sheet/Drawer and the wide player table; existing pitch/body layout keeps its own overflow rules.

**Primitive reference:** [Scroll area](https://ui.shadcn.com/docs/components/base/scroll-area).

### 20. Select

**Component name:** Select

**Purpose:** Custom fixed-option selector when native select is insufficient.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square 44px trigger and popup, ≥44px square options; popup width aligns with trigger. Trigger has 12px padding on both sides, 12px value/icon gap and an 18px nonshrinking chevron. Native visual specimens reserve 44px end padding and position the chevron 12px from the edge.

**Code changes:** Edit SelectTrigger, SelectContent and SelectItem defaults. Make the trigger inline content a flex row with justify-between, padding-inline:12px and gap:12px; keep its built-in chevron 18px and shrink-0 with no negative margin. Remove rounded and shadow classes. Use fb-select-trigger, fb-popup and fb-item; preserve the selected checkmark and controlled value. Do not add a second chevron.

```tsx
<Select value={formation} onValueChange={setFormation}>
  <SelectTrigger className="fb-select-trigger"><SelectValue /></SelectTrigger>
  <SelectContent className="fb-popup">
    <SelectItem className="fb-item" value="4,3,3">4–3–3</SelectItem>
  </SelectContent>
</Select>
```

**Interaction and accessibility:** Use the primitive’s selection, focus, typeahead and Escape behavior. Option colors alone never indicate selection. Label the trigger from the visible formation label.

**Application integration:** Alternative to Native Select for formation; choose one implementation consistently.

**Primitive reference:** [Select](https://ui.shadcn.com/docs/components/base/select).

### 21. Separator

**Component name:** Separator

**Purpose:** Thin structure between sections or action groups.

**Typography**

- **Font:** Not applicable.
- **Size:** Not applicable.
- **Width / weight:** Not applicable; use normal font stretch.
- **Role details:** No font, size or weight. Text surrounding it inherits its section role.

**Colors**

- **Main:** structural line #CDCDD2 / #50505B.
- **Secondary:** surrounding surface #FFFFFF / #24242B.
- **Tertiary:** none; coral is reserved for active rules, not every divider.

**Shape changes / attributes:** Straight 1px rectangle; horizontal full width or vertical with explicit height; no rounded ends.

**Code changes:** Keep Separator primitive; set the background token and remove redundant shadows/margins. Pass decorative when visual-only; use orientation vertical where appropriate.

```tsx
<Separator decorative className="fb-separator" />
```

**Interaction and accessibility:** Do not announce purely decorative separators. Spacing communicates grouping; avoid dense repeated lines.

**Application integration:** Useful in Header account controls, Dialog footers and filter groups.

**Primitive reference:** [Separator](https://ui.shadcn.com/docs/components/base/separator).

### 22. Sheet

**Component name:** Sheet

**Purpose:** Desktop side filter editor or contextual player information.

**Typography**

- **Font:** Anton + AT Aero.
- **Size:** 20px, 14px.
- **Width / weight:** 400, 600; use normal font stretch.
- **Role details:** Anton title 20px/130%, weight 400, tracking +0.03em, uppercase; AT Aero body 14px/150%, weight 400; AT Aero actions 14px/100%, weight 600.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square side panel; width 360px desktop, max-width calc(100vw − 24px); full viewport height; 24px padding; thin inner boundary. No rounding or drop shadow.

**Code changes:** Apply fb-popup and side-specific sizing to SheetContent; remove shadow and excessive slide animation classes. Retain title, description, close button and primitive focus behavior. Include filter Apply/Clear buttons in a stable footer.

```tsx
<SheetContent side="right" className="fb-popup">
  <SheetHeader><SheetTitle className="fb-section-title">Market filters</SheetTitle></SheetHeader>
  <div className="fb-scroll-area">{filters}</div>
</SheetContent>
```

**Interaction and accessibility:** 160–200ms translation only, no bounce. Restore trigger focus. On small screens switch to Drawer without duplicating open states.

**Application integration:** Replacement candidate for custom column-filter overlays; preserve pending versus applied filter state.

**Primitive reference:** [Sheet](https://ui.shadcn.com/docs/components/base/sheet).

### 23. Skeleton

**Component name:** Skeleton

**Purpose:** Local partial loading placeholders when layout is already known.

**Typography**

- **Font:** AT Aero.
- **Size:** 12px.
- **Width / weight:** Not applicable; use normal font stretch.
- **Role details:** No font/weight; dimensions mirror actual text or thumbnails. Keep a single AT Aero 12px loading label outside decorative placeholders.

**Colors**

- **Main:** placeholder #EDEDEF / #303039.
- **Secondary:** neutral surface.
- **Tertiary:** no accent required; coral belongs to the primary loader.

**Shape changes / attributes:** Square bars and rectangles with actual content heights; no circular avatars unless the final content is circular. No gradient or moving shimmer.

**Code changes:** Use fb-skeleton flat background and opacity pulse; remove current gradient backgrounds and shadowed skeleton tiles. aria-hidden=true on individual shapes; one busy/status label for the region.

```tsx
<div aria-busy="true" aria-label="Loading player details">
  <Skeleton aria-hidden="true" className="fb-skeleton" />
</div>
```

**Interaction and accessibility:** Stop animation for reduced motion. Use Pulse Ring for initial/full-panel loading; skeletons only for content whose size can be reasonably predicted.

**Application integration:** Update PlayerScreenLoading.css and MarketScreenLoading.css gradient rules.

**Primitive reference:** [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton).

### 24. Switch

**Component name:** Switch

**Purpose:** Binary filters such as show only favorites or available players.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 400, 500; use normal font stretch.
- **Role details:** AT Aero; content 14px/150%, weight 400; labels 12px/140%, weight 500; tracking 0.01em on labels.

**Colors**

- **Main:** off track #EDEDEF / #303039.
- **Secondary:** off thumb #35353D / #E5E5E5.
- **Tertiary:** on track #24CEE5 with black thumb.

**Shape changes / attributes:** 44×24px skewed rectangular track (−15deg), square thumb 16×16px; total target ≥44px. Keep label and focus outline unskewed. No pill track or round thumb.

**Code changes:** Retain Switch primitive. Remove rounded-full on track and thumb; wrap the visual track for skewX while the root remains unskewed. Use data-checked from the installed Base UI primitive, not Radix-only data-state selectors without checking. Native preview uses aria-checked styling.

```tsx
<Switch aria-labelledby="favorites-only-label" className="fb-switch">
  <span className="fb-switch-track"><span className="fb-switch-thumb" /></span>
</Switch>
<label id="favorites-only-label">Favorites only</label>
```

**Interaction and accessibility:** Checked state uses position and color; Space toggles; announce role/label/checked. Keep thumb travel within track. Do not transform hit targets or content labels.

**Application integration:** Optional player/market filter; favorite storage and filtering remain under existing hooks/state.

**Primitive reference:** [Switch](https://ui.shadcn.com/docs/components/base/switch).

### 25. Table · Standard and player/market variants

**Component name:** Table · Standard and player/market variants

**Purpose:** Simple statistics tables and the main player/market list.

**Typography**

- **Font:** AT Aero.
- **Size:** 12px, 14px.
- **Width / weight:** 500, 400; use normal font stretch.
- **Role details:** AT Aero headers 12px/140%, weight 500, uppercase; cells 14px/150%, weight 400; player names/primary values weight 500; numbers right-aligned with tabular numerals.

**Colors**

- **Main:** surface — #FFFFFF light / #24242B dark.
- **Secondary:** content — #35353D / #E5E5E5.
- **Tertiary:** active or focus accent — #FF4B44 in both modes.

**Shape changes / attributes:** Square table and rows; 1px horizontal dividers, no floating cards or shadows. Standard row min 44px; rich player row 64–80px. 32px rectangular image region, aligned actions. Contain horizontal overflow for dense data.

**Code changes:** Style Table wrappers with fb-table. Current player/market lists use ul-based rows: preserve row data/handlers, then deliberately decide semantic table versus labeled list for the rich layout. Put sortable headings in buttons with aria-sort on th. Do not make whole rows click targets when they contain action buttons.

```tsx
<Table className="fb-table">
  <TableHeader><TableRow><TableHead>Player</TableHead>
    <TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
  <TableBody>{rows.map((row) => <TableRow key={row.playerId}>
    <TableCell><Link to={`/players/${row.playerId}`}>{row.name}</Link></TableCell>
    <TableCell className="text-right">{row.valueLabel}</TableCell>
  </TableRow>)}</TableBody>
</Table>
```

**Interaction and accessibility:** Form and value changes use icon + signed value + color. Favorite toggle, bid button and player link are separate controls. Empty, degraded and error states remain explicit; do not render incomplete data as zero.

**Application integration:** MarketRowView, MarketListHead, PlayersListHead and PlayersPage rows retain current points, values, owner and availability content; apply style to PlayerDetail statistical tables too.

**Primitive reference:** [Table · Standard and player/market variants](https://ui.shadcn.com/docs/components/base/table).

### 26. Toast

**Component name:** Toast

**Purpose:** Successful lineup save or bid submission; actionable mutation failure.

**Typography**

- **Font:** AT Aero.
- **Size:** 14px, 12px.
- **Width / weight:** 500, 400, 600; use normal font stretch.
- **Role details:** AT Aero title 14px/140%, weight 500; description 12px/140%, weight 400; action 14px/100%, weight 600.

**Colors**

- **Main:** surface #FFFFFF / #24242B.
- **Secondary:** text #35353D / #E5E5E5.
- **Tertiary:** 4px left rail #10BD00 success / #FF4B44 failure / #FFC413 or #CA9C10 warning.

**Shape changes / attributes:** Square bounded rectangle, border 1px, no shadow; width ≤360px with 16px viewport margins; content/close aligned in a row. Round standalone action only if present.

**Code changes:** Use current Base UI Toast provider/manager and style content with fb-toast; do not silently substitute a different toaster API. Emit from confirmed mutation success, not from click. Deduplicate repeated errors; leave a persistent error in the form if recovery is required.

```tsx
// In existing mutation onSuccess callback:
// toast manager adds: title "Lineup saved", description "Your changes are synced."
// Provider renders className="fb-toast" and data-tone="success".
```

**Interaction and accessibility:** Status for success, alert for urgent error; visible close button, pause timeout while focused/hovered. Success around 5s; actionable error persists until dismissed. UI confirmation of a bid never invents an upstream success.

**Application integration:** Integrate useLineupBoard save flow and useMarketActions onSuccess/onError; retain current form-level errors.

**Primitive reference:** [Toast](https://ui.shadcn.com/docs/components/base/toast).

### 27. Toggle · Favorite player

**Component name:** Toggle · Favorite player

**Purpose:** Follow a player from Players or Market.

**Typography**

- **Font:** AT Aero.
- **Size:** 18–20px, 14px, 12px.
- **Width / weight:** 500, 400; use normal font stretch.
- **Role details:** Icon 18–20px; optional AT Aero label 14px/140%, weight 500. Tooltip/help 12px/140%, weight 400.

**Colors**

- **Main:** transparent/neutral surface, unchanged between states.
- **Secondary:** inactive icon #35353D / #E5E5E5; neutral control border stays unchanged.
- **Tertiary:** active icon stroke/fill #FF4B44 in both modes; no selected container fill.

**Shape changes / attributes:** Square 44px integrated hit target with a neutral 1px border; 18–20px bookmark icon centered in both axes. Selection does not color the button background or border. Only the icon becomes coral and filled.

**Code changes:** Use Toggle with controlled pressed state and onPressedChange. Keep the button surface and border neutral for hover/pressed states; target the child Bookmark SVG for coral stroke/fill. Use aria-pressed in the native preview; use the generated Base UI pressed-state attribute in production (or an explicit class driven by the same controlled boolean). Keep stored favorite IDs and the player-specific accessible name.

```tsx
<Toggle pressed={favorite} onPressedChange={() => onToggleFavorite()}
  aria-label={`Favorite ${player.name}`} className="fb-toggle">
  <Bookmark fill={favorite ? "currentColor" : "none"} aria-hidden="true" />
</Toggle>
```

**Interaction and accessibility:** Favorite is a local follow state in current code; do not imply notifications already exist. Notify options can be an additional feature once implemented. Keyboard toggle and focus ring stay visible.

**Application integration:** Replace features/players/PlayerBookmarkButton.css presentation while preserving favorites.ts behavior.

**Primitive reference:** [Toggle · Favorite player](https://ui.shadcn.com/docs/components/base/toggle).

### 28. Tooltip

**Component name:** Tooltip

**Purpose:** Short explanatory help for icons, form/availability markers and disabled actions.

**Typography**

- **Font:** AT Aero.
- **Size:** 12px.
- **Width / weight:** 400; use normal font stretch.
- **Role details:** AT Aero 12px/140%, weight 400, tracking 0.01em; sentence case for readability.

**Colors**

- **Main:** neutral surface #FFFFFF / #24242B.
- **Secondary:** content #35353D / #E5E5E5.
- **Tertiary:** border #797981 / #9898A3; focus on trigger uses tertiary ink.

**Shape changes / attributes:** Square rectangular body, 8×12px padding, max width 260px; small optional triangular arrow; no rounded-md or shadow.

**Code changes:** Use TooltipProvider, Tooltip, TooltipTrigger and TooltipContent. Replace manual CSS has-hover-tooltip-panel handling. Apply fb-tooltip; remove generated shadow/rounded classes, retain arrow only if it improves placement.

```tsx
<Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon"
  shape="square" aria-label="Availability information" />}>
  <Info aria-hidden="true" />
</TooltipTrigger><TooltipContent className="fb-tooltip">
  Player availability is not confirmed.
</TooltipContent></Tooltip>
```

**Interaction and accessibility:** Show on hover and keyboard focus, close on Escape; use a short ~300ms delay. Tooltip never contains form controls. Keep essential validation visible; disabled controls may need a focusable wrapper, but must not accidentally activate.

**Application integration:** Replace TooltipPanel.css and manual CurrentFixtureTooltip / player availability hover panels where the content is genuinely short. Rich interactive content belongs in Dialog/Sheet.

**Primitive reference:** [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip).

## Refactor review checklist

- All listed components have a defined light/dark treatment and keyboard focus state.
- No `rounded-*` remains on panels, nav, inputs, menus or integrated controls; only approved exceptions use radius.
- No shadow, gradient, glow or blur survives in generated primitives or existing feature CSS.
- Hover states have equivalent focus states; pending/disabled/empty/error states remain distinct.
- Titles use the actual Anton face; actions and body use actual AT Aero faces.
- Only Lineup, Market, Players appear in the primary navigation.
- Number paging never strands pages beyond the first group of three.
- Date editing and rich filters use Dialog/Sheet/Drawer instead of generic Popover.
- Toast success is emitted only after a confirmed successful API response.
- Production primitives retain their built-in focus, selection, dismissal and keyboard behaviors.

## Appendices — complete reference code

The code is standalone reference material, not installed in `frontend/src`. Import `design-system.css` in the consuming entry and place the `.fb-theme` class and `data-theme` attribute on a root that also covers portal content. Copy the font files to the actual asset location and adjust relative URLs. `Button.tsx` is a native React 19 alternative to the generated shadcn Button; it supports normal native button/ref props and the documented visual variants, and deliberately does not promise unrelated polymorphic props. Use the generated Base UI components for overlays, menus and selection behavior.

### A. Buttons

```tsx
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "default" | "lg" | "icon";
export type ButtonShape = "rounded" | "square";

type VariantOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
};

/** Class helper also usable on React Router links, keeping link semantics. */
export function buttonVariants({
  variant = "default", size = "default", shape = "rounded", className = "",
}: VariantOptions = {}) {
  return `fb-button fb-button--${variant} fb-button--${size} fb-button--${shape} ${className}`;
}

export type ButtonProps = ComponentProps<"button"> & VariantOptions & {
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
};

/** Native React 19 button; the ref prop passes directly through to the DOM. */
export function Button({
  variant, size, shape, className, icon, loading = false,
  loadingLabel = "Saving…", disabled, children, type = "button", ...props
}: ButtonProps) {
  return (
    <button {...props} type={type} disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, shape, className })}>
      {loading ? <span className="fb-button-spinner" aria-hidden="true" /> :
        icon ? <span className="fb-button-icon" aria-hidden="true">{icon}</span> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}

```

### B. Number pagination

```tsx
type NumberPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function NumberPagination({ page, totalPages, onPageChange }: NumberPaginationProps) {
  if (!Number.isInteger(totalPages) || totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const count = Math.min(3, totalPages);
  const start = Math.max(1, Math.min(current - 1, totalPages - count + 1));
  const pages = Array.from({ length: count }, (_, index) => start + index);
  return (
    <nav aria-label="Player result pages" className="fb-pagination">
      {pages.map((number) => (
        <button key={number} type="button" className="fb-page-button"
          aria-current={number === current ? "page" : undefined}
          aria-label={`Page ${number}`}
          onClick={() => onPageChange(number)}>{number}</button>
      ))}
      <span className="fb-helper" aria-live="polite">Page {current} of {totalPages}</span>
    </nav>
  );
}

```

### C. Pulse Ring

```tsx
type LoaderProps = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
};

export function PulseRing({ size = "lg", className = "", label = "Loading players…" }: LoaderProps) {
  return (
    <div className={`fb-loader ${className}`} role="status" aria-live="polite">
      <span className={`fb-pulse-ring fb-pulse-ring--${size}`} aria-hidden="true">
        <span className="fb-pulse-ring__outer" />
        <span className="fb-pulse-ring__inner" />
      </span>
      <span className="fb-helper">{label}</span>
    </div>
  );
}

```

### D. Shared CSS

The complete token and component styling reference is in [design-system.css](design-system.css). Generated shadcn sources need the hooks described above; this stylesheet is not a global override that makes every primitive conform without editing its local styles.

## Preview refinements

- Main and section headings: Anton tracking +0.03em.
- Native/custom selects: 18px chevron inset 12px; reserve 44px end padding on native controls. Custom triggers use 12px horizontal padding and a nonshrinking icon.
- Favorite toggle: coral stroke/fill on the icon only. Button background and border remain neutral; keyboard focus outline remains available.
