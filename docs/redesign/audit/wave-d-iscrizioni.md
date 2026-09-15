# Wave D — Audit di parita funzionale: `/registration-management` (Iscrizioni)

**Ambito:** la rotta `/registration-management`, che il guscio V2 chiama
**«Iscrizioni»** (`src/components/web/shell/navigation.ts`, gruppo Segreteria)
e che la V1 intitola **«Gestione iscrizioni»**.

**Metodo:** lettura integrale di `src/app/registration-management/page.tsx`
(3.333 righe, ~152 KB), di tutto cio che importa (`src/components/funding/**`,
`src/lib/payment-plan-utils.ts`, `src/lib/payments/payment-config-utils.ts`,
`src/lib/payments/provider-registry.ts`, `src/lib/club-seasons.ts`,
`src/lib/simplified-db.ts` per le sei funzioni usate), della matrice permessi
(`src/lib/access-roles.ts`, `src/lib/permissions/catalog.ts`,
`src/lib/funding/permissions.ts`) e dei test in `tests/**` che nominano la
pagina o i componenti. Etichette **esatte** come nel codice.

> **La scoperta che governa tutto il resto.** Nonostante il nome, questa
> pagina **non e un elenco di iscrizioni per atleta**. E la **configurazione
> economica dell'iscrizione**: piani di pagamento (listini), metodi di
> pagamento manuali e online, sconti e promozioni, programmi di contributo
> (voucher e bandi). L'iscrizione del singolo atleta — stato attivo/non
> attivo, piano scelto, data inizio, sconto, rate generate — vive nella
> **scheda atleta** (`/athletes/[id]`, area Amministrazione, sezione
> Iscrizione: `src/components/athletes/enrollment/AthleteEnrollmentTab.tsx`),
> e l'elenco club-wide delle **rate** con i solleciti vive in
> `/movements?tab=rate`. Non esiste in tutta la V1 una griglia «un atleta per
> riga con stato iscrizione, dovuto, incassato, residuo, prossima rata», ne un
> endpoint che la serva: `getClubAthletes` porta i booleani grezzi in
> `data.enrollmentStatus`, e i numeri dell'iscrizione li calcola
> `getAthleteEnrollmentSummary` **per un atleta alla volta**, con il registro
> incassi di quell'atleta in mano. Gli stati canonici `ENROLMENT_STATUS`
> (`INCOMPLETA` · `DA SISTEMARE` · `RIFIUTATA`) non hanno **nessuna**
> corrispondenza nel modello dati: l'iscrizione e un booleano. Una griglia
> cosi sarebbe una capacita **nuova** con aggregazione nel browser, che e
> esattamente la forma che `tests/ui/accounting-movements-surface.test.mjs`
> vieta sul dominio denaro. Vedi §13 «Cosa non c'e».

---

## 1. Dati mostrati

**Intestazione** (`Header title="Gestione Iscrizioni"`;
`SharedPageHeader`): titolo **"Gestione iscrizioni"**, sottotitolo
*"Configura piani, metodi di pagamento e gestione delle iscrizioni."*

**Quattro schede** (`Tabs defaultValue="payment-plans"`, stato locale, **non**
in URL): **"Piani di Pagamento"** (`CreditCard`) · **"Metodi di Pagamento"**
(`Landmark`) · **"Sconti e Promozioni"** (`Tag`) · **"Voucher e Contributi"**
(`HandCoins`). La `TabsList` scorre in orizzontale (`overflow-x-auto`): a
375 px le quattro schede chiedono 757 px (A2-18, Blocco Finale C).

**Una quinta `TabsContent value="clothing-kits"` senza `TabsTrigger`**: i
kit di abbigliamento e l'assegnazione kit agli atleti (~700 righe, dialoghi
compresi) sono **irraggiungibili** da questa pagina. La stessa funzione vive
per intero in `/clothing` (`src/app/clothing/page.tsx`, che legge e scrive
`clothing_kits` e `kit_assignments`). E un duplicato morto, non una
capacita: gli stati e i caricamenti di `athletes`, `categories`,
`clothing_kits`, `kit_assignments` servono solo a lui.

### 1.1 Scheda «Piani di Pagamento»

