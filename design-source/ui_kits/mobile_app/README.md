# EasyGame Mobile — UI kit

Click-through recreation of the EasyGame coach app (Italian, trainer MVP) in the EasyGame signature language — floodlit layered ground, glass panels with the cut corner, Event Cards with time rails, Number Tiles, ring Status Pills, the Floating Dock and gradient Action Surfaces. 390×844, one screen at a time, real component library.

Open `index.html`. Flow:

1. **Login** — `Accedi` signs in (any values). `Configurazione Server` expands the dev server field, as in the app.
2. **Dashboard** — three module highlight cards (allenamenti / gare / promemoria) and two counter tiles. Each card's action jumps to its tab.
3. **Allenamenti** — today / this week / later, each session card with location, headcount and status. `Presenze` opens the attendance sheet: tap a row to toggle Presente/Assente, `Salva presenze` writes the count back onto the card. `Annulla` cancels the session and flips its status line.
4. **Gare** — today / this week. `Convocazioni` opens the call-up sheet (blue accent, Convocato / Non convocato); saving updates the convocati count.
5. **Atleti** — search filters the roster live; status badges follow the app's mapping.
6. **Profilo** — account form, active club, permission badges, settings list, `Esci` returns to login.

Files: `data.js` (mock roster, sessions, matches), `Shell.jsx` (phone frame, app bar + tab bar shell, modal sheet), one file per screen, `App.jsx` (navigation state).

Fidelity notes: this is a cosmetic recreation, not the app's code. Native behaviours that have no web equivalent — haptics, pull-to-refresh, safe-area insets, reanimated springs on mount — are omitted or reduced to a scale/fade. Permission gating (which tabs and actions a trainer can see) exists in the real app and is shown here as always-on with a permissions card in Profilo.
