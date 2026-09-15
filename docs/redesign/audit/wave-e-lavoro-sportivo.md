# Wave E — Audit di parità: Lavoro sportivo

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotte coperte: `/sport-work` (cruscotto), `/sport-work/relationships`,
> `/sport-work/relationships/[id]`, `/sport-work/compensations`,
> `/sport-work/deadlines`, `/sport-work/obligations`. Componenti:
> `src/components/sport-work/{SportWorkShell,SportWorkDashboardPanel,
> RelationshipsPanel,RelationshipDetail,CompensationPlanEditor,PayoutDialog,
> PersonPositionCard,DeclarationDialog,SportWorkDocumentsPanel,
> CompensationsPanel,DeadlinesPanel,ObligationsPanel}.tsx` e
> `sport-work-format.ts`. Dominio letto solo per capire cosa il server accetta
> e rifiuta: `src/lib/sport-work/{model,permissions,plan,rules}.ts`,
> `src/lib/server/{sport-work,sport-work-ledger,sport-work-agenda}.ts`, le
> rotte `src/app/api/v1/sport-work/**`.
>
> Metodo: lettura integrale dei sei `page.tsx` (tutti sottili: `Suspense` +
> `SportWorkShell` + pannello), dei tredici componenti (5.848 righe) e delle
> rotte API che chiamano; grep sui test.

---

## Indice

