# 10 · Implementation handoff — EasyGame Web

**EGDS v3.1.0 · CURRENT.** This is the contract for whoever implements the EasyGame Web redesign. Read `05` → `09` first; this document is the index, the naming rules and the decision procedure for everything the mockups do not show.

## 10.1 The rule that governs the whole redesign

> **Claude Design mockups are not an exhaustive functional specification.**
> **When implementing the redesign, existing EasyGame application code remains the source of truth for supported business functionality.**
> **Any supported existing capability missing from a mockup must be recreated using the CURRENT EasyGame Web Design System rather than removed.**

Corollaries, in force for every screen:

1. **Nothing gets dropped because it was not drawn.** If the production app has a field, a filter, an export, a permission, a bulk action, a tab or an edge case that no mockup shows, it ships — expressed in this system's patterns.
2. **Nothing gets invented because it was not drawn either.** A capability absent from both the code and this system is a product decision, not an implementation one. Build the page without it and raise it.
3. **When code and design disagree about *behaviour*, the code wins.** When they disagree about *appearance, wording, layout or interaction shape*, this system wins.
4. **The decision procedure** when you hit something unspecified:
   a. Is there a pattern for this shape of thing in `05`–`09`? Use it verbatim.
   b. Is there a near neighbour (another list, another form, another status)? Copy it, including its copy style.
   c. Is it a new *kind* of thing? Compose it from the primitives — panel, field, pill, chip, drawer, alert — and never introduce a new colour, radius, shadow, gradient or font size.
   d. Still stuck? Ship the simplest composition that obeys §10.5 and flag it. Do not stop, and do not invent a second visual language.

## 10.2 Current version and authority

| | |
| --- | --- |
| **Design system** | **EGDS v3.1.0 · "EasyGame blue"** — CURRENT |
| **Web section** | `guidelines/05-web-desktop.md` · `06-web-shell.md` · `07-web-datagrid.md` · `08-web-forms.md` · `09-web-patterns.md` · this file |
| **Platform-independent** | `01-brand.md` · `02-foundations.md` · `03-core-components.md` — hold on web without change |
| **Mobile** | `04-mobile.md` — **does not apply to web.** Do not port BottomSheet, the floating dock, glass surfaces, tap-scale motion or 44px touch geometry |
| **Deprecated** | `guidelines/deprecated.md` — read it once before starting; everything in it is a "do not use" |
| **Tokens** | `styles.css` (links everything) · `tokens/web.css` is the web layer · `tokens/*.css` is the shared base |
| **Authoritative artifact** | The **Iterazione 4** web direction and the `EGShell` / `EGRecord` / `EGAthlete` frames. The earlier web direction boards (v1, v2), the light-sidebar screen overview and the `v0.1 bozza` geometry are **superseded** — see `deprecated.md` §Web |

If two things in this repository disagree, precedence is: `deprecated.md` → `05`–`10` → `02-foundations.md` → `tokens/web.css` → the mockup files.

## 10.3 Visual tokens — the whole surface

Consume `styles.css`. Use variables; do not paste hex values into components.

- **Ground**: `--egw-page` `--egw-page-100` `--egw-page-050` `--egw-page-025` `--egw-panel`
- **Ink**: `--egw-ink` `--egw-ink-72` `--egw-ink-62` `--egw-ink-42` (floor)
- **Brand**: `--egw-blue` `--egw-blue-700` `--egw-blue-800` `--egw-indigo` `--egw-navy-800` `--egw-navy-900`
- **Semantic**: `--egw-green` `--egw-amber` `--egw-amber-ink` `--egw-red` `--egw-orange` + `--egw-tint-*` / `--egw-tint-*-bd`
- **Gradients**: `--egw-grad-action` `--egw-grad-sidebar` `--egw-grad-drawer` `--egw-grad-match` `--egw-grad-navy` `--egw-grad-hairline`
- **Radii**: `--egw-r-panel` `--egw-r-panel-sm` `--egw-r-field` `--egw-r-control` `--egw-r-chip` `--egw-r-micro` `--egw-r-check` `--egw-r-menu` `--egw-r-pill`
- **Elevation**: `--egw-plane-1` `--egw-plane-2` `--egw-plane-menu` `--egw-plane-drawer` `--egw-glow-action` `--egw-scrim`
- **Geometry**: `--egw-sidebar-w` `--egw-sidebar-collapsed-w` `--egw-topbar-h` `--egw-page-gutter` `--egw-page-max` `--egw-panel-gap` `--egw-panel-pad` `--egw-drawer-w*` `--egw-modal-w` `--egw-menu-w`
- **Density**: `--egw-row-h` (44 default) `--egw-row-h-comfortable` `--egw-row-h-compact` `--egw-row-head-h`
- **Controls**: `--egw-btn-h` `--egw-btn-h-sm` `--egw-btn-h-xs` `--egw-field-h` `--egw-field-h-sm` `--egw-nav-h`
- **Type**: `--egw-t-*` and `--egw-track-*`
- **State & motion**: `--egw-focus-ring` `--egw-focus-border` `--egw-focus-ring-dark` `--egw-focus-ring-danger` `--egw-dur-*` `--egw-ease`

