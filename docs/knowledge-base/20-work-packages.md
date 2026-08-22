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