1. [Il guscio comune (`SportWorkShell`)](#il-guscio-comune)
2. [`/sport-work` — cruscotto](#sport-work--cruscotto)
3. [`/sport-work/relationships` — rapporti](#sport-workrelationships--rapporti)
4. [`/sport-work/relationships/[id]` — scheda del rapporto](#sport-workrelationshipsid--scheda-del-rapporto)
5. [`/sport-work/compensations` — compensi](#sport-workcompensations--compensi)
6. [`/sport-work/deadlines` — scadenze](#sport-workdeadlines--scadenze)
7. [`/sport-work/obligations` — adempimenti](#sport-workobligations--adempimenti)
8. [Endpoint](#endpoint)
9. [Permessi (la matrice del dominio)](#permessi)
10. [Stati con il testo](#stati)
11. [Test collegati](#test-collegati)
12. [Inventario componenti](#inventario-componenti)
13. [Cosa non esiste in V1](#cosa-non-esiste-in-v1)
14. [Sintesi](#sintesi)

---

## Il guscio comune

File: `src/components/sport-work/SportWorkShell.tsx`. Ogni pagina monta
`Sidebar` + `Header title={title}` + `DashboardPageContainer` +
`SharedPageHeader eyebrow="Lavoro sportivo" title subtitle actions` su
`bg-gray-50`. Sotto l'intestazione una **riga di link** (non tab) alle cinque
sezioni `SPORT_WORK_SECTIONS` — Dashboard `/sport-work`, Rapporti
`/sport-work/relationships`, Compensi `/sport-work/compensations`, Scadenze
`/sport-work/deadlines`, Adempimenti `/sport-work/obligations` — con
`?clubId=` propagato (`buildHref`), attiva per `pathname === "/sport-work"` o
`startsWith(href)`. `hideSections` la toglie sulla scheda del rapporto.
`tests/ui/pp-01-superfici.test.mjs §L` pretende che il file dichiari i cinque
`href: "..."` e li disegni con `SPORT_WORK_SECTIONS.map`.

**Guardia di permesso client**: `readStoredActiveClub()?.role` →
`hasSportWorkPermission(role, "sport_work.read")`; senza, al posto dei figli
una card «Questa sezione non e per il ruolo attivo» / «I compensi dicono
quanto guadagna una persona: li vedono il proprietario e il club manager. Se
ti serve accesso, chiedilo a chi amministra la societa.» (`checked` evita il
lampo prima di leggere lo storage).

`SportWorkStat({label, value, hint, tone default|positive|warning|danger,
icon})`: card con due righe di numero; **condivisa** con
`PersonCompensationTab` (schede atleta/allenatore/staff), che vive in
`src/components/sport-work/` ma non è di queste rotte.

`sport-work-format.ts` (condiviso con `PersonCompensationTab` e
`PersonPositionCard`): `formatCurrency` (`Intl` EUR), `formatPercent`,
`formatDate` (`toLocaleDateString("it-IT")`, `"—"`), `formatDateInput`,
`todayInput`, le tre mappe badge (`relationshipStatusBadge`,
`installmentStatusBadge`, `obligationStatusBadge`: etichette da `model.ts`,
classi Tailwind), `relationshipTypeLabel`, `roleLabel`,
`obligationKindLabel`, `statusBadgeOf`, `daysUntil` (UTC), `dueLabel`
(«scaduta da N giorni/giorno» · «scade oggi» · «scade domani» · «fra N
giorni»).

---

## `/sport-work` — cruscotto

File: `src/app/sport-work/page.tsx` → `SportWorkDashboardPanel clubId`.
Titolo «Lavoro sportivo», sottotitolo «Rapporti, compensi, contributi e
adempimenti. EasyGame calcola e prepara i dati; versare e trasmettere restano
di chi ne ha la responsabilita.»

### 1. Dati mostrati

`GET /api/v1/sport-work/dashboard` → `Dashboard {month "YYYY-MM", year,
scheduledThisMonth, accruedThisMonth, paidThisMonth, clubCostThisMonth,
toPayTotal, overdueTotal, overdueCount, activeRelationships,
expiringContracts, missingDeclarations, upcomingObligations,
overdueObligations, paidThisYear, employeeContributionThisYear,
employerContributionThisYear, peopleOverSocialThreshold,
peopleOverFiscalThreshold}` + `GET /api/v1/sport-work/obligations?status=DUE`
(in parallelo).

Tre sezioni di `SportWorkStat` (griglia 1/2/4):

- **`{mese anno}`** (h2 = `monthLabel(month)`, nomi mese in minuscolo):
  Programmato «Quanto il piano prevede in scadenza questo mese» · Maturato
  «Periodo trascorso: dovuto, non ancora erogato» · Pagato (positive) «Denaro
  uscito davvero» · Costo per il club «Lordo piu la quota contributiva della
  societa».
- **Cosa richiede attenzione**: Da pagare «Residuo di tutte le scadenze
  aperte» · Scaduti (danger se `overdueCount>0`) «{overdueCount} scadenze
  oltre il termine» · Contratti in scadenza (warning se >0) «Da rinnovare o
  cessare» · Autocertificazioni mancanti (warning se >0) «Senza, il
  progressivo verso le soglie e parziale».
- **Anno {year}**: Compensi erogati «{activeRelationships} rapporti attivi» ·
  Contributi lavoratore «Trattenuti sulle erogazioni» · Contributi club «A
  carico della societa» · Oltre le soglie `{social} / {fiscal}` (warning se
  fiscal>0) «Persone oltre i 5.000 previdenziali / i 15.000 fiscali».

`upcomingObligations` e `overdueObligations` arrivano e **non sono mostrati**.

Card **Adempimenti prossimi** («Vedi tutti» → `/sport-work/obligations?clubId`),
nota «EasyGame prepara i dati dell'adempimento. Non lo trasmette: al RASD, a
UNILAV, all'INPS e all'Agenzia delle Entrate ci va una persona.»; le prime 8
DUE ordinate per `due_date`: titolo, `{kind label} · {data} · {dueLabel}`,
importo se presente, badge stato (`obligationStatusBadge`). Vuoto: «Nessun
adempimento in attesa.»

### 2. Azioni

**Aggiorna maturato e agenda** (`outline sm`, «Aggiornamento…» mentre gira)
→ `POST /api/v1/sport-work/scheduler` → toast «Agenda aggiornata:
{obligations.created} adempimenti nuovi, {notifications} avvisi.» e ricarica;
errore → toast del server o «Aggiornamento non riuscito». **Nessun predicato
client**: il server chiede `sport_work.manage`.

### 3–6. Form, filtri, massa, export

Nessuno.

### 7. Permessi

Guscio: `sport_work.read`. Scheduler: `sport_work.manage` (solo server).

### 8. Stati

Loading «Caricamento…» (testo); `!dashboard` → «Nessun dato disponibile per
questa societa.»; errore di lettura → toast «Errore nella lettura del
cruscotto» (e il pannello resta su «Nessun dato…»).

### 9–11

Nessun flusso distruttivo; navigazione in uscita `/sport-work/obligations`;
nessuna sezione a schede.

### 12–13

Vedi in fondo.

---

## `/sport-work/relationships` — rapporti

File: `src/app/sport-work/relationships/page.tsx` → `RelationshipsPanel
clubId`. Titolo «Rapporti», sottotitolo «Chi lavora per la societa, con quale
tipo di rapporto e per quale periodo.»

### 1. Dati mostrati

`GET /api/v1/sport-work/relationships` + `GET /api/v1/sport-work/people`
(parallelo; il nome viene da `people.full_name` per `person_id`, altrimenti
«Persona non trovata»). Una card «Rapporti di lavoro sportivo» / «Chi lavora
per la societa, a quali condizioni e per quale periodo.» con un elenco di
pulsanti-riga: nome; `{roleLabel} · {relationshipTypeLabel} · {start} [—
{end}]`; `contract_amount` (se > 0); badge stato (`relationshipStatusBadge`,
fallback DRAFT). Clic → scheda.

Campi della riga API (`sport_work_relationships`): `id, person_id, season_id,
role, relationship_type, start_date, end_date, status, contract_amount,
currency, compensation_frequency, weekly_hours, contract_attachment_id,
signature_state, rasd_status, rasd_reference, rasd_communicated_at,
rasd_notes, terminated_at, termination_reason, notes`. La lettura porta prima
a `EXPIRED` i contratti con `end_date` passata.

### 2. Azioni

**Nuovo rapporto** (primario, `w-full lg:w-auto`) apre il dialogo. Riga →
`/sport-work/relationships/{id}?clubId`. **Nessun predicato client** sul
pulsante (server: `sport_work.manage`).

### 3. Form — dialogo «Nuovo rapporto di lavoro sportivo»

`Dialog max-w-2xl`, descrizione «Il rapporto nasce in bozza. Si attiva dalla
sua scheda, quando ci sono contratto e anagrafica.»

Due modi (`mode`, pulsanti «Persona gia censita» / «Nuova persona», default
`existing`):

- **existing**: `Persona` (`Select` su `people`: `full_name [— fiscal_code]`,
  placeholder «Seleziona una persona»; nessuna ricerca anche con molte
  persone).
- **new** (`personForm`, default `originType:"trainer", socialCoverage:"NONE",
  fiscalProfile:"NONE"`, `phone/vatNumber/iban ""` **senza campo**): Nome
  (`sw-first`), Cognome (`sw-last`), Codice fiscale (`sw-cf`), Email
  (`sw-email`, `type=email`), Copertura previdenziale dichiarata (`Select` su
  `SOCIAL_COVERAGES` con `SOCIAL_COVERAGE_LABELS`, nota «Decide l'aliquota. La
  dichiara il lavoratore: EasyGame non la deduce dal ruolo.»).

Campi del rapporto (`form`, default `role:"COACH", relationshipType:
"SPORT_COCOCO", compensationFrequency:"SEASONAL"`, il resto `""`): Ruolo
(`Select` su `SPORT_WORK_ROLES`/`SPORT_WORK_ROLE_LABELS`), Tipo di rapporto
(`Select` su `RELATIONSHIP_TYPES`, con sotto `RELATIONSHIP_TYPE_HINTS[tipo]`),
Inizio (`sw-start`, date), Fine (`sw-end`, date), Importo pattuito
(`sw-amount`, `inputMode=decimal`), Periodicita (`Select` su
`COMPENSATION_FREQUENCIES`), Ore settimanali dichiarate (`sw-hours`, decimal,
nota «Oltre 24 ore la presunzione di autonomia non opera piu: il dato serve al
consulente, EasyGame non ne trae conclusioni.»), Note (`sw-notes`, textarea 2
righe).

**Validazione client**: `!startDate` → toast «La data di inizio del rapporto e
obbligatoria»; in modo `new` prima `POST /api/v1/sport-work/people`
(`personForm`) → errore toast del server o «Creazione della persona non
riuscita» (il server pretende nome e cognome, codice fiscale `^[A-Z0-9]{11,16}$`
se presente); `!personId` → «Seleziona una persona o creane una nuova». Poi
`POST /api/v1/sport-work/relationships` `{...form, personId}` → errore toast o
«Creazione del rapporto non riuscita» (server: fine non prima dell'inizio, ore
0–168, importo ≥ 0). Successo: chiude, azzera i due form, toast «Rapporto
creato in bozza», `router.push` alla scheda. Pulsanti **Annulla** / **Crea
rapporto** («Creazione…»). Nessuna guardia sulle modifiche non salvate.

### 4. Filtri / ricerca / ordinamento / viste

Ricerca «Cerca per nome o ruolo» (su `full_name + roleLabel`, case-insensitive);
`Select` stato «Tutti gli stati» + le cinque etichette di
`relationshipStatusBadge`. Ordinamento fisso del server (`start_date desc,
created_at desc`). Nessuna vista, nessuna colonna configurabile.

### 5–6. Massa / export

Nessuno.

### 7. Permessi

Guscio `sport_work.read`; scrittura `sport_work.manage` solo server.

### 8. Stati

Loading «Caricamento…»; vuoto (anche filtrato) «Nessun rapporto. Il primo si
crea con «Nuovo rapporto».»; errore → toast «Errore nella lettura dei
rapporti» e elenco vuoto.

### 9. Distruttivi

Nessuno (un rapporto non si elimina: si cessa dalla scheda).

### 10. Navigazione

Uscita: scheda `/sport-work/relationships/{id}?clubId`. Nessun parametro in
entrata oltre a `clubId`.

### 11. Schede

Nessuna.

---

## `/sport-work/relationships/[id]` — scheda del rapporto

File: `src/app/sport-work/relationships/[id]/page.tsx` → `RelationshipDetail
relationshipId clubId` dentro `SportWorkShell title="Rapporto" hideSections`.

### 1. Dati mostrati

`GET /api/v1/sport-work/relationships/{id}?view=detail` → `{relationship,
person (scheda intera, con iban), plan, installments[], transactions[],
activationBlockers[]}`. Ruolo da `readStoredActiveClub()`.

- Riga comandi: **Tutti i rapporti** (ghost, → `/sport-work/relationships?clubId`)
  e, se `canManage`, un pulsante per transizione ammessa
  (`listRelationshipTransitions(status)`): «Attiva» (default) / «Sospendi» /
  «Cessa» (outline), `disabled={busy}`.
- Card intestazione: `{first_name} {last_name}` (h), `{roleLabel} ·
  {relationshipTypeLabel} · {start} [— {end}]`, badge stato. Se `DRAFT` e
  `activationBlockers.length>0`: blocco ambra «Per attivare questo rapporto
  manca:» + elenco (i quattro testi di `listActivationBlockers`: codice
  fiscale, data di inizio, contratto firmato, partita IVA).
- Quattro `SportWorkStat` da `summarizePlanProgress(installments)`:
  Programmato, Maturato, Erogato (positive), Maturato non erogato («Il debito
  della societa verso questa persona», warning se >0).
- `Tabs defaultValue="compensi"`, **nessun parametro URL**: Compensi ·
  Posizione · Registro · Documenti · Anagrafica.

### 11. Schede/sezioni (e i loro dati)

**Compensi**
- `CompensationPlanEditor` (sotto).
- Card «Scadenze» (solo se `installments.length>0`): per riga `label`,
  `{data} · {dueLabel}`, `{gross} lordo · {paid} erogato · {residuo} residuo`,
  badge (`installmentStatusBadge`), pulsante **Eroga** (`Wallet`) se `canPay &&
  remaining_amount>0 && !cancelled` → `PayoutDialog installmentId`.

**Posizione** → `PersonPositionCard personId canManage` (sotto).

**Registro** — card «Registro in uscita» / «Append-only: correggere significa
stornare, e lo storno resta accanto all'originale.»; vuoto «Nessuna
erogazione registrata.»; per riga `gross_amount` (+ «stornata» in rosso se
`reversed_at`), `{paid_at} · anno fiscale {fiscal_year} [· regole
{rules_version}] [· {reversal_reason}]`, «lavoratore {employee_contribution} ·
club {employer_contribution}», badge «Fiscale da verificare» se
`fiscal_treatment==="TO_VERIFY"`, pulsante **Storna** (outline, `RotateCcw`) se
`canPay && !reversed_at && transaction_type==="COMPENSATION_PAYMENT"`.

**Documenti** → `SportWorkDocumentsPanel relationshipId personId canManage
onContractAttached=load` (sotto).

**Anagrafica** — card a due colonne: Codice fiscale, Email, Telefono, Data di
nascita, Partita IVA, IBAN, Importo pattuito, Ore settimanali, Stato RASD
(**codice grezzo** `rasd_status`, non l'etichetta). Sola lettura: **non esiste
alcuna modifica del rapporto o della persona da interfaccia** (il `PATCH`
esiste ma lo usa solo l'allegato del contratto).

### 2. Azioni

- **Attiva / Sospendi / Cessa** → `POST /api/v1/sport-work/relationships/{id}/status`
  `{status, reason}`. Per `TERMINATED` la V1 chiede il motivo con
  **`window.prompt("Motivo della cessazione")`**; vuoto → toast «La cessazione
  richiede un motivo». Errore → toast del server (per es. «Il rapporto non puo
  essere attivato: …» o «Transizione non ammessa…») o «Cambio di stato non
  riuscito»; successo → toast «Rapporto {etichetta minuscola}» e ricarica.
  `force` non e mai mandato.
- **Eroga** → `PayoutDialog`.
- **Storna** → dialogo (sotto).
- Piano, dichiarazione, documenti: sotto.

### 3. Form

**`CompensationPlanEditor`** (card «Piano compensi»): in lettura (se `plan` e
non in modifica) «{COMPENSATION_PLAN_KIND_LABELS[kind]} · {n} scadenze ·
{total_amount}» e, se `canManage`, **Rifai il piano** (outline sm,
`disabled={paidSomething}` con `title` «Alcune scadenze hanno gia ricevuto
denaro: il piano non si rifa») + nota «Alcune scadenze hanno gia ricevuto
denaro: rifare il piano cancellerebbe righe collegate a movimenti del
registro. Per correggere, annulla le rate residue e aggiungine di nuove.» (ma
**nessun pulsante di annullamento rata esiste**: `POST
installments/:id/cancel` non ha superficie).
In modifica (default se `!plan`): titolo «Piano compensi» / «Rifai il piano
compensi», nota «Le scadenze nascono programmate. Maturano quando il loro
periodo e trascorso, non quando qualcuno lo dice.». Campi (`PlanForm`, default
`kind:"EQUAL_INSTALMENTS", installmentCount:"10"`): Forma del piano (`Select`
su `COMPENSATION_PLAN_KINDS` **senza** `CUSTOM`); se `EQUAL_INSTALMENTS`:
Importo complessivo (`plan-total`, decimal), Numero di rate (`plan-count`,
numeric), Prima scadenza (`plan-first`, date); se `MONTHLY`: Importo mensile
(`plan-monthly`), Da (`plan-start`, `type=month`), A (`plan-end`, month),
Giorno di scadenza (`plan-day`, numeric, placeholder «fine mese»).
**Anteprima** calcolata nel browser con `generatePlanItems(toConfig(form))`
(errore in rosso; altrimenti riquadro «Anteprima» + `planTotal`, elenco
`{label} · {dueDate}` / `grossAmount` con `max-h-56`); se
`splitPlanByScheduledYear` da >1 anni: blocco blu «Questo piano attraversa {n}
anni solari» + «{anno}: {count} rate per {total}» + «Ogni anno ha franchigie
proprie e regole proprie: il calcolo dei contributi usa quelle dell'anno in cui
il denaro esce, non quelle della stagione.». Pulsanti **Annulla** (solo se
`plan`) e **Salva piano** (`disabled={saving || !canManage ||
preview.items.length===0}`, «Salvataggio…») → `PUT
/api/v1/sport-work/relationships/{id}/plan` `{...form, ...toConfig(form)}` →
toast «Piano compensi salvato» / errore del server (rifiuta se una scadenza ha
ricevuto denaro) o «Salvataggio del piano non riuscito».

**`PayoutDialog`** («Eroga compenso», `max-w-2xl`; descrizione
`{personName} — {installmentLabel}` o «Calcolo della proposta in corso»):
all'apertura genera `idempotencyKey` (`crypto.randomUUID`), azzera i campi, e
chiama `POST /api/v1/sport-work/payouts/prepare` `{installmentId |
relationshipId, amount?, paidAt}` (ricalcolo al cambio di `paidAt` e al blur
dell'importo; **non** a ogni battitura). Legge anche `GET
/api/v1/fiscal/operation-types` (filtra `directionHint !== "IN"` e
`isActive !== false`). Campi: Importo lordo (`payout-amount`, decimal,
precompilato con `suggestedAmount`), Data di pagamento (`payout-date`, date,
default oggi, nota «L'anno di questa data decide le regole applicate, non la
stagione.»), Metodo (`payout-method`, testo, default «Bonifico»), Riferimento
(`payout-reference`, placeholder «CRO, numero distinta…»), Voce di rendiconto
(`payout-causale`, `<select>` nativo: «Compenso sportivo (predefinita)» + le
causali; nota «Sotto quale voce questa uscita compare nel rendiconto. Non e il
trattamento fiscale, che resta del professionista.»). Con la proposta:
riquadro «Come nasce questo numero» + badge «Regole {rulesVersion}» + `dl`
di `explanation[]` (`label`, `note`, valore `—`/percentuale/importo, righe
`emphasis` evidenziate); due riquadri `{netLabel}` → `netSocial` (+ nota ambra
«Trattamento fiscale da verificare: la ritenuta non e compresa in questo
importo.» se `netDefinitive===null`) e «Costo per il club» → `clubCost`
(«Lordo piu la quota contributiva a carico della societa.»); avvisi
`severity!=="hard"` in blu (`message` + `detail`); avvisi `hard` in ambra con
la spunta obbligatoria «Ho letto gli avvisi e procedo comunque. Questa scelta
viene registrata con il mio nome e la data.»; spunta «Consenti di erogare piu
del residuo della scadenza.» (`allowOverpayment`); Note (`payout-notes`).
Errore di `prepare` in un blocco rosso. Pulsanti **Annulla** / **Registra
erogazione** (`disabled={!proposal || saving || blocked}`, «Registrazione…»)
→ `POST /api/v1/sport-work/payouts` `{installmentId, relationshipId, amount,
paidAt, paymentMethod, reference, operationTypeCode?, notes, allowOverpayment,
acknowledgeWarnings, idempotencyKey}` → toast «Erogazione registrata» o, se
`data.duplicate`, «Questa erogazione era gia stata registrata: nessun doppio
pagamento»; errore → toast del server o «Erogazione non registrata».

**Storno** (`Dialog max-w-md` «Storna l'erogazione» / «La riga originale resta
nel registro, marcata, con il motivo. Una riga di segno opposto la
compensa.»): Motivo (`reverse-reason`, placeholder «Erogazione registrata per
errore»); vuoto → toast «Lo storno richiede un motivo»; **Annulla** /
**Storna** → `POST /api/v1/sport-work/payouts/{id}/reverse` `{reason}` → toast
«Erogazione stornata» / server o «Storno non riuscito».

**`PersonPositionCard`** (card «Posizione verso le soglie» / «Anno solare, per
cassa. Non la stagione sportiva.»): `Select` anno su `CONFIGURED_RULE_YEARS`
(default l'anno corrente se configurato, altrimenti il primo); pulsante
**Autocertificazione** (outline sm, solo `canManage`) → `DeclarationDialog`.
`GET /api/v1/sport-work/people/{personId}/position?year=` → `{position,
drift}`; errore → toast «Errore nella lettura della posizione». Se
`!hasCurrentDeclaration`: blocco ambra «Nessuna autocertificazione per il
{year}» / «Le soglie sono del lavoratore, non del committente: questo
progressivo comprende solo cio che ha erogato questa societa.». Righe:
Compensi erogati dal club («{paymentCount} erogazioni[, ultima il {data}]»),
Compensi esterni dichiarati («Autocertificazione del {data}» / «Nessuna
dichiarazione acquisita»), **Progressivo** (strong), Soglia previdenziale
(«Residua: …» / «Superata»), Imponibile previdenziale, Contributi a carico del
lavoratore, Contributi a carico del club, Soglia fiscale («Residua: …» /
«Superata»), Imponibile fiscale eccedente (strong se >0, nota «Trattamento
fiscale da verificare: EasyGame non calcola la ritenuta»). Se
`drift.hasDrift`: blocco arancio «I contributi calcolati non coincidono con
quelli che si calcolerebbero oggi» + `reason` + «Lavoratore: {frozen} →
{recomputed} ({±delta})» / «Club: …» + «EasyGame non riscrive le erogazioni
gia registrate: quei contributi sono stati calcolati con cio che il club
sapeva allora. La differenza va portata al consulente.». Se
`declarationArrivedAfterPayment && !hasDrift`: badge blu «Dichiarazione
ricevuta dopo alcune erogazioni». Loading «Caricamento…»; `!position` →
«Nessuna posizione per questo anno.».

**`DeclarationDialog`** («Autocertificazione compensi esterni» / «Quanto il
lavoratore dichiara di aver percepito da altri committenti nell'anno. Entra
nel calcolo dei contributi.»): Anno (`Select` anni configurati, default quello
della card), Data della dichiarazione (`decl-date`, date, default oggi),
Compensi percepiti altrove (`decl-amount`, decimal, placeholder «0,00»),
spunta «Il lavoratore dichiara di avere altra copertura previdenziale.»
(`hasOtherCoverage`), Note (`decl-notes`), nota «Questa dichiarazione non
serve solo a calcolare meglio: serve a provare cosa la societa sapeva e
quando. Se la dichiarazione e falsa o tardiva la responsabilita e del
lavoratore, ma il danno operativo — contributi non versati, sanzioni — e del
club.»; storico «Dichiarazioni gia acquisite» da `GET
/api/v1/sport-work/declarations?person_id=`: `{fiscal_year} ·
{declaration_date}[ · sostituita]` / `external_amount`. Validazione:
`amount.trim()===""` → toast «Indica l'importo dichiarato: zero e una
dichiarazione, il campo vuoto no». **Annulla** / **Registra**
(«Registrazione…») → `POST /api/v1/sport-work/declarations` `{personId,
fiscalYear, externalAmount, declarationDate, hasOtherCoverage, notes}` → toast
«Autocertificazione registrata» / server o «Registrazione non riuscita».

**`SportWorkDocumentsPanel`** (card «Documenti» / «Contratto, documento
d'identita, autocertificazioni, comunicazioni. Stessi allegati del resto del
prodotto: non esiste un secondo archivio.»): `listAttachmentsFor(owner, id)`
per `sport_work_relationship` e `sport_work_person`. Se `canManage`: Tipo di
documento (`Select` su `SPORT_WORK_DOCUMENT_CATEGORIES` filtrati fra
`RELATIONSHIP_CATEGORIES` = CONTRACT, MANDATE, COMMUNICATION, INVOICE, PAYSLIP,
EXPENSE_RECEIPT, OTHER e `PERSON_CATEGORIES` = IDENTITY_DOCUMENT,
SELF_DECLARATION, VAT_DOCUMENT, BANK_DETAILS, OTHER; default CONTRACT) +
`<input type=file hidden accept={ATTACHMENT_ACCEPT_ATTRIBUTE}>` + pulsante
**Allega** (`Paperclip`, «Caricamento…»). Se `category==="CONTRACT"`: nota blu
«Allegando il contratto il rapporto lo registra come proprio e passa a
«firmato»: e la condizione che sblocca l'attivazione.». Upload →
`uploadAttachment({file, ownerType, ownerId, category})` (persona se la
categoria e di persona); errore → toast `result.message`; se CONTRACT →
`PATCH /api/v1/sport-work/relationships/{id}` `{contractAttachmentId,
signatureState:"SIGNED"}` (errore → toast «Documento caricato, ma il
collegamento al rapporto non e riuscito», successo → `onContractAttached`);
toast «Documento allegato» e ricarica. Due elenchi: «Documenti del rapporto» /
«Finiscono quando finisce il rapporto: contratto, comunicazioni, fatture.» e
«Documenti della persona» / «Restano alla persona: identita,
autocertificazioni, coordinate bancarie.»; vuoto «Nessun documento.»; riga:
link `buildAttachmentUrl(id, {download: fileName})` (`_blank`), `{categoria}
· {createdAt}`, pulsante icona **Elimina** (`aria-label="Elimina {file}"`,
solo `canManage`) → `deleteAttachmentById(id)` **senza conferma** → toast
«Documento eliminato» / «Eliminazione non riuscita».

### 7. Permessi (client, dalla scheda)

`canManage = sport_work.manage` → transizioni di stato, Rifai il piano, Salva
piano, Autocertificazione, Allega/Elimina documento. `canPay =
sport_work.pay` → Eroga, Storna. Lettura: `sport_work.read` (guscio).

### 8. Stati

Loading «Caricamento…»; `!detail` → «Rapporto non trovato.» (toast del server o
«Rapporto non trovato»). Stati del rapporto e delle scadenze: vedi [Stati](#stati).

### 9. Flussi distruttivi e conferme

- **Cessa**: `window.prompt` del motivo, nessuna conferma oltre a quello.
- **Storna**: dialogo con motivo obbligatorio.
- **Elimina documento**: nessuna conferma.
- **Rifai il piano**: nessuna conferma (il server rifiuta se c'e denaro).
- **Erogazione con avvisi duri**: spunta di presa visione (registrata
  nell'audit).

### 10. Navigazione

Entrata `/sport-work/relationships/{id}?clubId`. Uscita «Tutti i rapporti».
Nessun parametro di tab.

---

## `/sport-work/compensations` — compensi

File: `src/app/sport-work/compensations/page.tsx` → `CompensationsPanel
clubId`. Titolo «Compensi», sottotitolo «Scadenze, registro delle uscite,
premi, rimborsi e fatture dei professionisti. Cinque cose distinte, perche
hanno regimi distinti.»

### 1. Dati mostrati

Sette letture parallele: `GET /api/v1/sport-work/installments`, `/payouts`,
`/bonuses`, `/reimbursements`, `/vat-invoices`, `/people`, `/relationships`.
`nameById` da people; `relationshipLabel(id)` = nome della persona del
rapporto; `vatRelationships` = rapporti con `relationship_type ===
"SELF_EMPLOYED_VAT"`.

`Tabs defaultValue="scadenze"` (nessun parametro URL), cinque schede:

- **Scadenze compenso** («Programmato, maturato ed erogato sono tre numeri
  diversi: la riga li mostra tutti e tre.»): riga = nome persona (o `label`),
  `{label} · {due_date} · {dueLabel}`, `{gross} / {accrued} / {paid}`, badge
  (`installmentStatusBadge`), **Eroga** se `canPay && remaining>0 &&
  !cancelled`. Clic sul testo → scheda del rapporto. Vuoto: «Nessuna scadenza.
  Nascono dal piano compensi di un rapporto.»
- **Registro uscite** («La fonte canonica del denaro uscito. Movimenti lo
  aggrega, non lo duplica.»): riga = `{persona} ·
  {OUTBOUND_TRANSACTION_TYPE_LABELS[type]}`, `{paid_at} · anno {fiscal_year}[ ·
  stornata]`, `gross_amount`. Vuoto «Nessuna uscita registrata.». Nessuna
  azione (lo storno sta nella scheda).
- **Premi** («Somme per un risultato, non per la prestazione. Il trattamento
  fiscale lo dichiara il contratto, non l'etichetta.»): **Nuovo premio**
  (`canManage`); riga = `{persona} · {reason}`, `{award_date} ·
  {BONUS_FISCAL_TREATMENT_LABELS}`, `amount`, badge «Erogato» se `status ===
  "PAID"` altrimenti **Eroga** (outline, `canPay`) → `POST
  /api/v1/sport-work/bonuses/{id}/pay` `{}` → «Premio erogato». Vuoto «Nessun
  premio registrato.»
- **Rimborsi** («Non sono compensi: non concorrono a nessuna soglia e non
  entrano nel progressivo.»): **Nuovo rimborso** (`canManage`); riga =
  `{persona} · {description}`, `{EXPENSE_CATEGORY_LABELS} · {expense_date} ·
  {REIMBURSEMENT_STATUS_LABELS}`, `amount`; azioni per stato: **Presenta**
  (`canManage && DRAFT`) → `PATCH /reimbursements/{id}` `{status:"SUBMITTED"}`
  «Rimborso presentato»; **Approva** (`canManage && SUBMITTED`) → `PATCH`
  `{status:"APPROVED"}` «Rimborso approvato»; **Liquida** (`canPay &&
  APPROVED`) → `POST /reimbursements/{id}/pay` `{}` «Rimborso liquidato». Il
  respingimento (`REJECTED`) **non ha superficie**. Vuoto «Nessun rimborso
  registrato.»
- **Fatture P.IVA** («Gli importi si trascrivono dal documento: il calcolo lo
  ha fatto chi l'ha emesso.»): **Nuova fattura** (`canManage &&
  vatRelationships.length>0`); riga = `{persona} · {document_number}`,
  `{document_date}[ · scadenza {due_date}]`, `total_amount`, badge «Pagata» se
  `PAID` altrimenti **Paga** (outline, `canPay`) → `POST /vat-invoices/{id}/pay`
  `{}` «Fattura pagata». Vuoto: «Nessun rapporto con partita IVA: le fatture si
  registrano su quelli.» se non ci sono rapporti P.IVA, altrimenti «Nessuna
  fattura registrata.»

`post(path, body, success)`: `busy` disabilita tutti i pulsanti, errore →
toast del server o «Operazione non riuscita», successo → toast + ricarica
completa.

### 3. Form (tre dialoghi `max-w-lg`)

**Nuovo premio** («Il trattamento fiscale si dichiara. La distinzione fra
premio e retribuzione variabile la fa il contratto.»): Persona (`Select` su
people, placeholder «Seleziona»), Causale (`bonus-reason`, placeholder «Premio
playoff»), Competizione (`bonus-competition`), Importo (`bonus-amount`,
decimal), Data di assegnazione (`bonus-date`, date, default oggi), Trattamento
fiscale (`Select` su `BONUS_FISCAL_TREATMENTS`, default `TO_VERIFY`);
`relationshipId` nel form ma **senza campo**. Nessuna validazione client:
`POST /api/v1/sport-work/bonuses` `{bonusForm}` → «Premio registrato». Il form
**non si azzera** dopo il salvataggio.

**Nuovo rimborso spese** («Nasce in bozza. Si liquida solo dopo
l'approvazione.»): Persona, Categoria (`Select` su `EXPENSE_CATEGORIES`,
default `TRAVEL`), Importo (`exp-amount`), Causale (`exp-description`,
placeholder «Trasferta Bologna»), Data della spesa (`exp-date`, default oggi).
`POST /api/v1/sport-work/reimbursements` → «Rimborso registrato».

**Nuova fattura ricevuta** («Trascrivi gli importi dal documento: EasyGame non
li ricalcola.»): Rapporto con partita IVA (`Select` su `vatRelationships`,
etichetta = nome persona), Numero documento (`inv-number`), Data documento
(`inv-date`, default oggi), Imponibile (`inv-taxable`), IVA (`inv-vat`),
Ritenuta in fattura (`inv-withholding`), Totale documento (`inv-total`),
Scadenza (`inv-due`, date). `POST /api/v1/sport-work/vat-invoices` → «Fattura
registrata».

Tutti: **Annulla** / **Registra** (`disabled={busy}`), chiusura solo a
successo, nessuna guardia sulle modifiche.

### 4–6. Filtri, massa, export

Nessuno (cinque elenchi piatti, ordine del server).

### 7. Permessi

`canManage` → Nuovo premio/rimborso/fattura, Presenta, Approva. `canPay` →
Eroga (scadenze e premi), Liquida, Paga.

### 8. Stati

Loading «Caricamento…» a pagina; errore sulle scadenze → toast «Errore nella
lettura dei compensi» e niente; errori delle altre letture ignorati (elenchi
vuoti).

### 9–10

Nessun flusso distruttivo. Uscita: scheda del rapporto (dalle scadenze).

---

## `/sport-work/deadlines` — scadenze

File: `src/app/sport-work/deadlines/page.tsx` → `DeadlinesPanel clubId`.
Titolo «Scadenze», sottotitolo «Cosa e in ritardo, cosa scade adesso, cosa
arriva. Compensi e adempimenti insieme, ordinati per data.»

### 1. Dati mostrati

`GET /installments`, `GET /obligations?status=DUE`, `GET /people` in
parallelo, poi `GET /relationships` (per risalire dalla scadenza alla
persona). `Entry`: scadenze con `!cancelled && remaining_amount>0` (titolo =
nome persona o «Compenso», sottotitolo `{label} · residuo {remaining}`,
importo = residuo, `payable`) + adempimenti DUE (titolo, sottotitolo = kind
label, importo o `null`). Ordinate per `dueDate`.

Tre gruppi per `daysUntil`: **In ritardo** (<0, vuoto «Niente in ritardo.»),
**Entro sette giorni** (0–7, «Niente in scadenza questa settimana.»), **Entro
trenta giorni** (8–30, «Niente in scadenza nel mese.»). **Le voci oltre i
trenta giorni non compaiono da nessuna parte** (difetto V1).

Tre `SportWorkStat`: In ritardo (somma importi, `{n} voci`, danger se >0),
Entro sette giorni (somma, warning se >0), Entro trenta giorni (conteggio,
«Voci in arrivo»).

Riga: titolo (pulsante → scheda del rapporto se `relationshipId`),
`{sottotitolo} · {data} · {dueLabel}`, importo, badge (`installmentStatusBadge`
per le scadenze; «Adempimento» grigio per gli adempimenti), **Eroga** se
`canPay && payable`.

### 2. Azioni

Eroga → `PayoutDialog installmentId`. Nessun'altra (gli adempimenti non si
assolvono da qui).

### 3–6

Nessun form, filtro, massa, export.

### 7. Permessi

`canPay` → Eroga. Guscio `sport_work.read`.

### 8. Stati

Loading «Caricamento…»; errore su installments → toast «Errore nella lettura
delle scadenze».

---

## `/sport-work/obligations` — adempimenti

File: `src/app/sport-work/obligations/page.tsx` → `ObligationsPanel` (senza
`clubId`). Titolo «Adempimenti», sottotitolo «Comunicazioni, contributi,
Certificazione Unica. EasyGame prepara i dati e ricorda la scadenza:
trasmettere resta di una persona.»

### 1. Dati mostrati

`GET /api/v1/sport-work/obligations` (tutti), `GET
/api/v1/sport-work/datasets?kind=f24&year=` e `?kind=cu&year=` (parallelo,
`year` di stato: anno corrente se configurato altrimenti il primo).

Banner grigio: «EasyGame prepara i dati dell'adempimento e ricorda la
scadenza. **Non trasmette niente**: non al RASD, non a UNILAV, non all'INPS,
non all'Agenzia delle Entrate. «Assolto» significa che una persona lo ha
fatto e lo ha dichiarato qui.»

`Tabs defaultValue="agenda"`: **Agenda** (DUE), **Dati F24**, **Dati CU**,
**Storico** (`status !== "DUE"`).

Riga adempimento: `title`, `{kind label} · {due_date} · {dueLabel}`,
`description` se presente, `amount` se presente, badge
(`obligationStatusBadge`), **Assolto** (`CheckCircle2`, solo in Agenda e
`canManage`). Vuoto «Nessun adempimento in questa vista.». Il campo
`paymentReversed` (marcatura dei versamenti stornati) arriva e **non e
mostrato**.

**Dati F24** («Importi e causali calcolati sulle erogazioni registrate.
EasyGame non compila e non invia l'F24.»): `Select` anno + **CSV**
(`disabled` a zero righe, file `f24-{year}.csv`); tabella Periodo · Causale
(mono) · Lavoratore · Club · Totale (bold) · Versamento entro. Senza
`canFiscal`: «Questa vista richiede il permesso sui dati fiscali.»; vuoto
«Nessun contributo maturato nel {year}.»

**Dati CU** («Dataset di appoggio. EasyGame non predispone e non trasmette la
CU.»): **CSV** (`cu-{year}.csv`); tabella Persona · Codice fiscale (mono) ·
Lordo · Esterni · Progressivo · Imponibile fisc. · Nota (`attentionReason`
ambra). Senza permesso: stessa frase; vuoto «Nessun compenso erogato nel
{year}.»

**Storico** («Assolti e non piu dovuti» / «Un adempimento non si cancella: e
stato dovuto, e la sua storia serve a spiegare perche.»).

### 2. Azioni

- **Riallinea agenda** (`RefreshCw`, outline, `canManage`) → `POST
  /api/v1/sport-work/obligations/sync` → toast «Agenda riallineata: {created}
  nuovi, {updated} aggiornati, {closed} non piu dovuti.» / server o
  «Aggiornamento non riuscito».
- **Assolto** → `POST /api/v1/sport-work/obligations/{id}/complete` `{}` →
  «Adempimento marcato come assolto» / «Aggiornamento non riuscito».
  **Nessuna conferma.**
- **CSV** F24/CU → `downloadCsv(nome, toCsv(colonne dalle chiavi della prima
  riga, righe))` (`src/lib/csv.ts`): intestazioni = **chiavi grezze** dell'API
  (`period`, `causale`, `employeeContribution`…).

### 3–5

Nessun form (`createManualObligation` esiste ma **non ha superficie**),
nessun filtro oltre la divisione DUE/non-DUE, nessuna massa.

### 6. Export

I due CSV. Nessun import.

### 7. Permessi

`canManage` → Riallinea, Assolto. `canFiscal` (`sport_work.fiscal`) → i due
dataset (il server risponde 403 senza; la V1 mostra le due schede comunque, con
la frase).

### 8. Stati

Loading «Caricamento…»; errore sull'agenda → toast «Errore nella lettura
dell'agenda» e pannello vuoto.

### 9–10

«Assolto» e irreversibile (non esiste un «riapri») e non ha conferma. Nessun
parametro URL.

---

## Endpoint

| Uso | Endpoint | Permesso server |
|---|---|---|
| Cruscotto | `GET /api/v1/sport-work/dashboard` | `sport_work.read` |
| Giro a mano | `POST /api/v1/sport-work/scheduler` | `sport_work.manage` |
| Persone | `GET /api/v1/sport-work/people` · `POST` | read · manage |
| Posizione | `GET /api/v1/sport-work/people/{id}/position?year=` | read |
| Rapporti | `GET /api/v1/sport-work/relationships` · `POST` | read · manage |
| Scheda | `GET /api/v1/sport-work/relationships/{id}?view=detail` · `PATCH` | read · manage |
| Stato | `POST /api/v1/sport-work/relationships/{id}/status` `{status, reason}` | manage |
| Piano | `PUT /api/v1/sport-work/relationships/{id}/plan` | manage |
| Scadenze | `GET /api/v1/sport-work/installments` | read |
| Registro | `GET /api/v1/sport-work/payouts` · `POST` · `POST /prepare` · `POST /{id}/reverse` | read · pay · pay · pay |
| Dichiarazioni | `GET /api/v1/sport-work/declarations?person_id=` · `POST` | read · manage |
| Premi | `GET /api/v1/sport-work/bonuses` · `POST` · `POST /{id}/pay` | read · manage · pay |
| Rimborsi | `GET /api/v1/sport-work/reimbursements` · `POST` · `PATCH /{id}` · `POST /{id}/pay` | read · manage · manage · pay |
| Fatture | `GET /api/v1/sport-work/vat-invoices` · `POST` · `POST /{id}/pay` | read · manage · pay |
| Agenda | `GET /api/v1/sport-work/obligations[?status=DUE]` · `POST /sync` · `POST /{id}/complete` | read · manage · manage |
| Dataset | `GET /api/v1/sport-work/datasets?kind=f24\|cu&year=` | `sport_work.fiscal` |
| Causali | `GET /api/v1/fiscal/operation-types` | (contabilita) |
| Allegati | `listAttachmentsFor`, `uploadAttachment`, `deleteAttachmentById` (`src/lib/api/attachments.ts`), `buildAttachmentUrl` | Attachment Core |

Tutto passa da `apiRequest` (`src/lib/api/client.ts`). Nessun `fetch` diretto.

## Permessi

Matrice propria del dominio (`src/lib/sport-work/permissions.ts`,
`hasSportWorkPermission(role, key)` → `narrowDomainPermission` per i ruoli
personalizzati): `sport_work.read` (guscio, tutte le letture),
`sport_work.manage` (rapporti, piani, dichiarazioni, documenti, premi,
rimborsi, fatture, adempimenti, scheduler), `sport_work.pay` (erogazioni,
storni, pagamenti di premi/rimborsi/fatture), `sport_work.fiscal` (dataset
F24/CU). Ruoli con tutto: `owner`, `club_manager`. Il ruolo si legge da
`readStoredActiveClub()?.role`.

Predicati client **mancanti** in V1 (il server risponde 403): «Nuovo rapporto»
e «Crea rapporto», «Aggiorna maturato e agenda».

## Stati

Etichette del dominio (`src/lib/sport-work/model.ts`):

- Rapporto (`RELATIONSHIP_STATUS_LABELS`): DRAFT «Bozza» (grigio), ACTIVE
  «Attivo» (verde), SUSPENDED «Sospeso» (ambra), EXPIRED «Scaduto» (arancio),
  TERMINATED «Cessato» (rosso). Transizioni: DRAFT→ACTIVE|TERMINATED;
  ACTIVE→SUSPENDED|TERMINATED; SUSPENDED→ACTIVE|TERMINATED;
  EXPIRED→ACTIVE|TERMINATED; TERMINATED→∅. Verbi: «Attiva», «Sospendi»,
  «Cessa».
- Scadenza (`INSTALLMENT_STATUS_LABELS`, derivato): SCHEDULED «Programmata»
  (grigio), ACCRUED «Maturata» (blu), PARTIALLY_PAID «Parzialmente erogata»
  (ambra), PAID «Erogata» (verde), OVERDUE «Scaduta» (rosso), CANCELLED
  «Annullata» (grigio barrato).
- Adempimento (`OBLIGATION_STATUS_LABELS`): DUE «Dovuto» (ambra), IN_PROGRESS
  «In corso» (blu), COMPLETED «Assolto» (verde), NOT_DUE «Non dovuto» (grigio).
- Premio: `PAID` → «Erogato» (verde); altrimenti nessun badge (pulsante).
- Rimborso (`REIMBURSEMENT_STATUS_LABELS`, testo nella riga meta): DRAFT
  «Bozza», SUBMITTED «Presentato», APPROVED «Approvato», REJECTED «Respinto»,
  PAID «Liquidato».
- Fattura: `PAID` → «Pagata» (verde); altrimenti pulsante.
- Dichiarazione (`DECLARATION_STATUS_LABELS`): ACTIVE «Valida», SUPERSEDED
  «Sostituita», REVOKED «Revocata» (nel dialogo: «· sostituita» per
  `status !== "ACTIVE"`).
- Registro: «stornata» (rosso) se `reversed_at`; badge «Fiscale da verificare»
  se `fiscal_treatment === "TO_VERIFY"`.
- RASD (`RASD_STATUS_LABELS`): NOT_REQUIRED «Non dovuta», TO_PREPARE «Da
  preparare», READY «Pronta», SUBMITTED «Trasmessa», CONFIRMED «Confermata»,
  ERROR «Errore» (la V1 mostra il codice grezzo).

Nessuna di queste parole (salvo BOZZA/ATTIVO/SOSPESO e le monetarie
PARZIALE/SCADUTO/ANNULLATO/PAGATO/IN ATTESA/IN CORSO) esiste in
`src/lib/web/status.ts`.

## Test collegati

- `tests/ui/pp-01-superfici.test.mjs` §L — legge
  `components/sport-work/SportWorkShell.tsx`: i cinque `href: "…"` e
  `SPORT_WORK_SECTIONS.map`; e verifica che barra laterale e barra mobile
  abbiano **una** voce `/sport-work` e nessuna sottopagina.
- `tests/ui/prima-nota-v2-parita.test.mjs` — `href="/sport-work/compensations"`
  in `AccountingSummary` (non di queste rotte).
- `tests/ui/procura-v2-parity.test.mjs` — `/procura` non deve citare
  `sport-work`.
- `tests/ui/wave6-superfici-6c.test.mjs`, `wave6-superfici-6g.test.mjs`,
  `tests/lib/presidi-che-nessuno-copriva.test.mjs`,
  `tests/lib/sport-work-permissions.test.mjs`, `tests/lib/catalogo-permessi.test.mjs`
  — la matrice dei permessi (dominio, non toccato).
- `tests/lib/sport-work-{engine,plan,position,obligations,rules,
  year-filter,legacy-migration,movements}.test.mjs`,
  `tests/server/sport-work-*.test.mjs` — dominio e rotte (non toccati).
- `tests/web/shell-navigation.test.mjs` — `/sport-work` nel guscio.
- **Nessun test statico** legge i pannelli V1 oltre a `SportWorkShell.tsx`.

## Inventario componenti

Specifici delle rotte (si rimuovono dopo la parità): `SportWorkShell`
(**tranne `SportWorkStat`**, usato da `PersonCompensationTab`),
`SportWorkDashboardPanel`, `RelationshipsPanel`, `RelationshipDetail`,
`CompensationPlanEditor`, `PayoutDialog`, `SportWorkDocumentsPanel`,
`CompensationsPanel`, `DeadlinesPanel`, `ObligationsPanel`.

**Condivisi con altre rotte** (restano): `PersonCompensationTab` (schede
atleta `/athletes/[id]`, allenatore `/trainers/[id]`, staff `/staff/[id]`),
`PersonPositionCard` + `DeclarationDialog` (montati da
`PersonCompensationTab`), `sport-work-format.ts`, `SportWorkStat`.

Primitive V1 usate: `Card*`, `Badge`, `Button`, `Input`, `Label`, `Textarea`,
`Checkbox`, `Select*`, `Tabs*`, `Dialog*`, `SharedPageHeader`; lib:
`apiRequest`, `readStoredActiveClub`, `hasSportWorkPermission`,
`listRelationshipTransitions`, `RELATIONSHIP_STATUS_LABELS`,
`summarizePlanProgress`, `generatePlanItems`, `planTotal`,
`splitPlanByScheduledYear`, `CONFIGURED_RULE_YEARS`, `SOCIAL_COVERAGES`,
`SOCIAL_COVERAGE_LABELS`, le costanti di `model.ts`, `downloadCsv`, `toCsv`,
`listAttachmentsFor`, `uploadAttachment`, `deleteAttachmentById`,
`ATTACHMENT_ACCEPT_ATTRIBUTE`, `buildAttachmentUrl`, `todayLocalDateOnly`.

## Cosa non esiste in V1

E quindi la V2 **non inventa**:

- modifica di un rapporto (date, importo, ore, note, RASD) o della persona
  (codice fiscale, partita IVA, IBAN) da interfaccia: il `PATCH` esiste solo
  per il contratto. I blocchi di attivazione «codice fiscale non registrato» e
  «partita IVA non indicata» **non sono risolvibili da schermata**;
- annullamento di una scadenza (`POST installments/:id/cancel`);
- respingimento di un rimborso (`REJECTED`);
- adempimento manuale (`createManualObligation`);
- riapertura di un adempimento assolto;
- filtri/ricerca/export sugli elenchi di compensi, scadenze, adempimenti;
- deep link alle schede interne (nessun `?tab=`);
- eliminazione di un rapporto, di una persona, di un premio, di un rimborso,
  di una fattura, di un'erogazione (si storna).

Difetti V1 da dichiarare nel rapporto: `window.prompt` per il motivo della
cessazione; eliminazione documento senza conferma; «Assolto» senza conferma;
le voci oltre i trenta giorni assenti da «Scadenze»; le intestazioni dei CSV
F24/CU sono le chiavi dell'API; il form del premio non si azzera; pulsanti di
scrittura visibili senza il permesso (rapporti, scheduler); i «Contratti in
scadenza» e le «Autocertificazioni mancanti» del cruscotto sono conteggi senza
verbo.

## Sintesi

1. Sei rotte sottili, un guscio con la riga delle cinque sezioni e la guardia
   `sport_work.read`, undici pannelli che parlano solo con `apiRequest`.
2. Tre scritture di denaro (erogazione con proposta e presa visione, storno
   con motivo, pagamento di premi/rimborsi/fatture) tutte sotto
   `sport_work.pay`; tutto il resto sotto `sport_work.manage`; i dataset sotto
   `sport_work.fiscal`.
3. Elenchi piatti ovunque (nessuna griglia, un solo filtro di stato sui
   rapporti); stati derivati mostrati con badge colorati dalle etichette del
   dominio.
4. Sei form: nuovo rapporto (persona esistente o nuova), piano compensi con
   anteprima, erogazione, autocertificazione, premio, rimborso, fattura;
   nessuna guardia sulle modifiche, validazione quasi tutta sul server.
5. Tre conferme mancanti (cessazione via `prompt`, elimina documento,
   assolto), un elenco che nasconde le voci oltre trenta giorni, due pulsanti
   senza predicato client.