**Adding a token is a design-system change**, not an implementation detail. If a screen needs a value that does not exist, the nearest existing token is almost always right.

## 10.4 Component inventory to build

Names are the implementation contract. Build them once, in this order — each later group depends on the earlier ones.

**Shell** — `AppShell` · `Sidebar` · `SidebarGroup` · `SidebarItem` · `ClubSwitcher` · `Topbar` · `Breadcrumb` · `GlobalSearch` · `SeasonChip` · `QuickActionsButton` · `QuickActionsDrawer` · `NotificationBell` · `NotificationDrawer` · `AccountMenu`

**Primitives** — `Button` (primary · neutral-strong · secondary · row · text · danger · ghost-on-sky · inverted-on-sky) · `IconButton` · `Panel` · `PanelHeader` · `Eyebrow` · `StatusPill` · `DataChip` · `IconChip` · `IdentityTile` · `Avatar` · `Tooltip` · `Popover` · `Menu` · `SegmentedControl` · `Tabs` · `Skeleton` · `ProgressBar` · `Toast` / `ToastHost`

**Page frame** — `PageHeader` · `PageActions` · `ContextControls` · `AlertBlock` · `AlertCard` · `SectionNav` · `StickyActionBar`

**DataGrid** — `DataGrid` · `GridViewsBar` · `SavedViewChip` · `GridToolbar` · `FilterChip` · `FilterPopover` · `AdvancedFilterDrawer` · `ColumnPopover` · `DensityToggle` · `ExportMenu` · `ImportDrawer` · `GridHeaderRow` · `GridRow` · `GridGroupHeader` · `BulkBar` · `BulkOperationDrawer` · `GridFooter` · `Pagination` · `GridEmpty` · `GridFilteredEmpty` · `GridError` · `GridRestricted` · `GridSkeleton`

**Forms** — `Field` (label + control + helper/error) · `TextInput` · `NumberInput` · `CurrencyInput` · `PercentInput` · `EmailInput` · `PhoneInput` · `Textarea` · `Select` · `SearchableSelect` · `Autocomplete` · `MultiSelect` · `Checkbox` · `RadioGroup` · `Toggle` · `DatePicker` · `DateRangePicker` · `TimePicker` · `FileInput` · `DropzoneUpload` · `DocumentUpload` · `FieldGroup` · `FormSection` · `Stepper` · `InlineEdit` · `ValidationSummary`

**Overlays** — `Drawer` (392 · 480 · 720) · `Inspector` · `Modal` · `ConfirmDialog` · `DangerConfirmDialog` (typed) · `DirtyGuardDialog` · `CommandPalette` (stub)

**Cards** — `KpiCard` · `KpiBar` · `SummaryCard` · `ActionableCard` · `InfoCard` · `FinanceSummaryCard` · `TimelineCard` · `DetailCard` · `EmptyStateCard` · `InspectorSummary`

**Record** — `RecordHeader` · `RecordAreaSwitcher` · `RecordAlertStrip` · `CollapsedSection`

## 10.5 Non-negotiable rules — the review checklist

A screen is not done until every line is true.

