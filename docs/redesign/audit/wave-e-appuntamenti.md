# Wave E — Audit di parità: Appuntamenti (disponibilita e configurazione)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/appuntamenti` (`src/app/appuntamenti/page.tsx`, 1094
> righe, tutto inline). Trasporto `src/lib/api/appointments-client.ts`
> (sezione «disponibilita configurata», condiviso con la segreteria e l'area
> allenatore), dominio puro `src/lib/appointments/config.ts`,
> `src/lib/club-sites.ts`; il servizio `src/lib/server/appointments.ts` letto
> solo per capire **cosa il server accetta e rifiuta**; i test collegati.
>
> La **coda** degli appuntamenti (conferma, rifiuto, spostamento, chiusura,
> annullo) non e qui: vive in `/secretariat` (audit `wave-e-segreteria.md`).
> Questa pagina dichiara **quando** la societa riceve e **se e per cosa** le
> famiglie possono chiedere.

---

## Indice

1. [Dati mostrati](#1-dati-mostrati)
2. [Azioni](#2-azioni)
3. [Moduli](#3-moduli)
4. [Filtri e viste](#4-filtri-e-viste)
5. [Azioni di massa](#5-azioni-di-massa)
6. [Esportazioni e importazioni](#6-esportazioni-e-importazioni)
7. [Permessi](#7-permessi)
8. [Stati](#8-stati)
9. [Flussi distruttivi](#9-flussi-distruttivi)
10. [Navigazione e parametri](#10-navigazione-e-parametri)
11. [Schede e sezioni](#11-schede-e-sezioni)
12. [Test collegati](#12-test-collegati)
13. [Inventario componenti](#13-inventario-componenti)
14. [Cosa non esiste in V1 e difetti trovati](#14-cosa-non-esiste-in-v1-e-difetti-trovati)
15. [Sintesi](#15-sintesi)

---

## Guscio e caricamento

`Sidebar` + `Header title="Disponibilita appuntamenti"` +
`DashboardPageContainer`, `SharedPageHeader title="Disponibilita
appuntamenti" subtitle="Dichiara quando la societa riceve: giorni, orari,
durata del colloquio, sede e operatore."`. Layout `bg-gray-50`.

`puoConfigurare = isManagementAccessRole(activeClub?.role)`. Se falso, nessuna
lettura e una card: «Gli orari di ricevimento del club li configura chi lo
amministra. Gli appuntamenti che ti sono assegnati restano nella tua agenda.»

`carica()` (`useCallback`, in `useEffect`), cinque letture in `Promise.all`:

| Lettura | Sorgente | Uso |
|---|---|---|
| `listAppointmentSlots(headers)` | `GET /api/v1/appointment-slots` | le fasce (`AppointmentSlotRow[]`) |
| `getClubData(clubId, "club_sites")` → `normalizeClubSites` | `clubs.club_sites` | sedi `{id, name}` |
| `getClubData(clubId, "staff_members")` | `clubs.staff_members` | operatori |
| `getClubData(clubId, "trainers")` | `clubs.trainers` | operatori |
| `apiRequest("/api/v1/appointments/config", {headers})` | `GET` | `AppointmentsConfig` (`normalizeAppointmentsConfig`) |

`estraiOperatori(staff ∪ allenatori)`: solo chi ha un **account**
(`linkedUserId | linked_user_id | userId | user_id | data.linkedUserId |
data.userId`), nome `fullName || name+surname/lastName || email || "Operatore
senza nome"`, deduplicati per `userId`, ordinati per nome (`localeCompare
it`). Motivo: `appointment_slots.assigned_to_user_id` e un id utente e
`assertPerimetro` lo confronta con la sessione.

Errore → toast del messaggio o «Non riesco a leggere la disponibilita
configurata». `caricamento` → «Caricamento della disponibilita...» nella card
delle fasce.

## 1. Dati mostrati

1. **Avviso di ripiego** (card ambra, solo se `inRipiego && !caricamento`,
   `inRipiego = nessuna fascia con active !== false`): «Nessuna fascia
   attiva: si sta usando l'orario di apertura.» + «Finche non dichiari almeno
   una fascia, alle famiglie vengono proposti colloqui di trenta minuti dentro
   l'orario di apertura, senza operatore, e — se l'orario e uno solo per tutta
   la settimana — anche nei giorni in cui la segreteria e chiusa.»
2. **Card «Come riceviamo»** (icona CalendarClock):
   - «Le famiglie possono prenotare» + nota «Se disattivato, l'area famiglia
     non mostra il modulo e la richiesta viene rifiutata. Gli appuntamenti gia
     presi restano.» + `Checkbox` (`familyBookingEnabled`) che **salva
     subito**.
   - Se `familyBookingEnabled && !familyCanRequestAppointment(configurazione)`:
     riquadro ambra `role="status"`: «Nessun motivo e prenotabile dalle
     famiglie: per loro le richieste online risultano **chiuse**. Spunta «Le
     famiglie possono chiederlo» su almeno un motivo, oppure togli del tutto i
     motivi per accettare anche il testo libero.»
   - «Motivi che accettiamo» + nota «Senza nessun motivo la famiglia continua
     a scriverlo a mano: i motivi restringono, la loro assenza non e un
     divieto.» Elenco dei tipi (`configurazione.types`): `name` (+ « · solo
     dal desk» se `!bookable`), casella «Le famiglie possono chiederlo»
     (`bookable`, salva subito), pulsante **Rimuovi** (salva subito, nessuna
     conferma). Sotto: campo **Nome** (placeholder «Es. Colloquio con la
     segreteria») + **Aggiungi** (ignora il vuoto; aggiunge `{id: "", name,
     bookable: true}` e salva; il server assegna lo slug).
3. **Card «Nuova fascia» / «Modifica fascia»** con il modulo (§3); in
   modifica un pulsante **Annulla modifica** (torna a «Nuova fascia»).
4. **Card «Fasce di ricevimento»**: elenco ordinato (settimanali prima per
   `weekday`, poi le date per data, poi `start_time`). Per ogni fascia: giorno
   (`GIORNI[weekday].nome` oppure `specific_date` in `YYYY-MM-DD`; «Giorno non
   indicato» se manca), «{start} — {end}», badge «{duration} min», badge sede
   (`nomeSede`: «Tutte le sedi» / nome / «Sede rimossa»), badge operatore
   (`nomeOperatore`: «Segreteria» / nome / «Operatore non piu in organico»),
   badge rosso «Chiusura» (data + `active === false`) o «Disattivata»
   (settimanale + `active === false`). Riga «In vigore dal {valid_from} fino
   al {valid_until}» se presenti; `notes` (`whitespace-pre-wrap`). Azioni:
   **Modifica**, **Disattiva** / **Riattiva**, **Elimina**. Vuoto: «Nessuna
   fascia dichiarata.»
5. Riga finale: «Gli appuntamenti gia presi si lavorano dalla Segreteria»
   (link `/secretariat`).

## 2. Azioni

| Azione | Effetto |
|---|---|
| Interruttore «Le famiglie possono prenotare» | `salvaConfigurazione({...configurazione, familyBookingEnabled})` |
| Casella «Le famiglie possono chiederlo» su un motivo | `salvaConfigurazione` con `bookable` aggiornato |
| **Rimuovi** motivo | `salvaConfigurazione` con il tipo tolto (nessuna conferma) |
| **Aggiungi** motivo | `salvaConfigurazione` con il tipo aggiunto; campo azzerato |
| **Aggiungi la fascia** / **Salva la fascia** | `createAppointmentSlot(corpo)` / `updateAppointmentSlot(id, corpo)` → modulo azzerato, `carica()`, toast «Fascia aggiunta: le famiglie possono prenotarla» / «Fascia aggiornata: le famiglie vedono subito la nuova disponibilita»; errore → messaggio o «Non riesco a salvare la fascia» |
| **Modifica** (fascia) | carica la fascia nel modulo (`apriModifica`) |
| **Annulla modifica** | modulo vuoto |
| **Disattiva** / **Riattiva** | `updateAppointmentSlot(id, {**tutta la riga**, active: !active})` (un campo assente viaggerebbe come `null` = «svuota») → `carica()`, toast «Fascia disattivata» / «Fascia riattivata»; errore → messaggio o «Non riesco a cambiare la fascia» |
| **Elimina** | apre `AlertDialog` (§9) |

`salvaConfigurazione(prossima)`: aggiornamento **ottimistico**
(`normalizeAppointmentsConfig(prossima)`), `PUT /api/v1/appointments/config`
con `{data: prossima}` e `x-active-club-id`; su errore torna al precedente e
toast (messaggio o «Non riesco a salvare la configurazione»); su successo
usa la risposta normalizzata. Si manda **tutta** la configurazione a ogni
gesto.

## 3. Moduli

### Fascia (`Modulo`, `MODULO_VUOTO`)

| Campo | Tipo | Iniziale | Validazione |
|---|---|---|---|
| **Ricorrenza** (`ambito`) | `select`: «Ogni settimana» (`weekly`) · «Una data sola» (`date`) | `weekly` | — |
| **Giorno della settimana** (`weekday`, solo `weekly`) | `select` `GIORNI` 0 Domenica … 6 Sabato | `"1"` (Lunedi) | — |
| **Data** (`specificDate`, solo `date`) | `date` | `""` | client: «Indica la data della fascia» |
| **Dalle \*** (`startTime`) | `time` | `09:00` | server: «Orario di inizio e di fine non validi» |
| **Alle \*** (`endTime`) | `time` | `12:00` | server: «L'orario di fine deve seguire quello di inizio» |
| **Durata del colloquio (minuti)** (`durationMinutes`) | `number`, `min 5`, `step 5`; nota «La fascia si divide in appuntamenti di questa durata.» | `"30"` | `Number(...) \|\| 30` |
| **Sede** (`siteId`) | `select`: «Tutte le sedi» (`""`) + `sedi` | `""` | — |
| **Operatore** (`assignedToUserId`) | `select`: «Segreteria» (`""`) + `operatori`; nota «Solo chi ha un account puo tenere un'agenda propria.» | `""` | — |
| **In vigore dal** (`validFrom`) | `date` | `""` | — |
| **Fino al** (`validUntil`) | `date` | `""` | — |
| **Note interne** (`notes`) | `Textarea` rows 2, placeholder «Promemoria per chi tiene l'agenda: la famiglia non le legge» | `""` | — |
| **Attiva** (`active`) | `Checkbox`; nota «Una fascia con una data e disattivata e una chiusura: quel giorno non si riceve, nemmeno nelle fasce settimanali.» | `true` | — |

Corpo inviato (`AppointmentSlotInputBody`): `siteId || null`,
`assignedToUserId || null`, `weekday` solo se `weekly` (altrimenti `null`),
`specificDate` solo se `date` (altrimenti `null`), `startTime`, `endTime`,
`durationMinutes: Number || 30`, `validFrom || null`, `validUntil || null`,
`active`, `notes || null`. Il trasporto lo traduce in `snake_case`
(`assigned_to`). Il server rifiuta una regola senza giorno **ne** data («Uno
slot deve dichiarare un giorno della settimana oppure una data») e un
`weekday` fuori da 0–6. **Nessun campo `capacity`** (W6-56, presidiato dal
test). `salvataggio` disabilita il pulsante. Nessuna guardia sulle modifiche
non salvate. Griglia `sm:grid-cols-2` (corretta a 375 px).

### Nuovo motivo

Un campo **Nome** (testo) + **Aggiungi**; `bookable` nasce `true`; il nome e
troncato a 120 dal normalizzatore, lo slug lo ricava il server.

## 4. Filtri e viste

Nessuno. Ordinamento fisso (§1.4).

## 5. Azioni di massa

Nessuna.

## 6. Esportazioni e importazioni

Nessuna.

## 7. Permessi

- Rotta in `MANAGEMENT_PATH_PREFIXES` (`/appuntamenti`), guscio
  `management-area-layout`.
- **Predicato client**: `puoConfigurare = isManagementAccessRole(activeClub?.role)`
  (test `segreteria-appuntamenti-e-disponibilita`: «il gate della schermata e
  lo stesso del dominio»). Senza, la pagina mostra solo la frase e non legge
  niente.
- Server: `assertPuoConfigurareLaDisponibilita` (`isManagementAccessRole`)
  su `saveAppointmentsConfig`, `createAppointmentSlot`,
  `updateAppointmentSlot`, `deleteAppointmentSlot`; `listAppointmentSlots`
  chiede `appointments.read` o `appointments.manage`. Le sedi, lo staff e gli
  allenatori sono risorse aperte alla gestione.

## 8. Stati

- Non autorizzato: card con la frase (§Guscio).
- Loading: «Caricamento della disponibilita...» (solo nella card delle fasce;
  le altre card si vedono subito con la configurazione di default).
- Ripiego: card ambra (§1.1).
- Porta chiusa senza volerlo: riquadro ambra `role="status"` (§1.2).
- Fascia: `active === false` → badge «Chiusura» (con data) / «Disattivata»
  (settimanale). Attiva: nessun badge. `src/lib/web/status.ts` non ha
  «CHIUSURA»/«DISATTIVATA» per una fascia: `PERSON_STATUS.inactive` dice
  «DISATTIVATO» (maschile); serve una spec locale.
- Sede: «Tutte le sedi» / «Sede rimossa»; operatore: «Segreteria» /
  «Operatore non piu in organico».
- Vuoto: «Nessuna fascia dichiarata.»
- Motivo non prenotabile: suffisso « · solo dal desk».

## 9. Flussi distruttivi

- **Elimina fascia**: `AlertDialog` «Eliminare questa fascia?» — «Gli
  appuntamenti gia presi su questa fascia restano in agenda: si perde solo la
  regola che la proponeva. Per smettere di offrirla senza toglierla dalla
  storia, disattivala.» — **Annulla** / **Elimina** (rosso) →
  `deleteAppointmentSlot(id)` → `carica()`, toast «Fascia rimossa»; errore →
  messaggio o «Non riesco a rimuovere la fascia». La chiave esterna e `SET
  NULL`: gli appuntamenti non si perdono.
- **Rimuovi motivo**: nessuna conferma; gli appuntamenti gia presi portano il
  motivo con se.
- **Disattiva**: reversibile (Riattiva).

## 10. Navigazione e parametri

In entrata: nessun parametro. In uscita: `/secretariat`. Ingressi: voce
«Appuntamenti» della sidebar V2, due link dalla Segreteria.

## 11. Schede e sezioni

Nessuna scheda: quattro card impilate (avviso, Come riceviamo, modulo fascia,
elenco fasce).

## 12. Test collegati

- `tests/ui/segreteria-appuntamenti-e-disponibilita.test.mjs` — legge
  `src/app/appuntamenti/page.tsx`: deve contenere `listAppointmentSlots`,
  `createAppointmentSlot`, `updateAppointmentSlot`, `deleteAppointmentSlot`;
  le undici chiavi `siteId, assignedToUserId, weekday, specificDate,
  startTime, endTime, durationMinutes, validFrom, validUntil, active, notes`;
  `isManagementAccessRole`; nessun `capacity:`/`capacity =`.
- `tests/ui/pp-02-superfici.test.mjs` — (senza commenti) `Le famiglie possono
  prenotare`, `Motivi che accettiamo`, `salvaConfigurazione(`,
  `!familyCanRequestAppointment(configurazione)`.
- `tests/ui/responsive-invariants.test.mjs` — `app/appuntamenti/page.tsx` in
  `TOUCHED`: nessun `grid-cols-2|3` senza breakpoint.
- `tests/auth/route-guards.test.mjs` — classificazione del percorso.

## 13. Inventario componenti

Tutto inline. Import: `Sidebar, Header, DashboardPageContainer,
dashboardMainClassName, SharedPageHeader, Card*, Button, Input, Label, Badge,
Checkbox, Textarea, AlertDialog*, Link`; icone `CalendarClock, Plus, Trash2`;
lib `isManagementAccessRole, getClubData, normalizeClubSites, apiRequest,
DEFAULT_APPOINTMENTS_CONFIG, normalizeAppointmentsConfig,
familyCanRequestAppointment`, i quattro verbi degli slot. Funzioni locali:
`GIORNI`, `intestazioniClub`, `soloData`, `estraiOperatori`, `Modulo`,
`MODULO_VUOTO`. Nessun componente specifico fuori dalla pagina.

## 14. Cosa non esiste in V1 e difetti trovati

- Nessuna conferma su **Rimuovi motivo** (reversibile: si riaggiunge, ma il
  suo slug cambia se il nome e diverso).
- Il modulo della fascia e una card sempre aperta, senza guardia sulle
  modifiche non salvate.
- L'avviso di ripiego non mostra il **conteggio** di cio che manca (non e
  un'alert azionabile nel senso di §9.6: la sua azione e «aggiungi la prima
  fascia»).
- Non esiste una lettura degli appuntamenti gia presi su una fascia (il
  server sa che la FK e `SET NULL`, la schermata no).
- Nessun `?action=new`.

## 15. Sintesi

1. Una pagina, due configurazioni: `appointments/config` (interruttore
   famiglie + motivi, salvataggio a ogni gesto, ottimistico con ripristino) e
   le fasce (`appointment-slots`, quattro verbi, undici campi).
2. Gate client = gate del dominio (`isManagementAccessRole`); chi non lo
   passa legge una frase.
3. Una fascia si crea/modifica da un modulo a card, si disattiva rimandando
   tutta la riga, si elimina con conferma.
4. Tre stati derivati mostrati a badge: Chiusura, Disattivata, «solo dal
   desk»; due etichette di ripiego per sede e operatore mancanti.
