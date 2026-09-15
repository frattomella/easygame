# Wave E — Audit di parità: Permessi allenatore

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2. È il contratto di parità:
> niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/permissions` («Permessi allenatore» nella barra laterale,
> gruppo *Impostazioni*; il nome è fissato da PP-01 §M). File:
> `src/app/permissions/page.tsx` (7 righe, monta il componente),
> `src/app/permissions/layout.tsx` (`management-area-layout` →
> `AccessAreaGuard`), `src/components/permissions/trainer-permissions-page.tsx`
> (530 righe). Dominio: `src/lib/trainer-dashboard-permissions.ts`; lettura e
> scrittura via `getClubSettings` / `saveClubSettings` di `simplified-db.ts`.

---

## Guscio

La pagina monta da sé `Sidebar` + `Header title="Permessi Allenatore"` +
`main` (`max-w-7xl`), su `bg-gray-50`. Nessun `DashboardPageContainer`.

## 1. Dati mostrati

Una lettura: `getClubSettings(activeClub.id)` → `clubs.settings` (via
l'adapter `supabase`, risorsa `clubs`); `resolveTrainerDashboardPermissions(settings)`
fonde `settings.trainerDashboardPermissions` (o
`trainer_dashboard_permissions`) con `DEFAULT_TRAINER_DASHBOARD_PERMISSIONS`.
Se `getClubSettings` fallisce **restituisce `{}`** (inghiotte anche il 403):
la pagina mostra i default (tutti accesi) come se fossero la configurazione
reale — debito **PP01-D5** in [16]. Senza `activeClub?.id` niente lettura.

Intestazione: occhiello «Dashboard Trainer», titolo «Controlla esattamente
cosa il trainer può vedere e fare», testo «Il trainer vedrà sempre e solo
categorie, atleti, allenamenti e gare assegnate al suo profilo. Da qui
definisci quali pagine, widget e funzioni operative rendere disponibili
nella sua dashboard.», badge «Scope per categorie assegnate» e «Club:
{activeClub.name || "non selezionato"}».

Tre card di interruttori (`Switch`), ognuno con etichetta e descrizione:

**Navigazione** (`permissions.navigation`, 10 chiavi, `NAV_OPTIONS`):
`home` «Home dashboard» · `trainings` «Pagina allenamenti» · `matches`
«Pagina gare» · `athletes` «Pagina atleti» · `categories` «Pagina
categorie» · `board` «Pagina bacheca» · `appointments` «Pagina
appuntamenti» · `documents` «Pagina documenti» · `compensation` «Pagina «I
miei compensi»» · `notifications` «Pagina notifiche» (con le descrizioni
del sorgente; la loro presenza è vincolata da
`permessi-navigazione-allenatore.test.mjs`, che pretende che ogni chiave
rispettata da una schermata dell'area allenatore sia nell'elenco e
viceversa).

**Widget Home** (`permissions.widgets`, 5 chiavi, `WIDGET_OPTIONS`):
`summary` «Card riepilogo» · `upcomingTrainings` «Prossimi allenamenti» ·
`upcomingMatches` «Prossime gare» · `assignedAthletes` «Roster in evidenza»
· `assignedCategories` «Categorie in evidenza».

**Azioni e dati** (`permissions.actions`, 10 chiavi, `ACTION_OPTIONS`):
`viewTrainingDetails` «Dettagli allenamento» · `manageAttendance` «Gestione
presenze» · `manageTrainingStatus` «Calendario di allenamenti e gare»
(descrizione che nomina *creare, spostare, annullare e ripristinare*,
vincolata da `pp-03-calendario-allenatore-raggiungibile.test.mjs`) ·
`viewMatchDetails` «Dettagli gara» · `manageConvocations` «Gestione
convocazioni» · `viewAthleteDetails` «Scheda atleta estesa» ·
`viewAthleteTechnicalSheet` «Scheda tecnica atleta» · `viewAthleteContacts`
«Contatti atleta» · `viewMedicalStatus` «Stato medico» ·
`viewEnrollmentAndPayments` «Iscrizione e pagamenti».

## 2. Azioni

- **Preset rapidi** (card): **Sola consultazione** (`READ_ONLY_PRESET`:
  navigazione e widget di default, azioni solo di lettura:
  `viewTrainingDetails, viewMatchDetails, viewAthleteDetails,
  viewAthleteTechnicalSheet` accesi, il resto spento), **Operatività
  controllata** (`CONTROLLED_PRESET`: tutto acceso tranne
  `viewAthleteContacts` e `viewEnrollmentAndPayments`), **Accesso completo**
  (`FULL_PRESET` = default). Applicare un preset **sostituisce** lo stato
  locale (non salva).
- Ogni interruttore aggiorna lo stato locale.
- **Salva permessi trainer** (`Save`, «Salvataggio...» mentre invia;
  `disabled={isLoading || isSaving || !activeClub?.id}`) →
  `saveClubSettings(activeClub.id, buildTrainerDashboardPermissionPayload(permissions))`
  (scrive **entrambe** le chiavi `trainerDashboardPermissions` e
  `trainer_dashboard_permissions` in `clubs.settings`, fondendo con le
  impostazioni esistenti). Senza club: toast «Nessun club attivo
  selezionato».

## 3. Moduli

Un unico modulo di 25 interruttori booleani; nessuna validazione; nessuna
guardia sulle modifiche non salvate; nessun indicatore di «modificato».

## 4–6. Filtri, viste, selezione, export

Nessuno.

## 7. Permessi

- Rotta in `MANAGEMENT_PATHS` e in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`
  (`access-roles.ts`): la guardia di rotta la riserva ai ruoli
  amministrativi; **nessun predicato client** nella pagina.