1. **One environment per page**; the sky band exists only on the Dashboard; auth and system pages are full sky.
2. **One action gradient per screen**, plus the sidebar's active item. Nothing else is a gradient fill.
3. **The action gradient never fills a button on blue** — invert to white with a navy label.
4. **Status is a word.** Every coloured state carries its Italian label and its ring dot. No coloured rows, ever.
5. **Numbers are tabular, 700/800, larger than the text beside them.** Amounts right, dates left, `—` for missing.
6. **Three ink levels, floor at 42%.** No black, no mid-grey, no text below 42%.
7. **Three planes.** No card inside a card.
8. **The cut corner on every rectangular surface**; the status pill and the avatar are the only round things.
9. **No glass, no blur** on a working page (the account menu over the sky is the single exception).
10. **Row ≤48px**, default 44. Breathing room between panels, not inside rows.
11. **Drawers create and edit; modals only confirm.** No long scrolling centred modals. One layer at a time.
12. **Every interactive element defines rest · hover · focus-visible · active · selected · disabled.** Focus is always visible.
13. **Permission-denied means absent, not disabled.**
14. **Every list is the one DataGrid.** Every alert is the one alert pattern. Every count is clickable and lands on a filtered grid.
15. **Destructive confirmation is proportional** — typed confirmation only for irreversible or wide operations.
16. **Italian, no emoji, no exclamation marks**, `·` as separator, `—` for missing data, sentence case for sentences and the product's own casing for module names.
17. **Long Italian labels fit.** Nothing ellipses that the user needs to read.
18. **Nothing from `deprecated.md` appears anywhere.**

## 10.6 Naming conventions

- **CSS variables**: `--eg-*` shared, `--egw-*` web-only. Never a raw hex in a component.
- **Components**: PascalCase, English, domain-neutral (`DataGrid`, not `AtletiTable`). A module-specific composition is `<Module><Pattern>` (`AtletiListPage`, `AtletaRecordPage`).
- **Props**: `variant` for appearance (`primary | neutral | secondary | row | text | danger`), `tone` for semantics (`neutral | info | success | warning | danger`), `size` for scale (`sm | md`), `density` (`compact | medium | comfortable`), `state` for lifecycle (`loading | empty | filtered-empty | error | restricted`).
- **Status values** are the API's enum; the *label* is Italian and comes from one map in one file, so a word is never retyped in a component. Add `absent`-style explicit values rather than relying on a visual-only state (the mobile attendance lesson).
- **Persisted user preferences** key as `egw.<module>.<setting>`: `egw.atleti.view`, `egw.atleti.density`, `egw.atleti.columns`, `egw.shell.sidebar`.
- **Copy** lives in an Italian string file per module, not inline. Statuses, alerts and empty states come from shared maps so the same situation never gets two wordings.
- **Test ids**: `data-test="<component>-<slot>"`.

## 10.7 Current assets

| Asset | File | Use |
| --- | --- | --- |
| Logotype, white | `assets/logo-white.png` | Sidebar (168px), login page, sky surfaces |
| Logotype, blue | `assets/logo-blue.png` | Light grounds, documents, exported PDFs |
| Mark, white | `assets/icon-white.png` | Collapsed sidebar (30px), 5% watermark on environment-3 skies |
| Mark, blue | `assets/icon-blue.png` | Favicon contexts, light chrome |
| App icon / favicon / social | `assets/app-icon.png`, `assets/favicon.png`, `assets/social.png` | Browser and sharing |
| Icons | `assets/icons/*.svg` (Ionicons, MIT) | Masked so the glyph takes `currentColor`; set the icon base path once per page |

Never retype the logotype as text, never recolour it, never box the mark in a gradient tile, never letter-space it. Club crests are user content: circular, 32px in chrome, 72px on a record header, initials on a navy-gradient ground as the fallback.

## 10.8 Deprecated on web — remove on contact

The full list is `guidelines/deprecated.md`. The web-specific entries: the six coloured gradient dashboard module cards · the purple/violet page titles · the nine-tab record strip · the red solid `Elimina` button in a record header · glass and blur on working pages · the light white sidebar · the full-width blue page backgrounds outside the Dashboard · `powered by` footers inside the app · icon-only document and payment actions · two-state attendance · long scrolling centred modals for creation · status shown by colour alone.

## 10.9 Definition of done, per page

1. All three grounds correct for the page's environment; sidebar and topbar untouched.
2. Page header: title, description, context controls, exactly one primary.
3. Every list is a `DataGrid` with views, filters, density, columns, export, pagination and all six states wired.
4. Every create/edit path is a drawer of the right width, with the dirty guard.
5. Every status renders from the shared map, with its word.
6. Every alert has a count, an explanation of consequence and a resolving verb.
7. Keyboard: full tab order, visible focus, grid keys, `Esc` on every layer.
8. 1152 / 1280 / 1440 / 1920 all checked; long Italian labels checked.
9. Every capability present in the production module is present here (§10.1).
10. Nothing from `deprecated.md` survives.