Card **"Piani di Pagamento"** / *"Configura i piani di pagamento disponibili
per gli atleti"*. Griglia di card (1 → 2 → 3 colonne), bordo sinistro verde
se attivo / grigio se no. Per piano (dopo `normalizePaymentPlan`):
- nome; **"{n} servizi"**; descrizione o **"Nessuna descrizione"**;
- **"Totale servizi:"** `formatPlanCurrency(totalAmount)` (it-IT EUR);
- **"Rate:"** `installmentsCount`;
- **"Prima scadenza:"** **"Dopo {dueAfterDays} giorni"** della prima rata (0 se manca);
- **"Pro-rata:"** **"Mesi"** / **"Giorni"** (solo se `proration.enabled`);
- riquadro con i primi 3 servizi (nome · prezzo) e **"+{n} altri servizi"**;
- **"Stato:"** **"Attivo"** (verde) / **"Disattivato"** (grigio).

Vuoto: **"Nessun piano di pagamento configurato. Crea il tuo primo piano."**

### 1.2 Scheda «Metodi di Pagamento»

Card **"Metodi di Pagamento"** / *"Configura i metodi di pagamento accettati
dalla tua organizzazione"*.

**Riquadro "Metodi online da Club > Pagamenti"** / *"La Gestione Iscrizioni
usa solo provider abilitati, configurati e inclusi dal club."* con pulsante
**"Apri Pagamenti"** (`window.location.href = "/organization?tab=pagamenti"`,
ricarica intera). Se `getAvailableRegistrationPaymentMethods(...)` e vuoto:
**"Nessun metodo di pagamento online configurato. Configura i metodi nella
pagina Club > Pagamenti."** Tabella sempre presente, una riga per provider
di `PAYMENT_PROVIDER_ORDER` (stripe · paypal · postepay · mastercard):
**Metodo** (`config.publicLabel || definition.label`) · **Provider**
(`definition.label`) · **Stato** (badge **"Abilitato"/"Disabilitato"** +
badge `paymentStatusLabel(config.status)`: "Non configurato" · "Configurato"
· "Richiede onboarding" · "Attivo" · "Disabilitato" · "Errore" + badge
**"Predisposto"** se `!definition.isImplemented`) · **Disponibile** (badge
**"Disponibile"** / **"Non disponibile"** = presente fra i metodi utilizzabili
per l'iscrizione).

**Metodi manuali** (`clubs.settings.paymentMethods` normalizzati con
`normalizeClubPaymentMethod`): card per metodo con nome, dettagli
(`whitespace-pre-line`), **"Stato:"** **"Attivo"/"Disattivato"**. Vuoto:
**"Nessun metodo di pagamento configurato. Crea il tuo primo metodo."**

### 1.3 Scheda «Sconti e Promozioni»

Card **"Sconti e Promozioni"** / *"Configura sconti e promozioni da applicare
agli importi"*. Card per sconto: titolo; **"Valore:"** `{value}%` (icona
`Percent`) oppure `{value.toFixed(2)}` (icona `Euro`); **"Tipo:"** badge
**"Percentuale"** / **"Importo Fisso"**; **"Stato:"** **"Attivo"/"Disattivato"**.
Vuoto: icona `Tag` + **"Nessuno sconto configurato"** / **"Crea il tuo primo
sconto o promozione"**.

### 1.4 Scheda «Voucher e Contributi»

`<FundingProgramsPanel />` (componente condiviso, montato **solo** qui —
`AthleteFundingSummary` della scheda atleta e un componente diverso). Card
**"Voucher e contributi"** / *"Bandi ed enti finanziatori. Le regole sono
configurazione: importo per periodo, requisito minimo e cosa succede sotto la
soglia."* Elenco di programmi (`GET /api/v1/funding/programs`): nome, badge
**"BOZZA"/"ATTIVO"/"CHIUSO"**, "Apri la scheda", *"{funder_name} · dal {data}
al {data}"*, **"Massimale programma:"**, **"Per periodo:"** (+ " al mese" /
" ogni N giorni"), **"Requisito:"** `{requirement_min} {unita}`, **"Fonte
della maturazione:"**. Caricamento: **"Lettura dei programmi..."**; vuoto:
**"Nessun programma configurato. Un voucher regionale, un contributo comunale
o un bando privato si descrivono tutti con gli stessi campi."** Il clic sulla
riga sostituisce il pannello con `FundingProgramDetail` (`programId`,
`canManage`, `onBack`): scheda del programma con transizioni, iscritti,
cinque importi, ricerca e filtro stato — inventario completo in
`wave-c-administration.md` §D.1–D.3, che qui non si ripete.

