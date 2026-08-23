# 20 — Work Package

Unita di lavoro pensate per essere prese **una per volta**, anche da agenti
diversi in parallelo. Ogni WP indica esplicitamente i file che tocca, cosi due
agenti possono lavorare insieme senza collidere.

**Stati:** `DONE` · `READY` (dipendenze soddisfatte) · `BLOCKED` (attende un WP
o una decisione) · `DEFERRED` (sospeso per decisione, vedi l'ADR citato) ·
`NEEDS DECISION` (attende approvazione, vedi
[19 — Roadmap](19-roadmap.md#decisioni-che-richiedono-approvazione-del-proprietario-del-prodotto))

**Regole comuni a tutti i WP** (non ripetute in ogni scheda):

- gate obbligatori: `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run build`;
- nessun refactoring fuori scope;
- aggiornamento della KB nello stesso commit;
- nessuna operazione di scrittura sul database senza autorizzazione.

---

## Fase F1 — Fondamenta

### WP-01 · Cleanup repository e Knowledge Base — `DONE`

**Obiettivo.** Rimuovere il materiale dimostrabilmente inutile e pubblicare la
KB come fonte di verita.

**Scope.** `.codex-tmp/` (416 file duplicati), screenshot di debug, 2.938 righe
di codice commentato, 2.868 righe di codice irraggiungibile, catena di codice
morto, `docs/knowledge-base/`, `CLAUDE.md`, `AGENTS.md`.

**Dipendenze.** Nessuna.

**Acceptance criteria.**
- [x] Nessun file eliminato risulta referenziato
- [x] Set di route del build identico alla baseline (116)
- [x] `tsc --allowUnreachableCode false` senza segnalazioni
- [x] KB con 21 documenti + report di cleanup

**Test.** Gate completi + confronto route pre/post. Tutti verdi.

---

### WP-02 · Continuous Integration — `DONE` (2026-08-22)

**Obiettivo.** Automatizzare i gate su ogni push e pull request.

**Scope.**
- rimuovere `.github/` da `.gitignore` (oggi impedisce di committare workflow);
- `.github/workflows/ci.yml`: Node 22, `npm ci`, `npm run typecheck`,
  `npm run lint`, `npm test`, `npm run build`;
- job separato per `easygamemobile`: `npm ci && npm run check:types && npm run lint`;
- **niente segreti nel workflow**: il build deve funzionare senza database
  (verificare che `next build` non richieda `DATABASE_URL` a build time, o
  fornirne uno fittizio).

**Dipendenze.** WP-01.

**Acceptance criteria.**
- [x] Job web, mobile e guardrail separati
- [x] Il build non richiede accesso a Neon (DATABASE_URL fittizia verificata)
- [x] I quattro guardrail eseguiti localmente sull'albero corrente: verdi
- [ ] Primo run su GitHub Actions da osservare al push

**File.** `.gitignore`, `.github/workflows/*`.

---

### WP-03 · Guardie di route uniformi — `DONE` (2026-08-22)

**Obiettivo.** Eliminare la disparita per cui solo 4 aree su ~45 hanno un guard.

**Scope.** Due opzioni, scegliere **una** e documentarla come ADR:
1. estendere `AccessAreaGuard` a tutte le aree management tramite layout
   intermedi;
2. introdurre `src/middleware.ts` che valida il cookie di sessione e reindirizza
   a `/login` prima del rendering.

Non cambiare la matrice permessi: `canAccessPath` resta la fonte.

**Dipendenze.** WP-01.

**Scelta adottata.** Entrambe: `middleware.ts` come cancello di
autenticazione edge **e** `AccessAreaGuard` esteso a tutte le aree tramite
`management-area-layout`. Il middleware non puo applicare i ruoli (niente
Prisma su edge), il guard client non puo evitare il caricamento della pagina:
servono tutti e due.

**Acceptance criteria.**
- [x] Un trainer che apre `/payments` viene rediretto, non vede la shell
- [x] Un utente non autenticato che apre una pagina management va a `/login`
- [x] Nessuna regressione sulle 4 aree gia protette (route del build invariate)
- [x] 14 test nuovi in `route-guards` e `api-authorization`

**File.** `src/middleware.ts` **oppure** `src/app/**/layout.tsx`,
`src/components/auth/access-area-guard.tsx`.

---

### WP-04 · Fondamenta di test e copertura API — `DONE` (2026-08-22)

**Obiettivo.** Poter testare i route handler, a partire dall'isolamento
multi-tenant.

**Scope.**
- rinominare `test:auth` in `test:unit` e passare alla discovery automatica
  (`--test tests/**/*.test.mjs`) mantenendo `npm test` come alias;
- introdurre test su `src/lib/server/resources.ts` con un Prisma client
  simulato: verificare che `listResource` imponga sempre `organization_id` e
  che `ensureOrganizationAccess` rifiuti un club non consentito;
- test su `resolveOrganizationScopeForUser` (ownership implicita, ruolo
  preferito inesistente → `activeRole = null`).

**Dipendenze.** WP-01.

**Acceptance criteria.**
- [x] Un test fallisce se si rimuove il filtro `organization_id` da
      `listResource` — **ne falliscono 8**; disattivando
      `ensureOrganizationAccess` ne falliscono 11
- [x] Un nuovo file in `tests/` viene eseguito senza modificare `package.json`
- [x] Almeno 15 test nuovi — **da 30 a 97**
- [x] `resources.ts` importabile e Prisma iniettabile ([ADR-0023](18-decision-log.md))

**File.** `package.json`, `tests/server/**`, [15](15-testing.md).

---

### WP-05 · Validazione input con zod — `READY`

**Obiettivo.** Sostituire le coercizioni manuali con schemi dichiarativi.

**Scope.** Introdurre `src/lib/validation/` con schemi riusabili; applicarli
prima a `/api/v1/auth/*` e `/api/v1/admin/*`; poi al CRUD generico, uno
schema per risorsa dove ha senso. Gli errori di validazione devono restare
nell'envelope `{ data: null, error: { message, code: "VALIDATION_ERROR" } }`.

**Dipendenze.** WP-04 (per avere test su cui appoggiarsi).

**Acceptance criteria.**
- [ ] Nessun cambiamento nei messaggi visibili all'utente per input validi
- [ ] Un body malformato produce 400 con `code: "VALIDATION_ERROR"`
- [ ] Test per almeno 5 endpoint

**File.** `src/lib/validation/**`, `src/app/api/v1/**/route.ts`,
[09](09-api-conventions.md).

---

### WP-06 · Rimuovere Drizzle e lo scaffold Express dal mobile — `DONE` (2026-08-22)

**Obiettivo.** Eliminare il rischio che `db:push` alteri la tabella `users`
reale.

**Scope.** Rimuovere `easygamemobile/shared/schema.ts`,
`drizzle.config.ts`, `server/`, `.replit`, gli script `db:push`,
`server:dev`, `server:build`, `server:prod`, e le dipendenze `drizzle-orm`,
`drizzle-zod`, `drizzle-kit`, `express`, `@types/express`, `pg`, `ws`,
`http-proxy-middleware`, `tsx`.

**Dipendenze.** Nessuna (ADR-0018).

**Acceptance criteria.**
- [x] `easygamemobile` non contiene piu riferimenti a `DATABASE_URL`
      (verificato anche dalla CI)
- [x] `check:types` OK e `lint` esce 0
- [ ] Avvio Expo e login su dispositivo: da verificare manualmente

**Test.** Typecheck + lint mobile, avvio Expo manuale.

**File.** solo `easygamemobile/**`. [05](05-mobile-architecture.md),
[14](14-security.md).

---

### WP-09 · Database di sviluppo separato — `DONE` (2026-08-22)

**Obiettivo.** Impedire che un comando locale modifichi staging.

**Scope.** Creare un branch Neon `dev`; aggiornare `.env.example`,
`README_LOCAL.md`, `docs/testing-and-deploy.md`; aggiungere a
`scripts/start-local.mjs` un avviso quando `DATABASE_URL` coincide con
l'endpoint di staging.

**Dipendenze.** ADR-0012. La creazione del branch Neon richiede la console Neon.

**Acceptance criteria.**
- [x] `prisma migrate dev` in locale non tocca staging: il `.env` punta al
      database Docker, e `db-guard` blocca comunque i target condivisi
- [x] `npm run local` avvisa se il target non e un database di sviluppo
- [x] Documentazione aggiornata (`.env.example`, `README_LOCAL.md`,
      [13](13-environments.md))
- [ ] Branch Neon `development`: **richiede la console Neon**, vedi
      [ADR-0024](18-decision-log.md)

**File.** `.env.example`, `scripts/start-local.mjs`, `README_LOCAL.md`,
[13](13-environments.md).

---

## Fase F2 — Stabilizzazione Web V1

### WP-07 · Estrarre la logica di dominio verso il server — `BLOCKED (WP-04)`

**Obiettivo.** Spostare le regole di business da `simplified-db.ts` a
`src/lib/server/`, un dominio alla volta.

**Scope.** Iterativo, **un dominio per commit**. Ordine suggerito per valore e
rischio: pagamenti/fatture → certificati medici → allenamenti/presenze →
categorie/atleti. Per ogni dominio: estrarre le funzioni pure, spostarle in
`src/lib/server/<dominio>.ts`, esporre un endpoint dedicato, far chiamare
quello al client, coprire con test.

**Dipendenze.** WP-04.

**Acceptance criteria (per dominio).**
- [ ] Le regole sono applicate anche chiamando l'API direttamente
- [ ] `simplified-db.ts` si riduce
- [ ] Nessun cambiamento visibile nell'interfaccia
- [ ] Test sulla logica estratta

**File.** `src/lib/simplified-db.ts`, `src/lib/server/**`,
`src/app/api/v1/**`. [16](16-technical-debt.md) D1.

---

### WP-08 · Rimuovere `.babelrc` e riabilitare SWC — `DONE` (2026-08-22)

**Obiettivo.** Tornare alla toolchain nativa di Next.

**Scope.** Rimuovere `.babelrc`, `babel.config.js`, la dipendenza
`@babel/runtime`, e `tempo.config.json` se nulla lo legge. Verificare che
`swcMinify` abbia effetto.

**Dipendenze.** ADR-0017.

**Acceptance criteria.**
- [x] `npm run build` completa con lo stesso set di route (120)
- [x] Tempo di build migliorato: 161 s -> 62 s; bundle condiviso ridotto
- [x] Smoke test su staging dopo il deploy

**File.** `.babelrc`, `babel.config.js`, `package.json`, `tempo.config.json`.

---

### WP-10 · Rendere transazionale la sincronizzazione delle risorse club — `DONE` (2026-08-22)

**Obiettivo.** Eliminare il percorso distruttivo non transazionale
`syncClubResourceItemsFromField`.

**Scope.**
- avvolgere delete + insert + `syncClubAggregateField` in
  `prisma.$transaction`;
- sostituire delete-and-recreate con un upsert per `id` che **preserva
  l'identita** degli elementi esistenti;
- valutare di rifiutare la scrittura diretta dei campi JSON su
  `PATCH /api/v1/clubs/:id`, obbligando a passare dagli endpoint risorsa.

**Dipendenze.** WP-04 (servono test prima di toccare questo codice).

**Acceptance criteria.**
- [x] Un errore a meta sincronizzazione non lascia dati parziali
- [x] Gli `id` degli elementi esistenti non cambiano dopo un PATCH del club
- [x] Test che simula il fallimento a meta

**Nota.** La terza voce di scope — rifiutare la scrittura diretta dei campi JSON
su `PATCH /api/v1/clubs/:id` — **non** e stata fatta: e un cambio di contratto
che tocca decine di chiamanti client. Resta in WP-07.

**Test.** `tests/server/web-v1-regressions.test.mjs`.

**File.** `src/lib/server/resources.ts`, [06](06-data-model.md).

---

### WP-11 · Filtro stagione lato server — `DONE` (2026-08-22)

**Obiettivo.** Far rispettare `x-active-season-id` al server, che oggi lo ignora.

**Scope.** Leggere l'header in `listResource`, filtrare le risorse che portano
un riferimento di stagione, mantenendo il comportamento attuale quando l'header
e assente.

**Dipendenze.** Nessuna: si e rivelato indipendente da WP-05, perche l'header
non entra nel corpo della richiesta e non richiede validazione con `zod`.

**Acceptance criteria.**
- [x] Con header stagione impostato, la risposta non contiene record di altre
      stagioni
- [x] Senza header il comportamento e invariato
- [x] Il filtro client diventa ridondante ma non rompe nulla

**In piu rispetto allo scope.** Il server **stampa** anche la stagione attiva
sulle risorse create o aggiornate, e i record senza `seasonId` sono attribuiti
alla stagione baseline. Senza queste due regole il filtro avrebbe fatto sparire
tutti i dati storici. Vedi WP-32.

**Test.** `tests/server/web-v1-regressions.test.mjs`, `tests/lib/club-seasons.test.mjs`.

**File.** `src/lib/server/resources.ts`, `src/lib/club-seasons.ts`,
[09](09-api-conventions.md).

---

### WP-12 · Paginazione, ordinamento e filtri — `BLOCKED (WP-05)`

**Obiettivo.** Rendere sostenibili le liste dei club grandi.

**Scope.** Aggiungere `limit`, `offset`/`cursor`, `order_by`, `order_dir` al
CRUD generico, con default retrocompatibile (nessun parametro = comportamento
attuale). Aggiornare il client per usarli sulle liste piu grandi (atleti,
pagamenti, movimenti).

**Dipendenze.** WP-05.

**Acceptance criteria.**
- [ ] Chiamate esistenti senza parametri restituiscono lo stesso risultato
- [ ] `limit` e `offset` funzionano su modelli e su `club_resource_items`
- [ ] Test dedicati

**File.** `src/lib/server/resources.ts`, `src/lib/api/client.ts`,
[09](09-api-conventions.md).

---

## Fase F2 — Web V1: difetti che colpiscono l'uso quotidiano

Aperti da [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive).

### WP-31 · Performance delle liste grandi — `DONE` (2026-08-22)

**Obiettivo.** Riportare la pagina Atleti di un club con 200+ atleti a un
caricamento di pochi secondi, senza introdurre cache incoerenti.

**Cause radice individuate.**

1. Ogni `select` dell'adapter `src/lib/supabase.ts` faceva **due** richieste:
   quella filtrata e uno *snapshot* dell'intera tabella **senza alcun filtro**,
   costruito anche quando la select non aveva relazioni da idratare.
2. `GET /api/v1/simplified_athletes` restituisce il `data` JSON completo di
   ogni atleta. Gli allegati (documenti identita, documenti iscrizione,
   certificati) sono salvati come **data URL base64 dentro quel JSON**: la
   lista di 200 atleti trasferisce decine di MB per mostrare nome, categoria e
   scadenza certificato.
3. `syncClubResourceItemsFromField` cancellava e ricreava **tutti** gli
   elementi di un tipo con una `create` per riga, fuori da una transazione: il
   salvataggio di una categoria ricreava l'intero insieme (vedi WP-10).

**Scope.** Snapshot solo quando servono relazioni; proiezione `view=summary`
per le liste atleti; sincronizzazione risorse club transazionale e in blocco.
**Fuori scope:** paginazione (WP-12) e spostamento dei file fuori dal database
(WP-15), che restano la soluzione strutturale.

**Acceptance criteria.**
- [x] Una `select` senza relazioni fa una sola richiesta HTTP
- [x] La lista atleti non trasporta allegati base64
- [x] Il dettaglio atleta continua a ricevere il `data` completo
- [x] Test di regressione su entrambe

**Misura.** Club sintetico con 200 atleti, allegati come data URL base64,
sulle funzioni vere di `resources.ts`:

| Grandezza | Prima | Dopo |
|-----------|-------|------|
| Payload della lista Atleti | 24,99 MB | 1,99 MB (−92%, 13x) |
| Richieste HTTP per caricamento | 6 | 3 |
| Righe restituite | 200 | 200 |

I ~2 MB residui sono quasi tutti **avatar base64**: restano perche la lista li
mostra. Toglierli richiede object storage (WP-15).

**Non misurato.** Il tempo di caricamento end-to-end su un club reale con
200+ atleti: in locale non esiste un dataset di quella taglia e crearlo
richiede un'autorizzazione a scrivere sul database (sezione 8 di `CLAUDE.md`).

**File.** `src/lib/supabase.ts`, `src/lib/server/resources.ts`,
`src/lib/simplified-db.ts`, `src/app/athletes/page.tsx`,
[09](09-api-conventions.md).

---

### WP-32 · Stagioni e consistenza dei dati club — `DONE` (2026-08-22)

**Obiettivo.** Cambiando stagione devono cambiare davvero i dati pertinenti, e
le stagioni devono restare separate.

**Cause radice individuate.**

1. Il filtro stagione era **solo client-side** e applicato dal solo
   `getClubData`. Le risorse lette da `club_resource_items` — categorie in
   testa — non erano filtrate affatto: cambiare stagione non cambiava nulla.
2. `filterCollectionBySeason` scartava i record **senza `seasonId`**: i dati
   creati prima dell'introduzione delle stagioni sparivano. Da qui la toppa
   `getClubDirectCollectionWithLegacySeasonFallback`, applicata solo a
   `trainings` e `weekly_schedule`, che pero li rendeva visibili in *tutte* le
   stagioni.
3. Gli allenatori eliminati ricomparivano perche `handleDelete` in
   `src/app/trainers/page.tsx` **non persisteva nulla**: filtrava solo lo stato
   React locale.
4. `updateClubDataItem` leggeva `clubData.settings` senza averlo selezionato.

**Decisione applicata.** I record senza `seasonId` appartengono alla **stagione
piu vecchia** del club (la baseline), non a tutte e non a nessuna. Il filtro
diventa server-side su `x-active-season-id` (chiude WP-11) e la scrittura
stampa la stagione attiva.

**Acceptance criteria.**
- [x] Con `x-active-season-id` la risposta non contiene risorse di altre stagioni
- [x] Senza header il comportamento e invariato
- [x] I record legacy senza stagione restano visibili nella stagione baseline
- [x] Eliminare un allenatore lo elimina davvero, in tutte e tre le origini
- [x] Categorie con **un solo anno di nascita**: il secondo anno e opzionale
- [x] Test di regressione

**File.** `src/lib/club-seasons.ts`, `src/lib/server/resources.ts`,
`src/lib/category-utils.ts`, `src/lib/simplified-db.ts`,
`src/app/trainers/page.tsx`, `src/app/categories/page.tsx`,
`src/components/forms/CategoryEditorDialog.tsx`,
`src/components/forms/AddCategoryForm.tsx`.

---

### WP-33 · Correttezza del dominio pagamenti — `DONE` (2026-08-22)

**Obiettivo.** Rendere coerenti piano, rate, incassi e riepiloghi.

**Cause radice individuate.**

1. **Riepilogo Incasso sempre «In attesa»**: in
   `src/components/payments/EnrollmentPaymentBreakdown.tsx` il badge di ogni
   rata era **una costante scritta nel markup**, mai derivata dai pagamenti
   registrati.
2. **Servizi opzionali non inclusi nelle rate**:
   `getSelectedOptionalServiceIdsFromAthlete` sceglieva il **primo** candidato
   che fosse un array. La scheda atleta valorizza sempre
   `selectedOptionalServiceIds`, anche a `[]`: un array vuoto vinceva su
   `enrollmentPaymentConfig.selectedOptionalServiceIds`, che invece contiene la
   selezione confermata.
3. **Pro-rata sempre «Non applicato»**: `normalizeProrationSettings` accettava
   `enabled: true` con un `method` non riconosciuto e lo degradava a `none`
   silenziosamente, senza spiegare perche.
4. **Metodo di pagamento a testo libero** nella dialog «Modifica pagamento».

**Acceptance criteria.**
- [x] Una rata coperta da un pagamento saldato non e piu «In attesa»
- [x] I servizi opzionali selezionati entrano nel totale e nelle rate
- [x] Il pro-rata configurato correttamente risulta applicato; quando non lo e,
      la UI dice quale dato manca
- [x] Il metodo di pagamento e una selezione strutturata dai metodi del club
- [x] Test di regressione su ciascun punto

**File.** `src/lib/payment-plan-utils.ts`, `src/lib/athlete-payment-utils.ts`,
`src/components/payments/EnrollmentPaymentBreakdown.tsx`,
`src/app/athletes/[id]/page.tsx`.

---

### WP-36 · Costo delle scritture e autosave — `DONE` (2026-08-22)

**Obiettivo.** Nessuna operazione interattiva deve trasferire la riga intera
del club, e l'autosave non deve generare chiamate eccessive.

**Cause radice individuate.**

1. Ogni lettura del club restituiva **tutte** le 35 colonne JSON, anche
   quando il chiamante ne modificava una sola.
2. Anche la **risposta** di ogni PATCH era la riga intera, e nessuno dei
   chiamanti la usava: tutti restituiscono lo stato che hanno gia calcolato.
3. L'adapter rileggeva il record prima di scriverlo anche quando il filtro
   era gia `eq("id", …)`, cioe quando il bersaglio era noto.
4. `updateClubData` scaricava il club solo per leggere `settings` e
   risolvere la stagione attiva, che il browser conosce gia.
5. L'autosave del programma settimanale aveva debounce e deduplicazione, ma
   **nessun accorpamento**: continuando a modificare durante un salvataggio
   partivano PATCH sovrapposte, con ordine di arrivo non garantito.
6. `addClubData` scriveva nel log l'intera collezione a ogni salvataggio.

**Scope.** Parametro `fields` per `clubs`/`organizations` in lettura e sulla
risposta delle scritture; `readClubFields` / `writeClubFields` in
`simplified-db.ts`; scorciatoia dell'adapter quando il filtro e solo `id`;
stagione attiva letta da `readStoredActiveClub`; `createCoalescingSaver` in
`performance.ts`, adottato dal pannello del programma settimanale.

**Misura** (club sintetico da 479 KB su 35 colonne JSON):

| Operazione | Prima | Dopo |
|-----------|-------|------|
| Autosave programma settimanale | 5 richieste, 1.915 KB | **1 richiesta, 16 KB** |
| Creazione categoria | 5 richieste, 1.915 KB | **2 richieste, 20 KB** |
| Modifica categoria | 5 richieste, 1.915 KB | **2 richieste, 20 KB** |
| Eliminazione elemento | 4 richieste, 1.436 KB | **2 richieste, 19 KB** |
| Eliminazione allenatore | non persisteva | **2 richieste, 19 KB** |
| Lettura collezione club | 2 richieste, 957 KB | **1 richiesta, 10 KB** |

I 16 KB dell'autosave sono il programma che si sta salvando: e il minimo
trasferibile.

**Latenza lato server.** Tre coppie di letture indipendenti passano da
sequenziali a parallele: `resolveOrganizationScopeForUser` (su **ogni**
richiesta autenticata), `GET /api/v1/auth/memberships` (su ogni caricamento
di pagina) e la risoluzione della stagione dentro `listResource`. Tolgono un
round trip a Neon ciascuna.

**Acceptance criteria.**
- [x] Nessuna operazione interattiva trasferisce colonne che non usa
- [x] L'autosave scrive una volta alla volta e accorpa le modifiche in attesa
- [x] Uno stato identico all'ultimo salvato non produce scrittura
- [x] Senza `fields` il comportamento e invariato
- [x] Test di regressione su richieste, proiezione e accorpamento

**File.** `src/lib/server/resources.ts`, `src/app/api/v1/[resource]/[id]/route.ts`,
`src/lib/simplified-db.ts`, `src/lib/supabase.ts`, `src/lib/api/client.ts`,
`src/lib/performance.ts`, `src/lib/server/auth.ts`,
`src/app/api/v1/auth/memberships/route.ts`,
`src/components/dashboard/WeeklyTrainingSchedulePanel.tsx`.

---

### WP-34 · Responsivita verificata del Web — `PARZIALE` (2026-08-23)

**Obiettivo.** Rendere ogni area del Web usabile da desktop, tablet e
smartphone, con una verifica ripetibile invece che a campione.

**Fatto (Blocco 3).** Corretti i difetti **sistemici**, cioe quelli che
vivono nei componenti condivisi e quindi valgono per tutte le pagine:

- `DialogContent` e `AlertDialogContent` non avevano ne altezza massima ne
  scorrimento: una dialog piu alta dello schermo — scheda atleta, conferma
  piano, editor categoria — usciva dal viewport e i pulsanti in fondo erano
  **irraggiungibili** su telefono;
- i comandi delle schermate di accesso misuravano 28-36 px, sotto la soglia
  dei 44 px per un bersaglio da dito;
- la topbar mobile ripeteva "EasyGame" e non diceva in che club e in che
  stagione ci si trovava.

**Verifica.** A 375, 768 e 1280 px, sul banco che monta la chrome reale
(sidebar, topbar, tabella larga, dialog alta) e sulle pagine pubbliche:
scroll orizzontale del documento **0 px**, nessun elemento fuori contenitore,
dialog interamente dentro il viewport a tutti e tre i breakpoint.

**Resta aperto.** Le pagine gestionali non sono verificabili senza una
sessione autenticata: la verifica pagina per pagina di scheda atleta,
pagamenti, categorie, allenatori e gestione club va fatta a mano in staging.

**Acceptance criteria.**
- [x] Nessuna pagina verificata produce scroll orizzontale del documento a 375 px
- [x] Le dialog restano interamente raggiungibili a 375 px
- [x] La regola e in [10 — UI/UX](10-ui-ux-conventions.md)
- [ ] Verifica pagina per pagina delle aree gestionali (richiede sessione)

**Avanzamento (Blocco 4).** Home account, onboarding, dialog di import e
sezione «Provider email» della console sono state scritte con una sola
struttura che si riorganizza ai breakpoint, invece del doppio markup
`hidden lg:flex` / `lg:hidden`. Restano da verificare a mano in staging le
pagine gestionali dense: scheda atleta, pagamenti, categorie, allenatori.

**File.** `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`,
`src/app/globals.css`, `src/components/layout/MobileTopBar.tsx`,
[10](10-ui-ux-conventions.md).

---

### WP-37 · Identita visiva, topbar e console di piattaforma — `DONE` (2026-08-23)

**Obiettivo.** Dare una voce sola alle superfici applicative e separare il
mestiere di piattaforma da quello di club.

**Cause radice individuate.**

1. Il marchio era un **PNG su CDN esterno** (`r2.fivemanage.com`), sgranato
   appena superava la dimensione nativa, piu tre riferimenti a `/logo.png`,
   `/logo-blu.png` e `logo-bianco.png`: due file **inesistenti in `public/`**,
   cioe immagini rotte in produzione.
2. Nessun font dichiarato: l'applicazione usava lo stack di sistema, diverso
   su ogni macchina.
3. La topbar del club portava chat (senza backend), azioni rapide (duplicato
   della sidebar) e assistenza (link a un sito esterno), tutte con lo stesso
   peso visivo dei comandi reali.
4. La dashboard `platform_admin` montava **sidebar e topbar del club**: un
   amministratore di piattaforma vedeva "Atleti", "Allenamenti" e la stagione
   di un club a cui non appartiene.
5. `AppLoadingScreen` animava cerchi pulsanti, puntini rimbalzanti e due
   gradienti radiali senza dire cosa stesse succedendo.
6. L'indicatore dell'autosave diceva "Salvato automaticamente" anche prima di
   aver salvato, e non distingueva un errore da un successo.
7. La barra Atleti allineava sei pulsanti a etichetta piena: su telefono
   occupava due schermate e nessuna azione risultava principale.

**Scope.** Marchio SVG in repo; `Inter` + `Archivo` self-hosted con
`next/font`; token di brand e `.eg-tabular` per i dati; `ClubIdentity` e
`SeasonPlate`; topbar club e mobile riscritte; `PlatformAdminShell` con
sezioni proprie; `AppLoadingScreen` + `ListSkeleton` + `CardsSkeleton`;
`SaveStatus` a quattro stati; barra Atleti compattata.

**Acceptance criteria.**
- [x] Nessun riferimento a host esterni o a PNG inesistenti
- [x] Topbar club senza chat, azioni rapide e assistenza
      — **rettificato da WP-45**: la rimozione valeva per la sola console
      `platform_admin`. Azioni rapide e assistenza sono tornate sulla topbar
      del club; la chat resta fuori
- [x] Club e stagione visibili su desktop **e** su telefono
- [x] La console di piattaforma non monta la chrome del club
- [x] Attese e salvataggi hanno una forma sola, annunciata agli screen reader
- [x] Test di conformita che impediscono la reintroduzione dei difetti

**File.** `src/components/brand/**`, `src/components/platform-admin/**`,
`src/components/dashboard/Header.tsx`, `src/components/layout/MobileTopBar.tsx`,
`src/components/auth/**`, `src/components/ui/app-loading-screen.tsx`,
`src/components/ui/save-status.tsx`, `src/app/layout.tsx`,
`src/app/globals.css`, `tailwind.config.ts`, `next.config.js`,
[10](10-ui-ux-conventions.md).

**Test.** `tests/ui/brand-and-chrome.test.mjs`.

---

### WP-38 · Home account ridisegnata — `DONE` (2026-08-23)

**Obiettivo.** Portare la porta d'ingresso dell'applicazione dentro l'identita
del Blocco 3 e renderla usabile con molti accessi.

**Cause radice individuate.**

1. La pagina viveva su una **tavolozza tutta sua**, ~40 colori esadecimali
   scritti dentro le classi (`#075eee`, `#07112f`, `#5f6b84`...). Nessun altro
   schermo la usava: ogni modifica al tema non la raggiungeva.
2. Un errore di rete nel caricamento delle membership veniva mostrato come
   pannelli vuoti con scritto «Vuoi creare un nuovo club?»: a un utente con
   dieci club sembravano spariti tutti.
3. Nessun filtro: con molti accessi si scorreva a occhio. Il club aperto per
   ultimo non era riconoscibile.
4. Il caricamento era uno spinner a tutta pagina, quindi ogni ritorno alla home
   nascondeva l'interfaccia intera.
5. Due componenti (`account-club-card.tsx`, `account-empty-state.tsx`)
   rimasti orfani dalla pagina precedente: 182 righe che nessuno importava.

**Scope.** Riscrittura di `account-home-screen.tsx` con token e tipografia
condivisi; righe di club con ruolo, sede, stagione e indicatore «Aperto»;
filtro sopra le cinque voci; scheletro di caricamento; stato vuoto e stato di
errore distinti, con «Riprova» che non svuota i dati gia a schermo.

**Acceptance criteria.**
- [x] Nessun colore esadecimale nel file (verificato da test)
- [x] Caricamento, vuoto ed errore sono tre stati distinti
- [x] Un errore di aggiornamento non cancella i club gia visibili
- [x] Filtro per nome, citta e ruolo
- [x] Usabile a 375, 768 e 1280 px senza duplicare il markup
- [x] I due componenti orfani rimossi

**Test.** `tests/ui/account-onboarding-and-admin.test.mjs`.

**File.** `src/components/account/**`, [10](10-ui-ux-conventions.md).

---

### WP-39 · Onboarding del club, breve e riprendibile — `DONE` (2026-08-23)

**Obiettivo.** Dare un primo passo a chi ha appena creato un club.

**Contesto.** Dopo la creazione si arrivava direttamente alla dashboard: vuota,
senza stagione, senza categorie, senza atleti. Niente era rotto, semplicemente
non c'era un punto di partenza — e la stagione, che dal WP-32 decide quali dati
esistono, non era ancora stata creata da nessuno.

**Scope.** `/onboarding` con cinque passi (dati club, stagione, categorie,
primi atleti, mappa delle aree), stato in `clubs.settings.onboarding`
([ADR-0028](18-decision-log.md)), banner di ripresa in dashboard, ingresso
automatico dopo la creazione del club.

**Acceptance criteria.**
- [x] Saltabile in un click, da qualunque passo
- [x] Riprendibile: riparte dal primo passo non completato
- [x] Saltare non ripropone l'invito, ma non chiude il percorso
- [x] Ogni passo scrive solo su conferma; nessun autosave
- [x] Nessun passo e obbligatorio
- [x] `/onboarding` protetto da middleware **e** matrice ruoli (owner e club manager)
- [x] Uno stato salvato male non rompe la dashboard

**Test.** `tests/lib/onboarding.test.mjs` (8),
`tests/ui/account-onboarding-and-admin.test.mjs`.

**File.** `src/lib/onboarding.ts`, `src/app/onboarding/**`,
`src/components/dashboard/onboarding-resume-card.tsx`, `src/middleware.ts`,
`src/lib/access-roles.ts`.

---

### WP-40 · Anagrafica assistita: CAP, provincia e codice fiscale — `PARZIALE` (2026-08-23)

**Obiettivo.** Ridurre gli errori di trascrizione nelle anagrafiche, senza
introdurre dati inventati.

**Scope.** `src/lib/italian-registry.ts` (107 province con regione, validazione
CAP, algoritmo completo del codice fiscale con carattere di controllo);
`AssistedAddressFields` e `AssistedFiscalCodeField`; validazione server in
`src/lib/server/anagrafica.ts`, invocata da `resources.ts` su creazione e
aggiornamento.

**Fatto.**
- [x] Provincia da elenco chiuso, regione compilata solo se vuota
- [x] CAP validato, mai inventato
- [x] Codice fiscale calcolato **solo** a campo vuoto; mai sovrascritto
- [x] Codice fiscale inserito a mano verificato e, se incoerente, segnalato
- [x] Stesse regole su client e server (stesso modulo puro)
- [x] I dati gia in archivio restano modificabili (vedi [09](09-api-conventions.md))
- [x] Agganciato a scheda atleta, scheda club (sede operativa e legale,
      legale rappresentante) e dialog di creazione club

**Resta aperto.**
- [ ] Tabella dei comuni italiani: senza, «CAP → comune» non esiste e il codice
      catastale lo fornisce l'utente. Vedi D23 e
      [ADR-0027](18-decision-log.md)

**In piu rispetto allo scope.** La scheda Club non aveva un campo «Comune» per
la sede operativa: `updateClub` scriveva quindi `city: null` **a ogni
salvataggio**, azzerando il comune del club. Aggiungendo il campo il difetto si
chiude.

**Test.** `tests/lib/italian-registry.test.mjs` (11),
`tests/server/anagrafica-validation.test.mjs` (10).

---

### WP-41 · Import atleti completo e verificabile — `DONE` (2026-08-23)

**Obiettivo.** Rendere l'import un'operazione di cui ci si puo fidare.

**Cause radice individuate.**

1. **CSV**: letto da SheetJS, che indovina il separatore. Un export italiano
   con `;` finiva in una sola colonna e l'import «riusciva» scrivendo righe
   senza nome ne data.
2. **XML**: letto con `DOMParser`, che esiste solo nel browser. Nessuna parte
   di quel percorso era eseguibile dai test.
3. **Intestazioni**: i sinonimi erano scritti con underscore
   (`data_di_nascita`) e confrontati con intestazioni da cui gli underscore
   erano appena stati tolti. «Data di nascita» — l'intestazione piu comune —
   **non veniva mai riconosciuta**.
4. **Date**: il fallback era `new Date(testo)`, che legge `12/03/2010` come 3
   dicembre. Giorno e mese si scambiavano in silenzio.
5. **Avanzamento**: una tendina con un messaggio fisso. Su 200 righe non si
   sapeva se stesse procedendo.
6. **Esito**: un toast con «N riuscite, M da rivedere». Quali fossero le M, e
   perche, non lo diceva nessuno.
7. **Categorie**: create prima delle righe; se poi tutte le righe di quella
   categoria fallivano, restava una categoria vuota.

**Scope.** Parser CSV e XML propri e puri; validazione riga per riga con
duplicati (nel file e nel club), codice fiscale ed email; anteprima con esito;
barra di avanzamento alimentata dalle righe realmente scritte; riepilogo finale
con importati, scartati in anteprima ed errori in scrittura; rimozione delle
categorie create e rimaste senza atleti.

**Acceptance criteria.**
- [x] CSV con `;`, `,`, tab o `|`, BOM, virgolette e separatore dentro il campo
- [x] XML con attributi, CDATA ed entita, senza DOMParser
- [x] XLS/XLSX invariati (`xlsx`)
- [x] Mappatura colonne proposta e correggibile
- [x] Anteprima **prima** di scrivere, con il motivo di ogni scarto
- [x] Barra di avanzamento reale, non indeterminata
- [x] Riepilogo con importati / scartati / errori e l'elenco delle righe
- [x] Nessuna scrittura parziale incoerente: ogni riga e atomica, le categorie
      inutilizzate vengono rimosse
- [x] Test su ciascun punto

**Non fatto.** L'import resta **una richiesta HTTP per atleta**: su 200 righe
sono 200 richieste. Renderlo un endpoint unico transazionale e un cambio di
contratto che appartiene a WP-07.

**Test.** `tests/lib/athlete-import.test.mjs` (9).

**File.** `src/lib/athlete-import.ts`,
`src/components/forms/AthleteImportDialog.tsx`, `src/app/athletes/page.tsx`.

---

### WP-42 · Autosave per sezione nella scheda Club — `DONE` (2026-08-23)

**Obiettivo.** Ridurre la dipendenza dal pulsante «Salva» dove e sicuro farlo,
e solo li.

**Scope.** `src/lib/club-profile.ts`: classificazione delle nove sezioni,
costruzione della scrittura per sezione, `patchClubSettings`. Nella pagina:
debounce di 1 s, accorpamento con `createCoalescingSaver`, `SaveStatus`.

**Decisione.** [ADR-0026](18-decision-log.md). In autosave: Generale,
Contatti, Social. A conferma esplicita: Dati Fiscali, Dati Bancari,
Federazione, Stagioni, Pagamenti, Account e Fatturazione.

**Acceptance criteria.**
- [x] Nessun autosave su dati economici, fiscali, stagioni o rimozioni
- [x] Debounce e accorpamento: modifiche continue non generano PATCH sovrapposte
- [x] Stato `Salvataggio / Salvato / Errore` visibile
- [x] Il pulsante Salva resta dove serve, e ricompare sulle schede in autosave
      se ci sono modifiche pendenti altrove
- [x] Una sezione in autosave non puo scrivere campi di un'altra (test)

**Test.** `tests/lib/club-profile-autosave.test.mjs` (6).

**File.** `src/lib/club-profile.ts`, `src/app/organization/page.tsx`.

---

### WP-43 · Casella IMAP di piattaforma — `DONE` (2026-08-23)

**Obiettivo.** Configurare una casella IMAP accanto a SMTP, con credenziali
separate.

**Scope.** Modello `ImapProviderConfig` e migrazione
`20260823090000_imap_provider_config`; `src/lib/email/imap-config.ts`;
`imap-protocol.ts` (macchina a stati pura), `imap-client.ts` (socket),
`imap-service.ts`; `GET|PUT /api/v1/admin/imap` e
`POST /api/v1/admin/imap/test`; sezione «Provider email» della console.

**Decisione.** [ADR-0029](18-decision-log.md): tabella e contesto crittografico
separati, nessuna libreria IMAP nuova.

**Acceptance criteria.**
- [x] Host, porta, username, password cifrata, SSL/TLS o STARTTLS, abilita/disabilita
- [x] Test di connessione reale (LOGIN + LOGOUT, nessun messaggio letto)
- [x] Credenziali SMTP e IMAP separate, e **non intercambiabili** (test)
- [x] La password non esce mai da un'API
- [x] Rate limit sul test, come per SMTP
- [x] Nessuna dipendenza nuova

**Non fatto.** La casella non viene **letta**: vedi D24 in
[16](16-technical-debt.md).

**Test.** `tests/email/imap-config.test.mjs` (10).

**File.** `prisma/schema.prisma`, `prisma/migrations/20260823090000_*`,
`src/lib/email/imap-config.ts`, `src/lib/server/email/imap-*.ts`,
`src/app/api/v1/admin/imap/**`,
`src/app/private/easygame-platform-admin-0c7a/page.tsx`,
[12](12-integrations.md), [14](14-security.md).

---

### WP-44 · Gruppi numerazione, compatibilita categorie e ordinamento — `DONE` (2026-08-23)

**Obiettivo.** Rendere affidabile il flusso abbigliamento/numerazione, dare un
modello esplicito alla compatibilita fra categorie e dare a tutta la Web App un
solo ordinamento nominale.

**Cause radice individuate.**

1. **Atleti assenti dai gruppi.** `jersey-numbering-utils.ts` aveva una lettura
   privata delle categorie dell'atleta: confrontava le stringhe **rispettando
   le maiuscole** (`normalizeText` faceva solo `trim`), leggeva
   `categoryMemberships` ma non `category_memberships`, e leggeva
   `membership.categoryName` ma non `membership.category_name` — cioe proprio
   le chiavi con cui l'API serializza le membership. Ogni atleta la cui
   categoria era registrata in una forma diversa da quella attesa spariva dal
   gruppo **senza errore**. Il sintomo osservato («le categorie con nomi simili
   non compaiono») era questo: alcune categorie erano riferite per id, altre
   per nome, e solo le prime combaciavano.
2. **Nome atleta stampato due volte.** `getAthleteName` concatenava tutti i
   campi nome trovati. L'API aggiunge a ogni atleta l'alias
   `name = "Nome Cognome"` (`withCompatibilityAliases`), quindi l'elenco era
   `["Mario", "Rossi", "Mario Rossi"]` e usciva «Mario Rossi Mario Rossi».
3. **Numeri riservati persi al refresh.** `normalizeNumberingGroup` passava
   `reservedNumbers` e `assignedNumbers` per `normalizeList`, che gestisce
   array, stringhe e oggetti ma **non i numeri**: un `[10, 12]` gia numerico
   usciva vuoto a ogni ricaricamento della pagina.
4. **Costo quadratico.** `getJerseyGroupSummary` era chiamata una volta per
   gruppo e ognuna rileggeva l'intero stato; `getAthleteJerseyNumberSummary`
   rileggeva lo stato **una volta per record** per cercare i duplicati.
5. **Nessun modello di compatibilita.** L'unica relazione atleta-categoria era
   l'appartenenza: «un U13 puo essere usato in U14» non era esprimibile.
6. **Ordinamento a macchia di leopardo.** Quattordici `localeCompare` scritti a
   mano, con locale e opzioni diverse; allenatori, staff, sponsor, strutture,
   utenti e club della console non erano ordinati affatto.

**Scope.** `src/lib/sorting.ts` (nuovo, comparatore unico);
`src/lib/category-compatibility.ts` (nuovo, modello di compatibilita);
riscrittura di `src/lib/jersey-numbering-utils.ts`; scheda gruppi di
`/clothing` a tendina con ricerca e paginazione; configurazione della
compatibilita nella scheda categoria; applicazione dell'ordinamento agli
elenchi nominali.

**Modello adottato.** [ADR-0030](18-decision-log.md): la compatibilita e
configurata per categoria (`compatibleCategoryIds`), **esplicita**,
**orientata** e **non transitiva**. Restano separati categoria primaria,
appartenenze effettive ed eleggibilita per compatibilita; l'eleggibilita non e
persistita e non fa entrare nessuno in un gruppo se il gruppo non la chiede
(`includeCompatibleCategories`, default `false`).

**Acceptance criteria.**
- [x] Un atleta la cui categoria e registrata solo per nome, o con maiuscole
      diverse, entra nel gruppo giusto
- [x] Categorie con nomi simili restano gruppi distinti
- [x] Il nome atleta e stampato una volta sola, come `Cognome Nome`
- [x] Le schede dei gruppi partono chiuse e si aprono a tendina
- [x] Ricerca interna al gruppo e limite di righe con «Mostra altri»
- [x] La compatibilita non e mai dedotta dal nome della categoria e funziona
      con categorie personalizzate
- [x] La compatibilita non e transitiva (test dedicato)
- [x] Gruppi, flag e compatibilita sopravvivono al refresh
- [x] Ordinamento nominale unico, case-insensitive e stabile, applicato ad
      atleti, allenatori, staff, soci, utenti, club, categorie, gruppi,
      sponsor, strutture e catalogo abbigliamento

**Prestazioni.** Riepilogo di tutti i gruppi, 1.000 atleti / 30 categorie /
3.000 assegnazioni: **34,9 ms → 17,4 ms** (2,0x). Riepilogo numeri di un
atleta: **2,5 ms → 1,0 ms** (2,5x). Con 400 atleti e 12 gruppi: 7,1 → 5,9 ms.
A cio si aggiunge il fatto che le tabelle chiuse non vengono renderizzate.

**Aree escluse dall'ordinamento alfabetico.** Date, scadenze, cronologie, rate,
priorita, classifiche e sequenze configurate a mano: l'ordine vi ha un
significato funzionale. L'elenco e in
[10 — UI/UX](10-ui-ux-conventions.md#ordinamento-degli-elenchi-blocco-5-2026-08-23).

**Test.** `tests/lib/sorting.test.mjs` (8),
`tests/lib/category-compatibility.test.mjs` (8),
`tests/lib/jersey-numbering-groups.test.mjs` (10),
`tests/lib/numbering-group-persistence.test.mjs` (5).

**File.** `src/lib/sorting.ts`, `src/lib/category-compatibility.ts`,
`src/lib/jersey-numbering-utils.ts`, `src/lib/athlete-name-utils.ts`,
`src/lib/category-utils.ts`, `src/lib/clothing-inventory-utils.ts`,
`src/app/clothing/page.tsx`, `src/app/categories/page.tsx`,
`src/components/forms/CategoryEditorDialog.tsx`, `src/app/trainers/page.tsx`,
`src/app/staff/page.tsx`, `src/app/soci/page.tsx`, `src/app/sponsors/page.tsx`,
`src/app/structures/page.tsx`,
`src/app/private/easygame-platform-admin-0c7a/page.tsx`,
`src/components/account/account-shared.ts`,
[06](06-data-model.md), [10](10-ui-ux-conventions.md),
[11](11-capabilities.md), [18](18-decision-log.md).

---

### WP-45 · Topbar del club ripristinata e regole grafiche definitive — `DONE` (2026-08-23)

**Obiettivo.** Rimettere sulla topbar del club i comandi che il Blocco 3 aveva
tolto per errore di perimetro, e scrivere le regole grafiche in modo che il
malinteso non si ripeta.

**Causa radice.** Il requisito «togli chat, azioni rapide e assistenza»
riguardava la dashboard `platform_admin`, che non amministra un club e non deve
avere scorciatoie di club. WP-37 lo ha applicato a **tutte** le chrome: la
topbar del club ha perso due funzioni che servivano. La chat, invece, va tolta
davvero: non ha un backend.

Cause secondarie sulla riga identita, tutte introdotte insieme:

1. il logo del club era chiuso in una cornice (`rounded-xl border`) da 44 px:
   letto come la miniatura di una riga di elenco, non come il marchio della
   societa;
2. il nome del club era `text-base`, piu piccolo del titolo di una card della
   pagina sotto;
3. la stagione era una targa a due righe **sotto** il nome: occupava l'altezza
   di due righe nella barra e comprimeva tutto il resto.

**Scope.**

- `Header.tsx`: marchio EasyGame (l'SVG gia in repo) collegato a `/account`;
  azioni rapide con pannello laterale, filtrate da `canAccessPath`; assistenza;
  barra riportata a 80 px. La chat **non** torna.
- `MobileTopBar.tsx`: azioni rapide e assistenza dentro il menu, dove non
  costano larghezza — sulla barra lo spazio resta a club e stagione; marchio
  nell'intestazione del menu.
- `club-identity.tsx`: logo senza cornice e piu grande, nome `text-xl`,
  targhetta stagione discreta e accanto al nome, con ritorno a capo.
- `platform-admin-shell.tsx`: invariata, resta senza funzioni di club.
- `globals.css`: seconda taglia di occhiello (`.eg-eyebrow-sm`) al posto di tre
  valori arbitrari scritti a mano.

**Audit tipografico.** Nessun font nuovo: restano `Inter` e `Archivo`,
dichiarati solo in `app/layout.tsx`. Eliminate le variazioni arbitrarie sulle
superfici dell'identita (tre taglie di occhiello diverse per la stessa cosa,
etichette di sezione riscritte a mano nel menu mobile). Le taglie a mano
rimaste nelle griglie dense sono debito dichiarato (D26) e non sono state
toccate: non era un rifacimento.

**Acceptance criteria.**
- [x] Azioni rapide e assistenza tornate sulla topbar del club
- [x] Le azioni rapide non propongono aree vietate dal ruolo
- [x] Chat fuori da entrambe le chrome
- [x] Marchio EasyGame sulla topbar del club
- [x] Logo del club senza cornice e piu grande
- [x] Nome del club piu grande e leggibile
- [x] Stagione discreta, accanto al nome, senza spingere via logo o comandi
- [x] La console `platform_admin` resta separata e senza funzioni di club
- [x] Nessun font nuovo; due sole taglie di occhiello
- [x] Le regole sono vincolanti per i WP successivi ([10](10-ui-ux-conventions.md))

**Test.** `tests/ui/topbar-club-vs-platform.test.mjs` (16);
`tests/ui/brand-and-chrome.test.mjs` aggiornato (la regola invertita e stata
riscritta, non cancellata).

**File.** `src/components/dashboard/Header.tsx`,
`src/components/layout/MobileTopBar.tsx`,
`src/components/brand/club-identity.tsx`, `src/app/globals.css`,
`src/components/account/account-home-screen.tsx`,
`src/components/auth/auth-shell.tsx`,
`src/components/platform-admin/platform-admin-shell.tsx`,
[10](10-ui-ux-conventions.md), [16](16-technical-debt.md).

---

### WP-35 · Riportare i dati da una stagione all'altra — `READY`

**Obiettivo.** Aprire una stagione nuova senza ricreare tutto a mano.

**Contesto.** Con WP-32 le stagioni sono davvero separate: una categoria
creata nella stagione 2026/2027 non compare nella 2025/2026, e viceversa.
Manca il complemento: una funzione che **duplichi** nella stagione nuova le
categorie, i piani di pagamento e gli sconti della stagione precedente,
lasciando scegliere cosa riportare.

**Scope.** Azione «Riporta dalla stagione precedente» in `/organization`;
duplicazione lato server delle `club_resource` soggette a stagione, con nuovi
`id` e `seasonId` della stagione di destinazione. Nessuna copia di dati
operativi (allenamenti, partite, presenze, incassi).

**Dipendenze.** WP-32.

**Acceptance criteria.**
- [ ] Si sceglie quali tipi riportare
- [ ] Gli elementi duplicati portano la stagione di destinazione
- [ ] Rieseguire il riporto non crea duplicati
- [ ] Test dedicati

**File.** `src/lib/server/resources.ts`, `src/app/organization/page.tsx`,
[06](06-data-model.md), [09](09-api-conventions.md).

---

## Fase F3 — Completamento funzionale

### WP-13 · Pagamenti online via CediPay / Platform.Payments — `PIANIFICATO`

**Obiettivo.** Decidere e chiudere: implementare davvero o rimuovere la
promessa.

**Scope (se si implementa).** Scegliere il PSP, implementare la creazione della
checkout session, **verificare la firma del webhook**, gestire
succeeded/failed/refund/chargeback, riconciliare con `AthletePayment`,
registrare la fee di piattaforma.

**Scope (se non si implementa ora).** Nascondere l'ingresso nell'interfaccia e
documentare la capability come `MISSING` senza UI.

**Dipendenze.** ADR-0013: si passera da CediPay / Platform.Payments, non da un PSP diretto.

**Acceptance criteria.**
- [ ] Nessun endpoint di pagamento accetta eventi senza firma valida
- [ ] Il flusso completo e testato in sandbox
- [ ] Nessun secret nel repository

**File.** `src/app/api/payments/**`, `src/lib/payments/**`,
[11](11-capabilities.md), [12](12-integrations.md), [14](14-security.md).

---

### WP-14 · Unificare i sistemi di toast — `READY`

**Obiettivo.** Un solo sistema di notifiche a schermo.

**Scope.** Scegliere `toast-notification.tsx` (piu diffuso), migrare gli usi
dell'altro, rimuovere `toaster.tsx` / `use-toast.ts` e il relativo montaggio in
`AppClientProviders`.

**Dipendenze.** WP-01.

**Acceptance criteria.**
- [ ] Un solo provider di toast montato
- [ ] Tutti i punti che notificano continuano a funzionare
- [ ] Nessun import residuo del sistema rimosso

**File.** `src/components/ui/toast*`, `src/components/ui/use-toast.ts`,
`src/components/providers/AppClientProviders.tsx`, [10](10-ui-ux-conventions.md).

---

### WP-15 · Spostare i file fuori dal database — `BLOCKED (WP-05)`

**Obiettivo.** Smettere di salvare binari in `assets.data_base64`.

**Scope.** Introdurre uno storage esterno **portabile** (S3-compatibile, non un
servizio proprietario dell'hosting — vedi [ADR-0007](18-decision-log.md));
migrare gli asset esistenti; mantenere `Asset` come indice con `public_url`.

**Dipendenze.** WP-05. Richiede la scelta del provider.

**Acceptance criteria.**
- [ ] I nuovi upload non scrivono `data_base64`
- [ ] Gli asset esistenti restano accessibili
- [ ] Script di migrazione idempotente e reversibile

**File.** `prisma/schema.prisma`, `src/lib/server/resources.ts`,
`src/app/api/forms/assets/**`, `src/app/api/athletes/**/documents/**`.

---

### WP-16 · Audit log — `PARZIALE` (2026-08-22)

**Obiettivo.** Tracciare chi ha fatto cosa sulle operazioni sensibili.

**Scope.** Nuovo modello `AuditLog` (`user_id`, `organization_id`, `action`,
`resource`, `resource_id`, `metadata`, `created_at`); registrare almeno:
login/logout, cambio ruolo, modifica membership, operazioni su
pagamenti/fatture/ricevute, cancellazioni, azioni platform admin.

**Dipendenze.** WP-04. Legato alla decisione A9.

**Acceptance criteria.**
- [x] Ogni operazione elencata produce una riga
- [x] Il log non contiene segreti (`sanitizeMetadata`, verificato anche sul
      record salvato su database reale)
- [x] Migrazione applicata prima allo sviluppo, poi a staging con il deploy
- [x] Retention configurabile con `AUDIT_LOG_RETENTION_DAYS`
- [ ] **Scheduler** che invochi `purgeExpiredAuditEvents()`
- [ ] **UI di consultazione** per il platform admin
- [ ] Decisione di prodotto sul periodo di retention

**File.** `prisma/schema.prisma`, `src/lib/server/audit.ts`,
`src/app/api/**`, [14](14-security.md).

---

## Fase F2/F3 — Igiene strutturale (paralleli, basso rischio)

### WP-17 · Ridurre l'adapter `supabase.ts` — `BLOCKED (WP-07)`

**Obiettivo.** Togliere il nome fuorviante e il livello di indirezione.

**Scope.** Rinominare in `src/lib/data-client.ts` (o simile), aggiornare gli
import, rimuovere le chiavi legacy `supabase_session` dopo un periodo di
compatibilita. Man mano che WP-07 sposta la logica sul server, ridurre la
superficie dell'adapter.

**Dipendenze.** WP-07 (almeno parziale).

**Acceptance criteria.**
- [ ] Nessun file si chiama `supabase.*`
- [ ] Le sessioni esistenti nel browser non vengono invalidate
- [ ] Nessun cambiamento funzionale

**File.** `src/lib/supabase.ts` e tutti i suoi import.

---

### WP-18 · Rimuovere i residui legacy — `PARZIALE`

**Obiettivo.** Eliminare le code delle generazioni precedenti.

**Scope.** In blocchi separati e indipendenti:
1. componenti trainer v1 orfani (11 file);
2. Pages Router residuo (`src/pages/_app`, `_document`, `_error`, `404`);
3. primitive `src/components/ui/` non referenziate (18 file) e dipendenze
   liberate (`vaul`, `embla-carousel-react`, `react-resizable-panels`,
   `react-hook-form`);
4. dipendenze inutilizzate (`radix-ui`, `tempo-devtools`, `prettier` da
   spostare in devDependencies);
5. componenti orfani vari.

Elenco completo in [cleanup-report](cleanup-report.md).

**Dipendenze.** ADR-0016: si rimuove solo cio che e riclassificato SAFE con verifica esplicita. Il punto 3 va dopo WP-14.

**Acceptance criteria.**
- [ ] Ogni blocco e un commit separato
- [ ] Set di route del build invariato dopo ogni blocco
- [ ] Nessun import rotto

---

### WP-19 · Scomporre le pagine monolitiche — `BLOCKED (WP-07)`

**Obiettivo.** Rendere le pagine piu grandi modificabili in sicurezza.

**Scope.** **Una pagina per WP figlio.** Ordine per dimensione:
`athletes/[id]` (~340 KB), `clothing` (~176 KB), `registration-management`
(~150 KB), `trainers/[id]` (~128 KB), `training` (~116 KB).
Per ciascuna: estrarre la logica in `src/lib/`, i sotto-componenti in
`src/components/<dominio>/`, lasciare nella pagina solo la composizione.

**Dipendenze.** WP-07 per la parte di dominio.

**Acceptance criteria (per pagina).**
- [ ] Nessun cambiamento funzionale visibile
- [ ] La pagina scende sotto le ~500 righe
- [ ] La logica estratta ha almeno un test

---

### WP-20 · Deprecare gli alias di compatibilita — `BLOCKED (WP-21, DEFERRED)`

**Obiettivo.** Rimuovere `simplified_*` e `organizations` dal registro risorse.

**Scope.** Censire gli usi (web **e** mobile), migrare ai nomi reali, marcare
gli alias come deprecati nel registro, rimuoverli dopo che entrambe le
superfici sono migrate.

**Dipendenze.** WP-21 — il mobile deve essere migrato prima.

**Acceptance criteria.**
- [ ] Nessun chiamante usa piu gli alias
- [ ] `RESOURCE_CONFIG` non li contiene
- [ ] `docs/api-registry.md` aggiornato

---

## Fase F4 — Mobile — **DIFFERITA** (2026-08-22)

> **WP-21..WP-25 sono `DEFERRED`** per
> [ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive).
> Nessuna nuova funzionalita Mobile fino a una decisione esplicita che superi
> quell'ADR. Sul codice `easygamemobile/` restano ammessi solo le correzioni di
> sicurezza e gli adeguamenti resi necessari da un cambio di contratto API
> deciso lato Web. Il progetto resta nella CI e continua a essere compilato.

### WP-21 · Consolidare il layer dati mobile — `DEFERRED (ADR-0025)` · era `PARZIALE` (2026-08-22)

**Obiettivo.** Un solo servizio dati.

**Scope.** Eliminare `mobile-storage-service.ts` (orfano); migrare le
schermate collegate interamente a `api.ts` + `mobile-backend-storage.ts`;
isolare `storage.ts` (mock) in attesa della rimozione delle schermate v1.

**Dipendenze.** Nessuna. Non collide con nessun WP web.

**Acceptance criteria.**
- [x] `mobile-storage-service.ts` **rimosso** (era gia senza import)
- [x] Nessuna schermata collegata legge dati mock
- [x] `check:types` e `lint` verdi, **piu bundle Metro costruito** (12,9 MB)
- [ ] `services/storage.ts` resta finche esistono le schermate v1 (WP-22)

**File.** solo `easygamemobile/client/**`.

---

### WP-22 · Rimuovere le schermate mobile v1 — `DEFERRED (ADR-0025)`

**Scope.** Eliminare le 10 schermate non collegate e `services/storage.ts`.

**Dipendenze.** WP-21 e verifica funzione per funzione (ADR-0016).

**Acceptance criteria.**
- [ ] L'app si avvia e naviga tutte le tab
- [ ] Nessun dato mock nel bundle

---

### WP-23 · Allineare le funzionalita trainer mobile al Web — `DEFERRED (ADR-0025)`

**Scope.** Colmare le differenze su presenze, convocazioni, alert operativi e
notifiche. **Non** introdurre nuove regole di dominio nel client mobile:
consumare gli endpoint esistenti o richiederne di nuovi lato Web.

**Acceptance criteria.**
- [ ] Un allenatore puo svolgere sul mobile le operazioni quotidiane che fa sul Web
- [ ] Nessuna logica di dominio duplicata

---

### WP-24 · Test per il mobile — `DEFERRED (ADR-0025)`

**Scope.** Introdurre un runner (allineato all'approccio del Web se possibile) e
coprire `api.ts` (envelope, retry, timeout), `mobile-backend-storage`
(normalizzazione) e `lib/trainer-permissions`.

**Acceptance criteria.**
- [ ] `npm test` esiste in `easygamemobile`
- [ ] La CI (WP-02) lo esegue

---

### WP-25 · Build distribuibile (EAS) — `DEFERRED (ADR-0025)`

**Scope.** Configurare EAS, profili build (development / preview / production),
gestione dei segreti, procedura di distribuzione interna.

**Acceptance criteria.**
- [ ] Build installabile su un dispositivo reale
- [ ] `EXPO_PUBLIC_EASYGAME_API_URL` configurabile per profilo
- [ ] Procedura documentata

---

### WP-30 · Reset password via SMTP — `DONE` (2026-08-22)

**Obiettivo.** Dare all'utente un recupero password self-service.
Requisito bloccante per la produzione ([ADR-0015](18-decision-log.md)).

**Scope.** `sendPasswordResetChallenge` e `confirmPasswordReset` in
`auth-workflows.ts`; endpoint `/api/v1/auth/password/forgot` e `/reset`;
pagine `/auth/forgot-password` e `/auth/reset-password`; link dal login.

**Dipendenze.** SMTP configurato nell'ambiente.

**Acceptance criteria.**
- [x] Token casuale da 32 byte, salvato solo come hash, monouso, TTL 30 minuti
- [x] Confronto a tempo costante e tetto ai tentativi
- [x] Il reset revoca **tutte** le sessioni dell'utente, in transazione
- [x] Nessuna enumerazione: risposta identica per account esistenti e non
- [x] Rate limit su identita e IP su entrambi gli endpoint
- [x] Le challenge di reset non interferiscono con gli OTP di verifica
- [x] Ciclo completo provato su database reale: token, scadenza, riuso,
      sostituzione, revoca sessioni, isolamento dagli OTP
- [x] Consegna SMTP verificata su staging

**Test.** 11 test in `tests/auth/password-reset.test.mjs`.

---

## Fase F5 — Production readiness

### WP-26 · Attivare l'ambiente di produzione — `PIANIFICATO (dopo la UAT)`

**Dipendenze.** ADR-0011: la produzione si attiva **solo dopo la UAT finale**.
Sono bloccanti anche WP-16 (audit log) e le policy privacy/retention
([ADR-0019](18-decision-log.md)).

**Scope.** Creare progetto Vercel e database Neon dedicati; documentare
variabili, DNS e procedura di promozione staging → produzione.

**Acceptance criteria.**
- [ ] Ambienti documentati e distinti
- [ ] Nessuna condivisione di database tra staging e produzione
- [ ] Procedura di rilascio scritta

---

### WP-27 · Error tracking e logging — `BLOCKED (WP-26)`

**Scope.** Introdurre un error tracker **portabile** (self-hostable o
provider-agnostico), logging strutturato lato server, alert sugli errori 5xx.
Nessun dato personale nei log.

---

### WP-28 · Backup e restore provati — `BLOCKED (WP-26)`

**Scope.** Documentare i backup Neon, **eseguire un restore di prova** su un
branch, misurare RTO/RPO, scrivere il runbook.

**Acceptance criteria.**
- [ ] Un restore e stato eseguito davvero e documentato

---

### WP-29 · UAT strutturato — `BLOCKED (WP-26)`

**Scope.** Definire gli scenari per ruolo (owner, club manager, staff, trainer,
parent, athlete), preparare i dati su staging con
`staging:provision-e2e`, raccogliere gli esiti.

**Acceptance criteria.**
- [ ] Checklist UAT versionata in `docs/`
- [ ] Un ciclo completo eseguito e verbalizzato

---

## Come lavorare in parallelo

| Gruppo | WP | Aree toccate | Collisioni |
|--------|----|--------------|-----------|
| A — infrastruttura | WP-02, WP-09 | config, script | nessuna |
| B — sicurezza web | WP-03, WP-04, WP-05 | `src/app/api`, `src/lib/server`, `tests` | B e D condividono `resources.ts`: sequenziare |
| C — mobile | WP-06, WP-21, WP-22, WP-24 | solo `easygamemobile/` | nessuna con il web |
| D — dati | WP-10, WP-11, WP-12 | `src/lib/server/resources.ts` | **un solo agente per volta** |
| E — igiene UI | WP-14, WP-18 | `src/components` | WP-18 punto 3 dopo WP-14 |

Regola: **due WP che toccano lo stesso file non si eseguono in parallelo.**
`src/lib/server/resources.ts` e `src/lib/simplified-db.ts` sono i due file a
maggior contesa.
