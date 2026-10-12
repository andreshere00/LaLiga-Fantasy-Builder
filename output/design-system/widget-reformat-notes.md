# Widget reformat proposals

Proposals based on the eight supplied screenshots. These examples use screenshot snapshot values; they are not live account, market, medical or forecast updates. Portrait initials and abbreviated club marks are layout placeholders.

## 01. Header and lineup command bar

**Reference:** Image 1.

**Reformat:** Replace the tall centered banner and rounded floating controls with a compact wordmark, three flat navigation links, and one square command panel. Group fixture, score and formation; place Save as the primary rounded action. Team value remains a neutral number, not a colored button. Build lineup remains visibly disabled until available.

**Implementation points:** `Header.*; LineupPage.*; shared Button/NativeSelect`.

## 02. Ranking, pitch and squad

**Reference:** Image 1.

**Reformat:** Use flat leaderboard rows with a coral selection rule. Keep the central football pitch recognizable, but use thin neutral field markings. Square player cards use a fixed portrait area, compact point marker and readable name strip. A neutral count accompanies the squad grid; on small screens rank and squad sections stack below the pitch.

**Implementation points:** `PlayerTile.*; lineup-layout.css; LineupPage.*`.

## 03. Market row and deal controls

**Reference:** Image 2.

**Reformat:** Consolidate photograph and player identity in one cell. Align position, points, three-fixture form, value change and status consistently. Use small square score blocks and label availability with a symbol plus text. Show a square integrated Options action; its menu leads to a proper confirmation dialog. A submitted-bid label is neutral, distinct from a new-action button.

**Implementation points:** `MarketListHead; MarketRowView; MarketToolbar; MarketActionDialogs`.

## 04. Player catalog and favorites

**Reference:** Image 3.

**Reformat:** Use the same row anatomy as Market with owner and favorite columns. Bookmark selection colors only the icon. Search and club select share a 44px baseline; the chevron sits 12px from the edge. Apply three-number sliding pagination. Player-name links open details; they do not make the entire multi-action row clickable.

**Implementation points:** `PlayersPage.*; PlayersListHead; PlayerBookmarkButton.*`.

## 05. Player summary and average metrics

**Reference:** Image 4.

**Reformat:** Replace the long single summary card with a square identity block and six equally weighted metric cells. Put Availability beside the name and its explanatory injury text underneath. Use neutral large metric values rather than coloring every number coral. Averages Details opens a collapsible region; favorite and options remain separate controls.

**Implementation points:** `PlayerDetailPage.*; PlayerAveragesPanel; playerDetailWidgets.css`.

## 06. Form / fixture cards

**Reference:** Image 4.

**Reformat:** Replace solid coral section banners and shadows with Anton section headings and a short coral rule. Period selectors are square attached controls. Fixture cards align opponents, date, minutes and points on common baselines. A missing/unplayed value displays — and a status label, never a zero.

**Implementation points:** `PlayerFantasySection; playerDetailWidgets.css`.

## 07. Market-value chart

**Reference:** Image 5.

**Reformat:** Use a theme-native neutral plot with subtle horizontal grid lines. Remove coral glow and drop shadows. Keep one coral value line; an optional dashed neutral trend line has an explicit legend. Put current value and signed change above the chart, with units on the axis. Period controls are square; Custom dates use Dialog plus Calendar.

**Implementation points:** `PlayerDetailPage; market-value chart / Recharts configuration`.

## 08. Previous / upcoming matches, timer and weather

**Reference:** Images 5–6.

**Reformat:** Use compact square match cards with small rectangular club marks, one central score line, competition/date and player minutes. Upcoming cards show kickoff and an expandable countdown rather than a separate floating action. Weather has a neutral icon and concise measurements; unavailable forecasts use an explicit message. Outcomes use text plus a small colored rail, not red/green score tiles everywhere.

**Implementation points:** `PlayerMatchesSection; playerDetailWidgets.css; existing timer/weather data`.

## 09. Fantasy profile, news and injury history

**Reference:** Images 7–8.

**Reformat:** Create three square panels with consistent header height and left-aligned content. Present hierarchy, starter likelihood, form and risk as aligned labeled rows. News becomes a dated list with source labels and clamped headlines; injury history becomes a structured timeline with current versus ended status. Replace Older/Newer buttons with three-number pagination. Keep provided source data and explanatory details intact.

**Implementation points:** `playerDetailWidgets; PlayerDetailPage; list pagination`.

## 10. Footer and small graphic elements

**Reference:** Image 8.

**Reformat:** Use a flat square footer with a thin divider and restrained text links. Standardize icons to 18–20px and badges to square rectangles; use semantic color only where it encodes status. Keep favorite hit targets neutral, focus outlines visible, headings at +0.03em tracking, and all panel backgrounds opaque.

**Implementation points:** `Footer.*; shared tokens/fonts; badges and icon wrappers`.