## 2. Azioni

| Dove | Azione | Effetto |
|---|---|---|
| Piani | **"Nuovo Piano"** (blu) | apre il dialogo **"Nuovo Piano / Abbonamento"** con il modulo vuoto |
| Piani, card | icona `Edit` | apre lo stesso dialogo come **"Modifica Piano"** con il piano normalizzato |
| Piani, card | icona `Trash2` | `confirm("Sei sicuro di voler eliminare questo piano di pagamento?")` → `deleteClubDataItem(clubId, "payment_plans", id)` |
| Dialogo piano | **"Aggiungi servizio"** / **"Rimuovi servizio"** (disabilitato sotto 1) · **"Aggiungi rata"** / **"Rimuovi rata"** (disabilitato sotto 1) · **"Annulla"** · **"Salva"** / **"Aggiorna"** | stato locale; il salvataggio e `savePlan` |
| Metodi | **"Nuovo Metodo"** | dialogo **"Nuovo Metodo di Pagamento"** |
| Metodi, card | `Edit` / `Trash2` | **"Modifica Metodo"**; `confirm("Sei sicuro di voler eliminare questo metodo di pagamento?")` → `persistPaymentMethods(senza quello)` |
| Metodi | **"Apri Pagamenti"** | `window.location.href = "/organization?tab=pagamenti"` |
| Sconti | **"Nuovo Sconto"** | dialogo **"Nuovo Sconto/Promozione"** |
| Sconti, card | `Edit` / `Trash2` | **"Modifica Sconto"**; `confirm("Sei sicuro di voler eliminare questo sconto?")` → `deleteClubDataItem(clubId, "discounts", id)` |
| Voucher | **"Nuovo programma"** → `POST /api/v1/funding/programs`; clic riga → scheda; dentro la scheda: Attiva/Chiudi, Iscrivi atleti, Togli/Revoca, Ricalcola, decisioni, conferma, liquidazione, storno (wave-c §D.2) |

Scritture della pagina (tutte via `src/lib/simplified-db.ts`, cioe
`GET/PATCH /api/v1/clubs?fields=…` con lettura-modifica-scrittura della
colonna intera):
- `getClubData(clubId, "payment_plans" | "categories" | "discounts" | "clothing_kits" | "kit_assignments")` — filtra per **stagione attiva** le collezioni in `SEASON_SCOPED_DATA_TYPES` (`payment_plans`, `discounts`);
- `addClubData(clubId, tipo, record)` — timbra `seasonId` con la stagione attiva;
- `updateClubDataItem(clubId, tipo, id, record)` — **restituisce la colonna intera, non filtrata per stagione**; la V1 la mette in stato cosi com'e (dopo una modifica compaiono i piani delle altre stagioni fino al reload — difetto latente);
- `deleteClubDataItem(clubId, tipo, id)` — idem;
- `getClubSettings(clubId)` / `saveClubSettings(clubId, { paymentMethods })` — merge superficiale su `clubs.settings`;
- `getClubAthletes(clubId)` — solo per la scheda kit irraggiungibile.

## 3. Moduli, ogni campo e validazione

### 3.1 Piano (`Dialog max-w-4xl`, ~20 campi + due elenchi ripetuti)

Stato iniziale `createEmptyPaymentPlanForm()`: nome "", descrizione "", un
servizio (`createPlanService`: nome "", descrizione "", prezzo 0, tipo
`allenamenti`, `optional false`, `required true`, `included true`), una rata
(`createPlanInstallment(0)`: **"Pagamento unico"**, `percentage`, 100,
`dueAfterDays 0`; le successive **"Rata {n}"**, `remaining`, 0, `n*30`
giorni), pro-rata `{enabled false, method "none", seasonStartDate "",
seasonEndDate "", allowManualOverride true}`, `applicableDiscountIds []`,
note "", `active true`.