- Il server: la scrittura passa dalla risorsa `clubs` (`settings`), riservata
  a chi amministra il club (`canManageClubConfiguration`).
- Debito noto **PP01-D5**: un `custom:*` passa la guardia, la lettura
  inghiotte il 403 e la pagina mostra tutti gli interruttori accesi; il
  salvataggio poi fallisce. Non è materia di questa migrazione.

## 8. Stati (con il testo)

- Loading: nessun indicatore visivo (gli interruttori mostrano i default
  finché la lettura non arriva); il pulsante Salva è disabilitato.
- Errore di lettura: toast «Errore nel caricamento dei permessi trainer»
  (solo se `getClubSettings` lancia, cosa che non fa mai: restituisce `{}`).
- Salvataggio: toast «Permessi trainer salvati con successo» / «Errore nel
  salvataggio dei permessi trainer».
- Nessun club: badge «Club: non selezionato», Salva disabilitato.

## 9. Flussi distruttivi

Nessuno.

## 10. Navigazione e parametri

Nessun parametro letto; nessun link in uscita. Vi arrivano la barra
laterale (gruppo Impostazioni) e il menu mobile.

## 11. Schede/sezioni

Tre card affiancate (`xl:grid-cols-3`), nessuna tab.

## 12. Test collegati

- `tests/ui/permessi-navigazione-allenatore.test.mjs` — legge
  `src/components/permissions/trainer-permissions-page.tsx` senza commenti e
  ne estrae il blocco `const NAV_OPTIONS … ];` (le `key:` esposte); confronta
  con le schermate che rispettano `permissions.navigation.<chiave>` +
  `SectionBlockedState section="<chiave>"`; pretende le quattro chiavi
  scoperte nella Wave 6 una sola volta.
- `tests/ui/pp-01-superfici.test.mjs` §M — il file contiene «Permessi
  Allenatore» (nome della pagina) e la barra dice «Permessi allenatore».
- `tests/ui/pp-03-calendario-allenatore-raggiungibile.test.mjs` §11.1 — entro
  400 caratteri da `key: "manageTrainingStatus"` la descrizione dice
  «creare».
- `tests/auth/route-guards.test.mjs`, `tests/lib/*` — la guardia di rotta.

## 13. Inventario componenti

`Sidebar, Header, Card*, Button, Badge, Label, Switch, useToast, useAuth`;
lib: `getClubSettings, saveClubSettings, buildTrainerDashboardPermissionPayload,
DEFAULT_TRAINER_DASHBOARD_PERMISSIONS, resolveTrainerDashboardPermissions`.
Specifici della rotta (si rimuovono con la V1): `PermissionRow`, le tre
liste di opzioni e i tre preset (si spostano nel modello V2).

## Sintesi

1. Una pagina-modulo: 25 interruttori in tre gruppi, tre preset, un Salva.
2. Lettura e scrittura via `simplified-db` (`clubs.settings`), fusione con
   i default nel dominio puro.
3. Nessun predicato client; nessuna guardia dirty; nessun feedback di
   caricamento oltre al pulsante disabilitato.
