# Wave D — Audit di parità: Soci (libro soci)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotte coperte: `/soci`, `/soci/new`, `/soci/[id]`; il pannello
> `src/app/soci/[id]/membership-register-panel.tsx`; le librerie del dominio
> `src/lib/members/{client,model,permissions}.ts` e `src/lib/member-types.ts`;
> l'export `src/lib/person-export.ts` (entità `members`); il servizio
> `src/lib/server/members.ts` letto solo per capire **cosa il server accetta e
> rifiuta**; i test collegati.
>
> Metodo: lettura integrale di `src/app/soci/page.tsx` (1107 righe),
> `src/app/soci/new/page.tsx` (442), `src/app/soci/[id]/page.tsx` (851),
> `membership-register-panel.tsx` (436), delle quattro librerie e di tutto ciò
> che importano; grep sui test.

---

## Indice

1. [`/soci` — elenco soci](#soci--elenco-soci)
2. [`/soci/new` — nuovo socio](#socinew--nuovo-socio)
3. [`/soci/[id]` — scheda socio](#sociid--scheda-socio)
4. [Endpoint e librerie](#endpoint-e-librerie)
5. [Test collegati](#test-collegati)
6. [Inventario componenti](#inventario-componenti)
7. [Cosa **non** esiste in V1 (e quindi non si inventa)](#cosa-non-esiste-in-v1)
8. [Sintesi](#sintesi)

---

## `/soci` — elenco soci

File: `src/app/soci/page.tsx`. Guscio: `Sidebar` (`hidden lg:block`),
`Header title="Soci"` (`hidden lg:block`) **più** `MobileTopBar` (`lg:hidden`)
— la pagina impila due barre mobili, difetto noto in
`navigazione-sotto-1024-e-768.test.mjs` (`DOPPIA_BARRA_NOTA`). Layout
`bg-gray-50`, `DashboardPageContainer`, `SharedPageHeader title="Soci"
subtitle="Gestisci i soci dell'associazione"`. Sotto l'intestazione il
paragrafo `MEMBERSHIP_REGISTER_DISCLAIMER` (da `lib/members/model.ts`).

### 1. Dati mostrati

Interfaccia locale `Socio`: `id, name, firstName?, lastName?, email?, phone?,
membership_date?, membership_start?, is_active?, status?, role?, type?` più i
campi **derivati dal libro** `membershipStatus?, membershipNumber?,
admissionDate?, cessationDate?, cessationReason?, isMemberNow?, inRegister?`.

Sorgente, due letture:
1. `supabase.from("clubs").select("members").eq("id", clubId).single()` →
   `members[]` filtrato con `isRegisteredSocio` (tiene chi ha almeno nome o
   `membershipDate`/`registrationDate`/`email`/`phone`/`fiscalCode`),
   normalizzato (`getSocioIdentity`: `firstName|first_name`,
   `lastName|last_name|surname`, nome intero `fullName|full_name|name` con
   `formatPersonNameLastFirst`, scarto di `"undefined undefined"`), `type =
   normalizeMemberType(member.type)`, `status = member.status || "active"`,
   `is_active = status === "active"`, `membership_date = membershipDate ||
   registrationDate`, ordinato con `comparePeopleByLastName`.
2. `fetchMembershipRegister({ clubId })` → `GET /api/v1/membership/register`.
   Se fallisce (ruolo senza `members.register.read`, o errore) l'elenco resta
   quello dell'anagrafica. Per ogni riga con `eventCount > 0`:
   `membershipStatus = status.label`, `membershipNumber`, `admissionDate =
   admittedOn`, `cessationDate = endedOn`, `cessationReason = reason` (solo se
   `endedOn`), `isMemberNow = status.isMember`, `inRegister = true`.

**Vista tabella** (default): casella di selezione (`SelectAllCheckbox`
label «i soci in elenco»; `SelectRowCheckbox` label = nome), **Nome**
(`EntityIcon type="member"` + nome), **Email** (`hidden md:table-cell`,
`"N/A"` se vuota), **Telefono** (idem), **Data Iscrizione** (idem,
`toLocaleDateString("it-IT")`, `"N/A"`), **Stato** (idem,
`MembershipStatusBadge`), **Azioni** (Modifica, Elimina). A 375 px restano
solo selezione, nome e azioni.

**Vista card** (griglia 1/2/3 colonne): checkbox, `EntityIcon`, nome, badge
stato, righe email/telefono/data con segnaposto `"Email non disponibile"`,
`"Telefono non disponibile"`, `"Iscritto il {data}"` / `"Data iscrizione non
disponibile"`, pulsanti Modifica/Elimina; il clic sulla card apre la scheda.

Colonne visibili (stato React, non persistito, solo in vista tabella):
Nome, Email, Telefono, Data Iscrizione, Stato — dropdown «Colonne Visibili».

### 2. Azioni

Intestazione (in ordine): **Esporta PDF** (dropdown per ambito), **Esporta
CSV** (dropdown per ambito), icona **Tabella** (`title="Visualizzazione
Tabella"`), icona **Card** (`title="Visualizzazione Card"`), **Personalizza
Colonne** (solo tabella), **Aggiungi Socio** (primario) → `/soci/new?clubId=`
(clubId da `localStorage.activeClub`, altrimenti `/soci/new`).

Per riga/card: **Modifica** (`title="Modifica"`) → `/soci/{id}?clubId=`
(è la scheda, non una pagina di modifica); **Elimina** (`title="Elimina"`,
rosso) → `confirm("Sei sicuro di voler eliminare questo socio?")` nativo
(**due volte** in tabella: nel gestore del clic e dentro `handleDelete`).

### 3. Form

Nessuno nella pagina elenco.

### 4. Filtri / ricerca / ordinamento / viste

**Nessun filtro, nessuna ricerca, nessuna vista.** Ordinamento fisso per
cognome. È per questo che `availableExportScopes` non offre «filtrati» (il
commento in pagina lo dichiara).

### 5. Selezione multipla / azioni di massa

`useListSelection()` + `BulkSelectionToolbar nouns={{one:"socio",
many:"soci"}}`. Azioni:
- **Attiva** (`UserCheck` verde) → `status: "active"` → toast `"{N} soci
  attivati"`.
- **Disattiva** (`UserX` ambra) → `status: "inactive"` → toast `"{N} soci
  disattivati"`.
- **Tipo socio** (dropdown, etichetta `"Il tipo e uno solo: sostituisce"`,
  una voce per `MEMBER_TYPES`) → `type` → toast `"{N} soci impostati come
  {tipo}"`.
- **Esporta PDF** / **Esporta CSV** (ambito `selected`).
- **Nessuna eliminazione di massa** (fissato da
  `bulk-selection-surfaces.test.mjs`).

Meccanica: `applyToSelection` → **una `updateMemberProfile` per socio**
(`PATCH /api/v1/membership/profiles/{id}`), `Promise.all`; poi **sempre**
`fetchSoci()`; se qualcuna fallisce toast `"{k} soci su {n} non sono stati
aggiornati: {primo errore}"`; in `catch` toast del messaggio o `"Operazione
non riuscita"`. `selection.prune(ids)` dopo ogni rilettura. `bulkBusy`
disabilita i pulsanti.

### 6. Export / import

`exportPeoplePdf` / `exportPeopleCsv({ entity: "members", people, clubName:
activeClub?.name || "EasyGame", visibleColumns, scope })`. `visibleColumns`
= le cinque chiavi della tabella (`name, email, phone, membershipDate,
status`). Colonne dell'entità `members` (in `person-export.ts`): Cognome,
Nome, Email, Telefono, Codice fiscale, Taglie, **Tipo socio, N. tessera, Data
iscrizione, Stato nel libro, Data ammissione, Data cessazione, Motivo
cessazione, Stato scheda**. Titolo `"Elenco Soci"`, contatore `"Soci
esportati"`, nomi `socio/soci`. Ambiti: `selected` (se c'è selezione) e
`all` (`availableExportScopes`; `resolveScopeRows`). Toast: PDF →
`"Nessun socio da esportare"` / `"Consenti i popup per generare il PDF"` /
`"PDF pronto: si apre la finestra di stampa"`; CSV → `"Nessun socio da
esportare"` / `"CSV scaricato"`. Nessun import.

### 7. Permessi / ruoli

- Rotta in `MANAGEMENT_PATHS` (`/soci`), guscio `management-area-layout` →
  `AccessAreaGuard`: raggiungibile dai ruoli di gestione.
- **Nessun predicato client** sulla pagina: i pulsanti Attiva/Disattiva/Tipo/
  Elimina/Aggiungi si vedono sempre. Il server però pretende
  `members.register.manage` (`assertCanManage` in `updateMemberProfile`,
  `removeMemberProfile`, `admitNewMember`, `recordMembershipEvent`) = ruoli
  `DIREZIONE` (`owner`, `club_manager`). Una segreteria vede i pulsanti e
  riceve 403 → «Accesso negato: il libro soci lo tiene la direzione del club…».
- Lettura del libro: `members.register.read` = `GESTIONE`
  (`canReadMembershipRegister`); senza, l'elenco mostra solo l'anagrafica.
- I due predicati client-safe vivono in `src/lib/members/permissions.ts`:
  `canManageMembershipRegister(role)`, `canReadMembershipRegister(role)`.
  La scheda li usa già (`membership-register-panel.tsx`); l'elenco no.

### 8. Stati

- **Loading**: spinner + `"Caricamento soci..."`.
- **Empty**: icona `Users`, `"Nessun socio"`, `"Inizia aggiungendo il primo
  socio della tua associazione"`, pulsante `"Aggiungi Socio"`.
- **Error**: solo `console.error`, elenco vuoto (indistinguibile dall'empty).
- **Stato per riga** (`MembershipStatusBadge`): se `inRegister` → etichetta
  del libro (`status.label`: «Attivo», «Attivo (riammesso)», «Dimesso»,
  «Decaduto», «Escluso»), verde se `isMemberNow` altrimenti ambra; se non nel
  libro → `"Scheda attiva"` / `"Scheda non attiva"` grigio con
  `title="Non ancora registrato nel libro soci"`.

### 9. Flussi distruttivi

**Elimina socio**: `confirm` nativo → `removeMemberProfile({clubId,
memberId})` (`DELETE /api/v1/membership/profiles/{id}?organization_id=`).
Il server **rifiuta** se il libro nomina la persona: `"Questo socio ha {n}
eventi nel libro soci e non si cancella: chi non e piu socio si dimette o si
esclude, con una data e una delibera. Cancellarlo lascerebbe nel registro un
nome che nessuno puo piu risolvere."` (messaggio mostrato nel toast). Successo
→ riga tolta localmente + toast `"Socio eliminato"`; errore → messaggio del
server o `"Errore nell'eliminazione del socio"`.

### 10. Navigazione e parametri

In uscita: `/soci/new?clubId=`, `/soci/{id}?clubId=`. `clubId` da
`activeClub.id` poi `localStorage.activeClub`. Nessun parametro in entrata
letto (`?clubId=` non è letto dall'elenco).

### 11. Schede/sezioni

Nessuna: una pagina piatta con due viste (tabella/card).

### 12. Test collegati

Vedi [Test collegati](#test-collegati).

### 13. Inventario componenti

`Button, Card*, Badge, DropdownMenu*, BulkSelectionToolbar,
SelectAllCheckbox, SelectRowCheckbox, useListSelection, Table*, Sidebar,
Header, MobileTopBar, DashboardPageContainer, SharedPageHeader, EntityIcon,
useAuth, useToast`; lib: `supabase, removeMemberProfile, updateMemberProfile,
fetchMembershipRegister, MEMBERSHIP_REGISTER_DISCLAIMER, MEMBER_TYPES,
normalizeMemberType, availableExportScopes, exportScopeLabel,
resolveScopeRows, comparePeopleByLastName, formatPersonNameLastFirst,
exportPeopleCsv, exportPeoplePdf`.

---

## `/soci/new` — nuovo socio

File: `src/app/soci/new/page.tsx`. `Suspense` (fallback `"Caricamento..."`),
`Sidebar` + `Header` (senza titolo) + `DashboardPageContainer max-w-3xl`.
Pulsante **Indietro** (`router.back()`) + `SharedPageHeader title="Nuovo
Socio" subtitle="Aggiungi un nuovo socio all'associazione"`. Card «Dati del
Socio» / «Compila i campi per registrare un nuovo socio».

### Risoluzione clubId

`?clubId=` (se ≠ `"null"`) → `activeClub.id` → `localStorage.activeClub`.

### 3. Form (unico `handleSubmit`)

Stato `formData` con default: `type = DEFAULT_MEMBER_TYPE` («Socio
Ordinario»), `clothingSizes = DEFAULT_CLOTHING_SIZES`, `membershipDate =
todayLocalDateOnly()`, tutto il resto `""`.

Sezioni e campi:

**Dati Anagrafici**
- `DocumentExtractionField currentValues={formData} onApply={patch}` (OCR
  documento, propone e non scrive).
- `PersonIdentityFields idPrefix="member" required={{firstName, lastName}}`
  → `firstName`, `lastName`, `birthDate`, `birthPlace`, `birthPlaceCode`,
  `gender`, `fiscalCode` (ordine condiviso, codice fiscale assistito).
- **Email** (`type="email"`, placeholder `mario.rossi@email.com`).
- **Telefono** (`PhoneField id="phone"`).
- **Tipo socio** (`Select` su `MEMBER_TYPES`, placeholder «Seleziona il
  tipo»).

**Indirizzo**
- `PersonResidenceFields idPrefix="member-new" addressLabel="Via/Piazza"` →
  `address`, `city` (ricerca ISTAT), `postalCode` (proposto se univoco).

**Taglie vestiario**
- `ClothingSizesFields idPrefix="member-clothing" person={{gender,
  birthDate}}` → `clothingSizes`.

**Ammissione** (con `MEMBERSHIP_REGISTER_DISCLAIMER`)
- **Data di ammissione** (`membershipDate`, `type="date"`, default oggi).
- **Data della delibera** (`resolutionDate`, `type="date"`).
- **Estremi della delibera \*** (`resolutionReference`, placeholder
  `"Delibera del consiglio direttivo n. 12 del 28/08/2026"`, `required`),
  nota `"Il numero di tessera lo assegna il libro soci: non si digita piu a
  mano."`.
- **Note** (`textarea`, placeholder `"Note aggiuntive..."`).

**Non c'è** il numero di tessera (assegnato dal server) — e non deve tornare
(`membership-register-ownership.test.mjs`, `trainer-card.test.mjs`).

### Validazione (client)

1. `!firstName || !lastName` → toast `"Nome e cognome sono obbligatori"`.
2. `!clubId` → toast `"ID del club mancante"`.
3. `!resolutionReference.trim()` → toast `"Servono gli estremi della delibera
   che ha ammesso il socio"`.

Server (`admitNewMember`): nome e cognome obbligatori; `validateMembershipEventDraft`
su ADMISSION (data di efficacia leggibile, delibera presente); scarta
`MEMBER_RESERVED_KEYS` (`id, user_id, userId, createdAt, created_at,
updatedAt, updated_at, membershipNumber, membership_number`).

### Submit

`admitNewMember({ clubId, member: { firstName, lastName, email|null,
phone|null, fiscalCode|null, birthDate|null, gender|null, birthPlace|null,
birthPlaceCode|null, type || DEFAULT_MEMBER_TYPE, clothingSizes, address|null,
city|null, postalCode|null, notes|null }, effectiveDate: membershipDate,
resolutionReference, resolutionDate|null })` → `POST
/api/v1/membership/admissions`. Errore → toast `error.message`. Successo →
toast `"Socio ammesso con la tessera n. {membershipNumber}"` (o `"Socio
aggiunto con successo!"`) → `router.push("/soci?clubId=")`.

Pulsanti: **Annulla** (`router.back()`), **Salva Socio** (`"Salvataggio..."`
con spinner ⏳ mentre invia).

### 7. Permessi

Nessun predicato client; server `members.register.manage`.

### 8. Stati

Nessuno oltre `isSubmitting`. Nessuna guardia sulle modifiche non salvate.

### 9–11

Nessun flusso distruttivo; navigazione: `/soci?clubId=` dopo il salvataggio,
`back()` su annulla/indietro; nessuna sezione a schede.

---

## `/soci/[id]` — scheda socio

File: `src/app/soci/[id]/page.tsx` + `membership-register-panel.tsx`.
`Sidebar` + `Header title="Dettaglio Socio"` (`"Socio Non Trovato"` nel ramo
vuoto) + `DashboardPageContainer max-w-7xl`. **Nessun `Suspense`** intorno a
`useSearchParams` (a differenza di `/soci/new`).

### Risoluzione clubId e caricamento

`?clubId=` → `localStorage.activeClub` (qui **non** `activeClub` del
contesto). `supabase.from("clubs").select("members").eq("id",
clubId).maybeSingle()` → `members.find(m => m.id === memberId)`. Errori a
toast: `"ID del club mancante. Torna alla lista soci."`, `"ID del socio
mancante"`, `"Errore di connessione. Verifica la tua connessione internet e
riprova."` (se `Failed to fetch`), `"Errore nel caricamento dei dati del
club: {msg}"`, `"Club non trovato. Verifica l'ID del club."`, `"Socio non
trovato"`, `"Errore nel caricamento dei dati del socio"`.

Record normalizzato (`getMemberIdentity` + elenco esplicito): `id, name,
firstName, lastName, birthDate, gender, birthPlace, birthPlaceCode,
fiscalCode, address, city, postalCode, clothingSizes|null, email, phone, type
(normalizeMemberType), status || "active", registrationDate (registrationDate
|| membershipDate), membershipExpiry, membershipNumber, notes, avatar`.
`anagrafiche-coverage.test.mjs` pretende che i nove campi scritti dalla
creazione siano letti con la forma `campo: memberData.campo`.

### 1. Dati mostrati / 11. Schede

`ClubPersonDetailHeader title={name} iconType="member" badges=[{type, blu},
{Attivo|Inattivo, verde|grigio}]` + azione **Elimina** (rosso).

`Tabs defaultValue="anagrafica"` (`grid-cols-1 md:grid-cols-3`), **nessun
parametro URL**:

**Informazioni Personali** (`anagrafica`)
- Card «Informazioni Personali» (matita → `handleEditSection("personal")`):
  Nome, Cognome, Email, Telefono, Data di Nascita (`formatDate`: `day
  numeric, month short, year numeric`, `"-"`), Sesso (`genderLabel`), Luogo
  di Nascita, Codice Fiscale (`eg-tabular`), Note (colonna intera).
- Card «Contatti e Residenza» (→ `"contacts"`): Indirizzo (intera), Citta,
  CAP.
- Card «Taglie vestiario» (→ `"clothing"`): `ClothingSizesSummary`.

**Dati Associativi** (`associativi`)
- Card «Dati Associativi» (→ `"membership"`): Tipo Socio, **Numero tessera
  (storico)** (il valore digitato prima della Wave 4, non più la fonte),
  Data Iscrizione, Scadenza Iscrizione, **Scheda** (badge `Attiva`/`Non
  attiva` + nota `"La qualifica di socio e nella scheda «Libro soci»."`).
- `ClubPersonAccessCard email personaLabel="socio"` («Accesso EasyGame»,
  visibile solo a chi amministra: `canManageClubConfigurationAsActor`).

**Libro soci** (`libro`) → `MembershipRegisterPanel`, tre card:
- «Posizione associativa» con disclaimer; `fetchMembershipRecord(memberId,
  {clubId})` (`GET /api/v1/membership/events?member_id=`); errore → `record
  = null` (caso normale di chi non è nel libro). Campi: **Stato** (badge
  `status.label || "Non socio"`, verde se `isMember`, nota `"Lo stato non e un
  campo: si ricava dagli eventi qui sotto."`), **Numero di tessera**,
  **Ammesso il**, **Delibera** (`resolutionReference`), e se `endedOn`:
  **Cessazione**, **Motivo**. Loading `"Caricamento…"`.
- «Registra un evento» — **solo se `canManageMembershipRegister(activeClub?.role
  || userRole)` e c'è almeno un evento possibile** (`MEMBERSHIP_EVENT_TYPES`
  filtrati con `canApplyMembershipEvent(stato, tipo)`; da `mai_ammesso` →
  solo ADMISSION; da attivo → RESIGNATION/EXPULSION/LAPSE; da cessato →
  REINSTATEMENT). Campi: **Evento** (`Select`, etichette
  `MEMBERSHIP_EVENT_LABELS`: Ammissione, Dimissione, Esclusione, Decadenza,
  Riammissione), **Ha effetto dal** (`date`, default oggi, `required`),
  **Motivo \*** (solo per le cessazioni, placeholder `"Dimissioni volontarie,
  morosita, trasferimento…"`, `required`), **Estremi della delibera** (`*`
  solo su ADMISSION, placeholder `"Delibera del consiglio direttivo n. 12"`),
  **Data della delibera**, **Note** (2 righe). Pulsante **Registra nel
  libro** (`"Registrazione…"`). Submit → `recordMembershipEvent` (`POST
  /api/v1/membership/events`); errore → toast del server (per es.
  `explainMembershipEventDenial`, `validateMembershipEventDraft`); successo →
  toast `"Evento registrato nel libro soci"`, form azzerato, ricarica.
  **Nessuna conferma** prima di registrare una cessazione.
- «Storico»: vuoto → `"Nessun evento nel libro per questo socio. Chi e stato
  registrato prima che il libro esistesse entra con la sua ammissione, con gli
  estremi della delibera che la decise."`; altrimenti una riga per evento:
  badge etichetta, data di efficacia (`dd/mm/yyyy`), `tessera {n}`, delibera
  `— data`, `Motivo: …`, note, `"Registrato il {createdAt} a nome di
  {memberLabel}"`.

### Modale unica di modifica («Modifica Informazioni»)

Overlay fatto in casa (`fixed inset-0 bg-black/50`, chiude al clic fuori,
`max-h-[90dvh]`, corpo `overflow-auto max-h-[calc(90vh-140px)]`), pulsanti
**Annulla** / **Salva Modifiche**. Sezioni:
- `personal`: `PersonIdentityFields idPrefix="member-edit"` (onChange →
  `applyMemberName`, che tiene allineato `name`), Email, `PhoneField
  label="Telefono"`, Note (`Textarea rows=3`).
- `contacts`: `PersonResidenceFields idPrefix="member-edit"`.
- `clothing`: `ClothingSizesFields idPrefix="member-clothing"`.
- `membership`: **Tipo Socio** (`select` su `MEMBER_TYPES`), **Numero
  Tessera** (`Input` libero → **il server lo scarta**: `membershipNumber` è in
  `MEMBER_RESERVED_KEYS`, quindi è un campo morto), **Data Iscrizione**
  (`date`), **Scadenza Iscrizione** (`date`), **Stato** (`select` Attivo /
  Inattivo → `active|inactive`).

Salvataggio: `updateMemberProfile({ clubId, memberId, updates: {
...editFormData, name, fullName } })` → `PATCH
/api/v1/membership/profiles/{id}`; risposta `member` sostituisce lo stato;
toast `"Modifiche salvate con successo"` / messaggio del server /
`"Errore nel salvataggio delle modifiche"`. Server: `firstName`/`lastName`
obbligatori (anche in correzione), scarta le chiavi riservate, rifiuta
«Nessuna modifica da salvare» su patch vuota.

### 7. Permessi

- `canManageMembershipRegister` decide **solo** la card «Registra un
  evento». Modale di modifica ed Elimina non hanno predicato client (server:
  `members.register.manage`).
- «Accesso EasyGame»: `canManageClubConfigurationAsActor` dentro la card.
- Lettura libro: `members.register.read`; senza, il pannello mostra «Non
  socio» e storico vuoto.

### 8. Stati

- Loading: spinner pieno.
- Non trovato: `"Socio non trovato"` + **Torna alla lista soci** →
  `/soci?clubId=`.
- Stato scheda: `Attivo`/`Inattivo` (header), `Attiva`/`Non attiva` (card).
- Stato libro: `MEMBER_STATUS_LABELS`: `mai_ammesso` «Non socio», `ammesso`
  «Attivo», `riammesso` «Attivo (riammesso)», `dimesso` «Dimesso», `decaduto`
  «Decaduto», `espulso` «Escluso»; qualifica `attivo|cessato|non_socio`.
- Transizioni (`EVENT_TRANSITIONS`): `mai_ammesso → ADMISSION`;
  `ammesso|riammesso → RESIGNATION|EXPULSION|LAPSE`;
  `dimesso|decaduto|espulso → REINSTATEMENT`. Il registro è append-only: un
  evento non si modifica e non si cancella.

### 9. Flussi distruttivi

**Elimina** (header): `confirm("Sei sicuro di voler eliminare questo
socio?")` → `removeMemberProfile` → toast `"Socio eliminato con successo"` →
`/soci?clubId=`; il server rifiuta se il libro nomina la persona (messaggio
in toast). Le **cessazioni** (dimissione/esclusione/decadenza) non sono
cancellazioni: sono eventi con data e motivo, senza conferma in V1.

### 10. Navigazione

In entrata: `/soci/{id}?clubId=`. In uscita: `/soci?clubId=` (dopo
eliminazione, «Torna alla lista soci»). Nessun deep link a una scheda.

### 13. Inventario componenti

`Sidebar, Header, DashboardPageContainer, Card*, Button, Input, Label,
Textarea, Badge, Tabs*, ClubPersonDetailHeader, ClubPersonAccessCard,
MembershipRegisterPanel, PhoneField, PersonResidenceFields,
PersonIdentityFields, ClothingSizesFields, ClothingSizesSummary, Select*`;
lib: `supabase, removeMemberProfile, updateMemberProfile,
fetchMembershipRecord, recordMembershipEvent, formatPersonNameLastFirst,
genderLabel, MEMBER_TYPES, DEFAULT_MEMBER_TYPE, normalizeMemberType,
MEMBERSHIP_EVENT_LABELS, MEMBERSHIP_REGISTER_DISCLAIMER,
canApplyMembershipEvent, isMembershipCessation, MEMBERSHIP_EVENT_TYPES,
canManageMembershipRegister, todayLocalDateOnly`.

---

## Endpoint e librerie

| Funzione client (`src/lib/members/client.ts`) | Endpoint | Permesso server |
|---|---|---|
| `fetchMembershipRegister({clubId, atDate?})` | `GET /api/v1/membership/register?organization_id=` | `members.register.read` |
| `fetchMembershipRecord(memberId, {clubId, atDate?})` | `GET /api/v1/membership/events?member_id=&organization_id=` | `members.register.read` |
| `recordMembershipEvent({...})` | `POST /api/v1/membership/events` | `members.register.manage` |
| `admitNewMember({clubId, member, effectiveDate, resolutionReference, resolutionDate, notes})` | `POST /api/v1/membership/admissions` | `members.register.manage` |
| `updateMemberProfile({clubId, memberId, updates})` | `PATCH /api/v1/membership/profiles/{id}` | `members.register.manage` |
| `removeMemberProfile({clubId, memberId})` | `DELETE /api/v1/membership/profiles/{id}?organization_id=` | `members.register.manage` |
| lettura anagrafica | `supabase.from("clubs").select("members")` (adapter su `fetch`) | risorsa `members` in `MANAGEMENT_OPEN_RESOURCES` |

`src/lib/member-types.ts`: `MEMBER_TYPES` («Socio Ordinario», «Socio
Sostenitore», «Socio Onorario»), `DEFAULT_MEMBER_TYPE`,
`normalizeMemberType` (non rifiuta valori storici), `collectMemberTypes`.

## Test collegati

Statici che leggono i sorgenti delle tre rotte:
- `tests/ui/accessi-persone-schede.test.mjs` — `[id]`: niente «Invia
  Credenziali», monta `ClubPersonAccessCard`.
- `tests/ui/anagrafiche-coverage.test.mjs` — `new` e `[id]`: `PhoneField`,
  `PersonIdentityFields`, nessun campo duplicato, `DocumentExtractionField`
  (new), `ClothingSizesFields` (new) e `ClothingSizesSummary` ([id]),
  `PersonResidenceFields`, sesso non testo libero, i nove campi letti con
  `campo: memberData.campo`.
- `tests/ui/bulk-selection-surfaces.test.mjs` — `/soci`: `useListSelection`,
  `BulkSelectionToolbar`, `SelectRowCheckbox`, `SelectAllCheckbox`,
  `availableExportScopes`, `resolveScopeRows`, `scope,` passato, nessuna
  eliminazione di massa, `selection.prune(`.
- `tests/ui/causali-e-storni-in-superficie.test.mjs` — `[id]`: nessun toast
  «Credenziali inviate».
- `tests/ui/lettura-documento-unica.test.mjs` — `new`: `DocumentExtractionField`.
- `tests/ui/membership-register-ownership.test.mjs` — le quattro pagine:
  niente riscrittura di `clubs.members` dal browser, `admitNewMember`, nessun
  input di numero tessera, nessun import di `@/lib/server/members`, nessuna
  frase «libro soci ufficiale/conforme/a norma».
- `tests/ui/navigazione-sotto-1024-e-768.test.mjs` — `/soci` nella lista
  delle doppie barre note.
- `tests/ui/rc-fix-2-accessibility.test.mjs` — `/soci`: etichetta della
  casella = nome; `DropdownMenuTrigger asChild` / `DropdownMenuItem`.
- `tests/ui/responsive-invariants.test.mjs` — `[id]` in `TOUCHED` (niente
  `grid-cols-2` senza breakpoint); `/soci` riga di comandi con `flex-wrap`;
  dialoghi `max-h-[90vh]`.
- `tests/ui/trainer-card.test.mjs` — `new`: numero di tessera mai
  obbligatorio.
- `tests/lib/rc-fix-2-uat.test.mjs` — `/soci`: nessun `scopeLabel:`, `scope,`.
- `tests/lib/catalogo-permessi.test.mjs` — `lib/members/permissions.ts`.
- `tests/lib/members-model.test.mjs` — `lib/members/model.ts` (dominio puro,
  non toccato).

## Inventario componenti

Condivisi (si riusano, non si riscrivono): `PersonIdentityFields`,
`PersonResidenceFields`, `PhoneField`, `DocumentExtractionField`,
`ClothingSizesFields`, `ClothingSizesSummary`, `ClubPersonAccessCard`.
Specifici della rotta (si rimuovono dopo la parità):
`MembershipStatusBadge`, `getSocioIdentity`, `isRegisteredSocio`,
`getMemberIdentity`, la modale «Modifica Informazioni», i tre `confirm`
nativi, `membership-register-panel.tsx`, `ClubPersonDetailHeader` (usato
anche altrove? verificare con grep prima di toccarlo: **non** si rimuove).

## Cosa non esiste in V1

Il prompt cita «cariche/ruoli sociali», «quote associative», «quota/anno»,
«documenti», «consenso privacy», «data di decadenza» come campi da censire.
Nel record del socio (`clubs.members`) e nel dominio `src/lib/members/**`
**non esistono**: `role` è sempre `"socio"` e non è mostrato da nessuna
schermata; le quote sono nel dominio pagamenti (atleti), non del socio; i
documenti e i consensi non sono collegati al socio; la «decadenza» è
l'evento `LAPSE` del libro, con la sua data (`endedOn`) e il motivo. La V2
mostra ciò che c'è e **non inventa** colonne per ciò che non c'è.

Campo **morto** trovato: «Numero Tessera» nella modale `membership` della
scheda — inviato al server e scartato (`MEMBER_RESERVED_KEYS`). In V2 resta
in lettura come «Numero tessera (storico)» e non si offre in modifica.

## Sintesi

1. Tre rotte, un dominio: anagrafica in `clubs.members` (letta via `supabase`),
   libro soci via `/api/v1/membership/**`; tutte le scritture passano dal
   client del libro (`lib/members/client.ts`).
2. L'elenco ha selezione, tre azioni di massa (attiva, disattiva, tipo
   socio), export PDF/CSV per ambito, due viste, colonne configurabili;
   **nessun filtro né ricerca**.
3. La creazione è un'ammissione: dati anagrafici + delibera obbligatoria;
   il numero di tessera lo assegna il server.
4. La scheda ha tre tab, una modale di modifica per sezione, l'eliminazione
   (rifiutata dal server se c'è storia nel libro) e il pannello del libro con
   posizione derivata, registrazione di eventi (solo direzione) e storico.
5. Permessi: `members.register.manage` (direzione) per ogni scrittura,
   `members.register.read` (gestione) per la lettura; in V1 il predicato
   client è applicato solo alla registrazione degli eventi.
6. Stati: sei del libro (`MEMBER_STATUS_LABELS`) + due della scheda
   («Scheda attiva/non attiva») — nessuna parola di `PERSON_STATUS` /
   `ENROLMENT_STATUS` dice «Dimesso», «Decaduto», «Escluso», «Non socio».