| Campo | Controllo | Note |
|---|---|---|
| **"Nome Piano"** | Input, placeholder "Es. Stagione completa" | obbligatorio |
| **"Totale automatico"** | riquadro sola lettura `calculatePlanTotal(newPlan)` + *"Somma dei servizi inclusi nel piano."* | |
| **"Descrizione"** | Textarea "Descrizione del piano" | |
| **Servizi inclusi** — *"Dettaglia quote, allenamenti, assicurazione, kit o componenti extra del piano."* | per servizio **"Servizio {n}"**: **"Nome servizio"** ("Es. Allenamenti stagione"), **"Tipo"** (`PAYMENT_PLAN_SERVICE_TYPES`: Iscrizione · Allenamenti · Assicurazione · Kit · Torneo/Gare · Altro), **"Prezzo"** (number min 0 step 0.01), **"Descrizione servizio"** ("Dettaglio opzionale visibile nel riepilogo", 2 righe), **"Opzionale per atleta"** (checkbox: `optional = checked`, `required = !checked`), **"Incluso nel totale"** (checkbox `included`) | almeno un servizio con nome |
| **Rate e scadenze** — *"Le scadenze sono relative alla data inizio iscrizione dell'atleta."* | per rata **"Rata {n}"**: **"Nome rata"** ("Es. Prima rata"), **"Tipo importo"** (Percentuale · Importo fisso · Saldo restante), **"Valore"** (number, disabilitato se `remaining`, placeholder "%" o "EUR"), **"Scadenza dopo giorni"** (int min 0) | avviso rosso = `generateInstallmentPreview(...).warnings[0]` (es. "La somma delle percentuali supera il 100%.") e **blocca il salvataggio** |
| **Calcolo quota stagionale** — *"Il pro-rata viene applicato quando assegni il piano a un atleta con data inizio."* | **"Abilita calcolo proporzionale"** (checkbox; accendere porta `method` a `days`, spegnere a `none`); se acceso: **"Metodo"** (Per giorni · Per mesi), **"Permetti override manuale"** → checkbox **"Modifica importo in scheda atleta"**, **"Inizio periodo/stagione"** (date), **"Fine periodo/stagione"** (date) | frase dinamica: senza date e con stagione attiva **"Se lasci vuote le date uso il periodo della stagione attiva: {start} - {end}."**; senza date ne stagione **"Senza queste date e senza una stagione attiva con un periodo, il pro-rata non puo essere calcolato."**; con date **"Il piano ha un periodo proprio: la stagione attiva non viene usata."** (`tests/lib/payment-proration.test.mjs` verifica `fallbackPeriod: seasonPeriod` e la frase) |
| **Anteprima** — *"Esempio calcolato con data inizio oggi e rate arrotondate a multipli di 5 euro."* | **"Totale servizi"**, **"Totale esempio"** (`calculateProratedTotal({ total, proration, startDate: todayLocalDateOnly(), fallbackPeriod: seasonPeriod }).total`), **"Rate"** (conteggio); una riga per rata: etichetta · **"Dopo {n} giorni"** · importo; `prorationPreview.warning` in ambra | sola lettura |
| **Sconti applicabili** — *"Se non selezioni nulla, tutti gli sconti restano applicabili a questo piano."* | checkbox per ogni sconto attivo (id = `discount.id || title || name`); **"Nessuno sconto configurato."** | |
| **"Note interne"** | Textarea "Note operative opzionali", 3 righe | |
| (assente dal modulo) `active` | il flag e nello stato ma **nessun controllo** lo espone: un piano nasce attivo e resta attivo; in modifica mantiene il valore del record | vedi §13 |

Validazione `savePlan`: `!name || validServices.length === 0` → toast
**"Inserisci nome piano e almeno un servizio"**; `!activeClub?.id` → **"Club
non trovato"**; `warnings.length > 0` → toast con il primo avviso. Il record
salvato e `normalizePaymentPlan({...})` senza `raw`, con `amount`,
`totalAmount`, `installments` (conteggio), `installmentsCount`,
`installmentAmount`, `installmentSchedule`, `paymentSchedule`, `proration`,
`applicableDiscountIds`, `services`, `notes`, `active`, `id`
(`plan_{Date.now()}` se nuovo), `createdAt`, `updatedAt`. Toast di esito:
**"Nuovo piano di pagamento aggiunto con successo"** / **"Piano di pagamento
aggiornato con successo"** / **"Errore nel salvataggio del piano di
pagamento"**.

