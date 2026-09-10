# EasyGame Mobile — navigation language

**Revision:** EGDS v2.2.0 · 2026-09-10 · **CURRENT** · mobile only.

One navigation model serves both areas. What changes between Trainer and Parent is the *content* of the five slots, never the mechanics.

## The four levels

| Level | Surface | Rule |
| --- | --- | --- |
| **1 · Primary** | Floating Dock (max 5 slots) | Only what a user opens most days. A slot must earn its place by frequency, not by importance. |
| **2 · Hub** | A glass list of sections inside the last dock tab | Everything else the role can reach. One tap from the dock. |
| **3 · Secondary screen** | `SecondaryScreenLayout` (no dock, back arrow in the AppBar's trailing slot) | Reached from a hub, a card, or a list row. |
| **4 · Sheet** | `BottomSheet` — see `component-specs.md` §A4 | Anything that answers a single question and returns: attendance, call-ups, RSVP reasons, child switching, reschedule, upload picker. No screen writes its own modal. |

**Hard limit: five dock slots.** A sixth feature does not get a tab; it gets a hub row. The dock is chrome, not a sitemap.

## Trainer primary navigation

Unchanged from the shipped app — it is correct.

| Slot | Label | Icon (filled / outline) | Contains |
| --- | --- | --- | --- |
| 1 | `Home` | `home` | Dashboard: today's highlights, season counters |
| 2 | `Allenamenti` | `fitness` | Training list → attendance sheet |
| 3 | `Gare` | `football` | Match list → call-up sheet |
| 4 | `Atleti` | `people` | Roster → athlete profile |
| 5 | `Profilo` | `person` | Account + the hub |

Hub (`Altre sezioni`, inside Profilo): Bacheca · Documenti · Appuntamenti · Compensi · Squadre. Every hub row is gated by the club's real permission; a row the club has switched off is **absent**, never greyed.

## Parent primary navigation

Fourteen web features, five slots. The split is by *how often a parent opens it*, not by how the web dashboard groups it.

| Slot | Label | Icon | Contains |
| --- | --- | --- | --- |
| 1 | `Home` | `home` | Selected child's next events, RSVP still pending, enrollment status, anything overdue |
| 2 | `Calendario` | `calendar` | Trainings + matches + appointments + bookings on one timeline, RSVP inline |
| 3 | `Segreteria` | `wallet` | Payments, documents, consents, enrollment — the money-and-paperwork area |
| 4 | `Bacheca` | `megaphone` | Club announcements + notifications |
| 5 | `Profilo` | `person` | Account, children, clubs, contacts + the hub |

Why this split:

- **Trainings and matches are not separate tabs for a parent.** A parent asks "what has my child got this week?", not "show me matches". They merge into `Calendario`, filterable by type.
- **Payments, documents, consents and enrollment are one job** — the club's paperwork — and they interleave (a payment blocked by a missing document). One tab, four sections.
- **Notifications is not a tab.** It shares `Bacheca`, with the unread count as a badge on that slot. A separate notifications tab competes with the thing it notifies about.
- **Appointments, bookings, contacts and structures are hub rows**, not tabs: a parent uses them a few times a season.

Hub (inside Profilo): Appuntamenti · Prenotazioni strutture · Contatti club · I miei figli · Accessi e club · Impostazioni.

## Child switcher placement

- **In the navy sky, directly under the AppBar, on all five Parent primary screens** — enforced by `ParentPrimaryScreenLayout` (`component-specs.md` §A5), which is the only correct shell for those screens. It is the scope indicator for everything below it, so it must be visible wherever scoped data is shown.
- **Never in the dock.** The dock is for destinations; the switcher is a filter.
- **Never only in the profile.** A parent must be able to switch without leaving the screen they are reading.
- **One child → static header, no control.** No one-item pickers.
- **Secondary screens inherit the selected child** and show it as the AppBar eyebrow (`Marco · AS Roma Giovanili`) rather than repeating the full switcher.
- **Cross-club children:** switching child may switch club. The club name is always on the pill, and the AppBar eyebrow updates, so the change is never silent.
- On sheets, the switcher is not shown — a sheet always inherits the context it was opened from.

## Account / profile access

- The **last dock slot is always `Profilo`** in both areas. It is the only stable location for identity, and it holds the hub.
- **Context switching** (club + role) lives in `Profilo → Accessi e club`, built from `AccountAccessCard`. It is also the post-login landing screen when the identity carries more than one membership — never auto-selected.
- **Notifications** are reachable from the AppBar bell on any primary screen, and as a section under `Bacheca`. Both paths land on the same screen.
- **Logout** sits at the bottom of `Profilo`, destructive variant, and nowhere else.
- A role the mobile app does not yet support lands on a single explanatory screen with a way back to context selection — it is never dropped into an empty tab shell.

## Motion and transitions

- Dock tab change: no screen transition, the active puck slides between slots.
- Push to a secondary screen: standard platform push. Back is the AppBar chip or the platform gesture — both, always.
- Sheets: `BottomSheet` — 220ms in, 180ms out, scrim fades with it; dismiss by scrim tap, platform back, or `Annulla`. A sheet that mutates data confirms only with its primary button, never on dismiss. Drag-to-dismiss is a declared gap (no gesture library adopted); the grabber is a visual affordance.
- Never animate blur.

## Rules that keep the two areas coherent

1. Five dock slots maximum, `Profilo` always last, labels are single Italian nouns.
2. Only the active tab shows its label; inactive tabs are outline glyphs at white 55%.
3. Every screen has exactly one AppBar eyebrow + display title pair. No screen has two titles.
4. A secondary screen never shows the dock; a primary screen never shows a back arrow.
5. Permission-hidden means absent, not disabled. Role-unsupported means explained, not hidden.
6. Bottom clearance: 124px on a dock screen, 40px + safe-area on a secondary screen.
