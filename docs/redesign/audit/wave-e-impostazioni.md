# Wave E — Audit di parità: Impostazioni (`/settings`)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce, salvo ciò che è dichiarato come
> difetto della V1. Nessuna proposta di design.
>
> Rotta coperta: `/settings`. File letti per intero:
> `src/app/settings/page.tsx` (626 righe), `src/app/settings/layout.tsx`
> (riesporta `management-area-layout`), `getClubSettings` e
> `saveClubSettings` in `src/lib/simplified-db.ts`.

---

## 1. Dati mostrati

Stato locale `settings` con default:
- `notifications: { certificates: true, trainings: true, athletes: true,
  email: true }`
- `system: { language: "it", dateFormat: "dd/mm/yyyy", backup: true }`
- `security: { currentPassword, newPassword, confirmPassword, currentPin,
  newPin, confirmPin }` tutti `""` (mai letti dal database).

Sorgente: `localStorage.activeClub` → `clubId`; `getClubSettings(clubId)`
(`SELECT settings FROM clubs WHERE id`) → fusione di `settings.notifications`
e `settings.system` sui default. Senza `activeClub`: `console.warn`, fine del
caricamento (modulo con i default). JSON non valido → toast «Errore nel
caricamento dei dati del club»; club senza `id` → «ID Club non trovato»;
eccezione → «Errore nel caricamento delle impostazioni».

**Nessun consumatore** di `settings.notifications.*`, `settings.system.*`,
`app-language`, `language-change` esiste altrove in `src/` (grep). Sono
preferenze memorizzate e non lette.

## 2. Azioni

- «Salva preferenze» (Notifiche) → `saveClubSettings(clubId, {
  notifications })` → toast «Preferenze notifiche salvate con successo»;
  errore «Errore nel salvataggio delle preferenze notifiche»; senza `clubId`
  «ID club non disponibile».
- «Salva impostazioni» (Sistema) → `saveClubSettings(clubId, { system })`,
  poi `document.documentElement.lang = language`,
  `localStorage["app-language"] = language`, evento `language-change`, toast
  «Impostazioni sistema salvate con successo»; se `language !== "it"`
  **ricarica la pagina** dopo 1 s (non esiste alcuna traduzione: la
  ricarica non cambia nulla).
- «Aggiorna Password» e «Aggiorna PIN» (Sicurezza) → **stesso gestore**
  `saveSecuritySettings`: verifica che nuova password = conferma («Le
  password non corrispondono») e nuovo PIN = conferma («I PIN non
  corrispondono»), poi `saveClubSettings(clubId, { security: {
  lastPasswordChange: now, lastPinChange: newPin ? now : undefined } })`,
  svuota i campi e mostra «Impostazioni di sicurezza aggiornate con
  successo». **Nessuna password e nessun PIN vengono cambiati**: la password
  attuale non è verificata, la nuova non è inviata a nessuna rotta, e un PIN
  di sicurezza non esiste nel prodotto (nessuna occorrenza in `src/lib`,
  `src/app/api`, KB 07). È un pulsante che finge un invio.

`saveClubSettings` (`simplified-db`): legge `settings`, fonde in memoria
`{...current, ...patch}` e riscrive **l'intera** colonna (debito noto,
16 §«clubs.settings si riscrive per intero»).

## 3. Moduli

**Notifiche** (card «Preferenze Notifiche»): quattro `Switch` con etichetta e
riga di aiuto — «Certificati in scadenza» / «Ricevi notifiche quando i
certificati medici stanno per scadere» (`certificates`); «Allenamenti» /
«Ricevi notifiche per nuovi allenamenti programmati» (`trainings`); «Nuovi
atleti» / «Ricevi notifiche quando vengono registrati nuovi atleti»
(`athletes`); «Notifiche email» / «Ricevi notifiche anche via email»
(`email`). Pulsante «Salva preferenze».

**Sistema** (card «Impostazioni Sistema»): «Lingua» / «Seleziona la lingua
predefinita del sistema» (`<select>` nativo: it Italiano · en English · es
Español · fr Français); «Formato data» / «Seleziona il formato data
predefinito» (`dd/mm/yyyy` DD/MM/YYYY · `mm/dd/yyyy` MM/DD/YYYY ·
`yyyy-mm-dd` YYYY-MM-DD); «Backup automatico» / «Esegui backup automatici
dei dati» (`Switch`). Pulsante «Salva impostazioni».

**Sicurezza** (card «Sicurezza»): «Cambia Password» — Password Attuale,
Nuova Password, Conferma Password (`type=password`), «Aggiorna Password»;
«Cambia PIN di Sicurezza» — «Il PIN a 4 cifre è utilizzato per proteggere i
dati sensibili come stipendi e pagamenti.», PIN Attuale, Nuovo PIN, Conferma
PIN (`maxLength=4`), «Aggiorna PIN». Nessuna validazione oltre l'uguaglianza
nuovo/conferma; nessun campo obbligatorio.

## 4. Filtri / viste

Nessuno.

## 5. Azioni di massa

Nessuna.

## 6. Export / import

Nessuno.

## 7. Permessi

Rotta in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` (`/settings`): solo `owner` e
`club_manager`, tramite `management-area-layout` → `AccessAreaGuard`. Nessun
predicato client nella pagina.

## 8. Stati

- Loading: guscio completo + spinner + «Caricamento impostazioni...».
- Nessuno stato di errore in pagina (solo toast); nessun vuoto.
- Un paragrafo nascosto (`hidden`) ripete il sottotitolo: codice morto.

## 9. Flussi distruttivi

Nessuno.

## 10. Navigazione e parametri

Nessun parametro letto. `Tabs defaultValue="notifications"` (non in URL).
Voce di menu «Impostazioni» nel gruppo IMPOSTAZIONI (`navigation.ts`).

## 11. Schede

Tre tab Radix: Notifiche (Bell), Sistema (Settings), Sicurezza (Shield), in
una `TabsList` scorrevole.

## 12. Test collegati

Nessun test cita `src/app/settings/page.tsx` (grep su `tests/`). La rotta
compare solo in `access-roles` (classificazione) e nei test di navigazione
del guscio.

## 13. Inventario componenti

`Sidebar, Header, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, Card*, Button, Input, Label, Tabs*, Switch, useToast`;
lib: `saveClubSettings, getClubSettings`; icone `Settings, User, Bell,
Shield, Building, Globe` (tre inutilizzate). Nessun componente specifico
della rotta fuori da `page.tsx`.

## Difetti V1 dichiarati (candidati a GAP)

1. La scheda **Sicurezza** non cambia nulla: registra due timestamp in
   `clubs.settings.security` e conferma un'operazione che non è avvenuta. La
   password si cambia dal recupero password (`/auth/forgot-password`, KB 07)
   e l'account personale vive in `/account`; il PIN non esiste.
2. Il salvataggio di «Sistema» ricarica la pagina quando la lingua non è
   `it`, senza che esista una traduzione da applicare.