### 3.2 Metodo di pagamento (3 campi)

**"Nome Metodo"** ("Es. Bonifico Bancario", obbligatorio → toast **"Inserisci
un nome per il metodo di pagamento"**), **"Dettagli"** (Textarea 4 righe,
"Dettagli del metodo di pagamento"), **"Metodo attivo"** (checkbox nativo).
Salva → `normalizeClubPaymentMethod` con id esistente o `crypto.randomUUID()`
→ `saveClubSettings(clubId, { paymentMethods: serializeClubPaymentMethodsForSettings(...) })`.
Toast **"Nuovo metodo di pagamento aggiunto con successo"** / **"Metodo di
pagamento aggiornato con successo"** / **"Errore nel salvataggio del metodo di
pagamento"**.

### 3.3 Sconto (4 campi)

**"Titolo"** ("Es. Sconto Famiglia"), **"Tipo di Sconto"** (**"Percentuale
(%)"** · **"Importo Fisso (€)"**), **"Percentuale (%)"** / **"Importo (€)"**
(number min 0, step 1 o 0.01), **"Sconto attivo"** (checkbox). Validazione:
`!title || value <= 0` → toast **"Compila tutti i campi"**. Record
`{ title, type, value, active, id: discount_{Date.now()}, createdAt, updatedAt }`.
Toast **"Sconto aggiunto con successo"** / **"Sconto aggiornato con successo"**
/ **"Errore nel salvataggio dello sconto"**.

### 3.4 Programma di contributo

`FundingProgramsPanel` → dialogo **"Nuovo programma di contributo"**: campi e
validazione (`validateFundingProgram`, la stessa del server) in wave-c §D.3.
Non si tocca.

### 3.5 Kit e assegnazione kit (irraggiungibili)

Dialoghi **"Nuovo Kit Abbigliamento"/"Modifica Kit"** e **"Nuova Assegnazione
Kit"** con `CustomKitComponentsBuilder`: duplicati di `/clothing`. Non si
migrano.

## 4. Filtri, ricerca, ordinamento, viste

**Nessuno** sui piani, sui metodi, sugli sconti. L'unica ricerca in pagina
(**"Cerca atleti..."**, `searchQuery`) e nella scheda kit irraggiungibile.
Ordine di visualizzazione: quello della colonna JSON. Nel dettaglio di un
programma: **"Cerca per cognome o codice voucher"** + Select stato (wave-c
§D.4).

## 5. Azioni di massa e selezione

Nessuna.

## 6. Esportazioni e importazioni

Nessuna sulla pagina. (La riconciliazione dei bandi ha il suo CSV altrove.)

## 7. Permessi, con la chiave esatta

- **Rotta**: `/registration-management` e in `MANAGEMENT_PATH_PREFIXES`
  (`src/lib/access-roles.ts:317`) e nel prefisso «richiede sessione» di
  `src/middleware.ts:91`; **non** e in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`.
  `canAccessPath`: owner, club_manager, collaborator, staff (e i ruoli
  personalizzati su quelle basi) entrano; trainer, parent, athlete no
  (`tests/auth/route-guards.test.mjs`).
- **Dati della pagina**: piani, sconti, metodi manuali e impostazioni
  passano **tutti** dalla risorsa `clubs`
  (`readClubFields`/`writeClubFields` → `/api/v1/clubs`), che e in
  `MANAGEMENT_ADMIN_ONLY_RESOURCES`: la leggono e scrivono **solo
  proprietario e gestore canonici**; un ruolo personalizzato, anche costruito
  su `club_manager`, riceve 403. Nella V1 la pagina **non valuta nessun
  predicato**: `getClubData` inghiotte il 403 e restituisce `[]`, quindi
  segreteria e collaboratore vedono «Nessun piano configurato» e ogni
  salvataggio fallisce con il toast generico. E lo stesso difetto che la
  migrazione di `/movements` ha chiuso (W3-14). Il predicato client che
  coincide con quel perimetro esiste gia ed e quello che la pagina usa per i
  contributi: **`canManageClubConfigurationAsActor(activeClub?.role)`**
  (`!isCustomRoleValue(role) && (owner || club_manager)`).
- **Contributi**: lettura via `accounting.read` (i bandi si leggono con il
  gettone di `payments`); scrittura **`funding.manage`**
  (`hasFundingPermission`, delegabile ai ruoli personalizzati costruiti su
  owner/club_manager); liquidazione `funding.manage` + `accounting.manage`;
  storno `accounting.reverse`. `FundingProgramsPanel` calcola `canManage` con
  `canManageClubConfigurationAsActor(readStoredActiveClub()?.role)` e lo passa
  a `FundingProgramDetail`, che pero preferisce i flag dichiarati dal server.
  Il pulsante **"Nuovo programma"** e mostrato a tutti (il server risponde
  403).
- Voci legacy del catalogo: `payment_plans: { keys: ["accounting.read"] }`,
  `discounts: { keys: ["accounting.read"] }` (`src/lib/permissions/catalog.ts`)
  — descrivono le risorse generiche, non la colonna `clubs` da cui questa
  pagina legge.

## 8. Stati, con il testo

- Caricamento: `loading` e impostato ma **nessuna** schermata lo mostra (la
  pagina rende subito i vuoti).
- Errore di caricamento globale: toast **"Errore nel caricamento dei dati"**
  (solo se fallisce tutto; ogni singola lettura ha il suo `catch` che
  azzera in silenzio).
- Vuoti: §1.1–1.4.
- Piano/metodo/sconto: **"Attivo"** / **"Disattivato"**.
- Provider online: **"Abilitato"/"Disabilitato"**, `paymentStatusLabel`,
  **"Predisposto"**, **"Disponibile"/"Non disponibile"**.
- Programmi: **"BOZZA"/"ATTIVO"/"CHIUSO"**; **"Lettura dei programmi..."**.

## 9. Flussi distruttivi

Tre cancellazioni **dure** di configurazione, tutte con `confirm()` del
browser: piano, metodo manuale, sconto. Nessuna tocca denaro: cancellare un
piano non tocca `payments` (le rate gia generate restano) ne
`athletes.data.selectedPlanId` (che smette di risolversi con
`findPaymentPlan`); cancellare uno sconto lascia `athletes.data.discount` e
`applicableDiscountIds` degli altri piani con un riferimento non risolto;
cancellare un metodo lo toglie dalle scelte di **"Metodo di pagamento"** in
«Registra pagamento» (`getClubPaymentMethodChoices`) ma non dalle transazioni
gia registrate, che conservano l'etichetta. «Niente DELETE: si storna» qui
**non** si applica: non sono movimenti. Nel dominio voucher le regole di
storno/revoca sono quelle di wave-c §D.8, dentro i componenti condivisi.

## 10. Navigazione e parametri

- Nessun parametro letto: ne `?tab=`, ne `?action=`, ne `?athleteId=`. La
  scheda attiva **non sopravvive** al reload.
- In uscita: **"Apri Pagamenti"** → `/organization?tab=pagamenti` con
  `window.location.href` (ricarica); la scheda kit (irraggiungibile) apriva
  `/athletes/{id}?clubId=…&tab=clothing`.
- La barra mobile (`MobileTopBar.tsx`, `mobile-header.tsx`) e la navigazione
  V2 puntano a `/registration-management`.

## 11. Schede e sezioni

Piani di Pagamento · Metodi di Pagamento (due sezioni: provider online in
sola lettura, metodi manuali) · Sconti e Promozioni · Voucher e Contributi
(elenco ↔ scheda programma, in stato locale). Piu la scheda kit senza
trigger.

## 12. Test collegati

| Test | Cosa vincola |
|---|---|
| `tests/auth/route-guards.test.mjs` | `/registration-management` area di gestione: trainer/parent/athlete fuori |
| `tests/lib/payment-proration.test.mjs` («il modulo del piano dice quale periodo verra usato») | il sorgente del modulo piano contiene `fallbackPeriod: seasonPeriod` e «periodo della stagione attiva» |
| `tests/ui/funding-flow.test.mjs` («i contributi sono montati nella scheda atleta e in Gestione iscrizioni») | la pagina contiene `<FundingProgramsPanel` |
| `tests/ui/responsive-invariants.test.mjs` («le barre di schede non escono dallo schermo stretto») | la pagina ha `<TabsList className="mb-4 w-full justify-start overflow-x-auto` — da ripuntare al pattern V2 |
| `tests/web/shell-navigation.test.mjs` | la voce «Iscrizioni» porta qui |
| `tests/ui/copertura-voucher-superficie.test.mjs`, `tests/ui/iscrizione-voucher-superficie.test.mjs`, `tests/ui/liquidazione-voucher-superficie.test.mjs`, `tests/lib/voucher-periodi-visibili.test.mjs`, `tests/server/bando-stato-governa.test.mjs`, `tests/lib/sorting.test.mjs` | i componenti `funding/**` condivisi: non si toccano |
| `tests/lib/person-export.test.mjs` | in tutto `src/` una sola `CLOTHING_SIZE_OPTIONS` (la copia appiattita della V1 era stata gia tolta) |

## 13. Inventario componenti

**Della pagina (V1, da sostituire):** tutto inline in `page.tsx` — quattro
dialoghi (`Dialog` shadcn), card di elenco, tabella provider, helper
`calculateAgeFromBirthDate`, `deriveClothingProfile`,
`buildBuilderComponents`, `getAthleteCategoryLabel`, `createPlanService`,
`createPlanInstallment`, `createPlanProrationSettings`,
`createEmptyPaymentPlanForm`, `formatPlanCurrency`,
`resolveAthleteDefaultSize`, `buildAthleteAssignmentComponents` (gli ultimi
due e i primi tre solo per i kit).

**Condivisi (si compongono, non si riscrivono):**
`src/components/funding/FundingProgramsPanel.tsx` (+ `FundingProgramDetail`,
`EnrollAthletesDialog`, `FundingPeriodsTable`, `ConfirmAccrualDialog`,
`SettleAccrualDialog`), `src/components/forms/CustomKitComponentsBuilder.tsx`
(usato anche dalla scheda atleta; qui solo dalla scheda morta).

**Dominio puro:** `src/lib/payment-plan-utils.ts`
(`PAYMENT_PLAN_SERVICE_TYPES`, `calculatePlanTotal`, `calculateProratedTotal`,
`generateInstallmentPreview`, `normalizePaymentPlan`),
`src/lib/payments/payment-config-utils.ts`, `src/lib/payments/provider-registry.ts`,
`src/lib/club-seasons.ts` (`normalizeClubSeasons`), `src/lib/date-only.ts`
(`todayLocalDateOnly`), `src/lib/funding/**`.

**Dati:** `src/lib/simplified-db.ts` (sei funzioni, §2).

### Cosa non c'e, e va detto prima di migrare

1. **Nessun elenco di iscrizioni per atleta** su questa rotta (vedi il
   riquadro in testa). La griglia «Iscrizioni» con stato `ENROLMENT_STATUS`,
   dovuto/incassato/residuo, prossima rata, «Completa iscrizione», «Invia
   promemoria», «Rinnova» richiederebbe un servizio server che oggi non
   esiste e stati che il modello non ha. Non si ricostruisce col sistema
   perche non e una capacita esistente: e un WP nuovo (per il lead).
2. **Nessun controllo di stagione**: la stagione attiva governa piani e
   sconti (`SEASON_SCOPED_DATA_TYPES`) e si cambia in Impostazioni ›
   Stagioni. La pagina puo **dirlo**, non cambiarla.
3. **`active` del piano senza controllo** nel modulo (solo nel record).
4. **Nessuna azione «Attiva/Disattiva»** su piani, metodi e sconti: si passa
   dal modulo (sconti e metodi) o non si passa affatto (piani).
5. **`loading` mai mostrato.**
6. **La scheda kit** e codice morto: si rimuove, con i quattro caricamenti che
   servono solo a lei (`athletes`, `categories`, `clothing_kits`,
   `kit_assignments`).
