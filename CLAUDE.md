# CLAUDE.md — istruzioni per Claude Code su EasyGame

EasyGame e un gestionale multi-tenant per ASD e societa sportive.
Nel repository convivono **due applicazioni**:

- **Web App** (`src/`) — Next.js 14 App Router, **funzionante e in produzione
  d'uso**. Vercel + Neon PostgreSQL + Prisma.
- **Mobile App** (`easygamemobile/`) — Expo / React Native, **incompleta**,
  oggi solo area allenatore. **Sviluppo DIFFERITO.**

> La Web App su Vercel + Neon e la **baseline funzionante**.
> Deve restare operativa dopo ogni tuo intervento.

> **Priorita assoluta corrente**
> ([ADR-0025](docs/knowledge-base/18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive)):
> completare **EasyGame Web V1** e renderla pienamente utilizzabile da
> desktop, tablet e smartphone.
>
> **Non sviluppare nuove funzionalita Mobile** fino a nuova decisione. Su
> `easygamemobile/` sono ammessi solo: correzioni di sicurezza, e gli
> adeguamenti resi necessari da un cambio di contratto API deciso lato Web.
>
> Ogni pagina Web che tocchi deve restare usabile a **375 px, 768 px e
> 1280 px**.

---

## 1. Leggi la documentazione prima di modificare

La fonte di verita e **[`docs/knowledge-base/`](docs/knowledge-base/README.md)**.
Documenta il codice reale, non intenzioni.

**Prima di scrivere codice, leggi almeno:**

| Se il task riguarda | Leggi |
|---------------------|-------|
| Qualsiasi cosa | [17 — Convenzioni](docs/knowledge-base/17-development-conventions.md) |
| Orientarsi nei file | [02 — Repository map](docs/knowledge-base/02-repository-map.md) |
| Web / Next.js | [04 — Web architecture](docs/knowledge-base/04-web-architecture.md) |
| Mobile / Expo | [05 — Mobile architecture](docs/knowledge-base/05-mobile-architecture.md) |
| Database, Prisma, Neon | [06 — Modello dati](docs/knowledge-base/06-data-model.md) |
| Login, OTP, OAuth, sessioni | [07 — Autenticazione](docs/knowledge-base/07-authentication.md) |
| Ruoli, permessi, accessi | [08 — Ruoli e permessi](docs/knowledge-base/08-roles-and-permissions.md) |
| Endpoint API | [09 — Convenzioni API](docs/knowledge-base/09-api-conventions.md) |
| Componenti, pagine, stile | [10 — UI/UX](docs/knowledge-base/10-ui-ux-conventions.md) |
| «Questa funzione esiste?» | [11 — Capability](docs/knowledge-base/11-capabilities.md) |
| SMTP, SMS, OAuth, pagamenti | [12 — Integrazioni](docs/knowledge-base/12-integrations.md) |
| Build, deploy, variabili | [13 — Ambienti](docs/knowledge-base/13-environments.md) |
| Qualsiasi cosa tocchi dati o auth | [14 — Sicurezza](docs/knowledge-base/14-security.md) |
| Test | [15 — Testing](docs/knowledge-base/15-testing.md) |
| Perche una cosa e cosi | [18 — Decision log](docs/knowledge-base/18-decision-log.md) |
| Cosa fare dopo | [20 — Work Package](docs/knowledge-base/20-work-packages.md) |

**Se la KB e in disaccordo con il codice, vince il codice**: correggi la KB
nello stesso commit.

---

## 2. Ownership dei domini

Un dominio ha un punto di ingresso unico. Non crearne un secondo.

| Dominio | File proprietario | Regola |
|---------|-------------------|--------|
| Ruoli e permessi | `src/lib/access-roles.ts` | Nessuna logica di ruolo altrove |
| Ruoli personalizzati di club | `src/lib/server/club-roles.ts` (scrittura) + `src/lib/roles/` (dominio puro) | Un ruolo di club e un **sottoinsieme** delle chiavi del suo ruolo base, mai un soprainsieme. `organization_users.role` (lo slug) e `custom_role_id` si scrivono **insieme e solo da qui**: la rotta generica li rifiuta, perche una riga con lo slug e senza il riferimento darebbe il ruolo base **senza** restringimento (ADR-0102) |
| Perimetro di sede e categoria | `src/lib/roles/access-scope.ts` (modello) + `src/lib/server/club-roles.ts` (scrittura) | **Zero righe = tutto il club**, mai «nessun accesso». Due assi in AND fra loro e in OR dentro se stessi; una riga che non porta il valore dell'asse ristretto **non passa** (ADR-0103) |
| Ordine di acquisizione dei blocchi sulle schede atleta | `src/lib/server/athlete-lock-order.ts` | Chi tocca **piu di una** scheda in una transazione la blocca prima, in ordine **crescente di identificativo**, e in **un lotto solo**: due lotti crescenti non sono un ordine crescente. Poi la scheda, poi le sue righe figlie. Un abbraccio mortale non nasce da un blocco ma da due ordini diversi, e un ordine scritto in casa di uno dei contraenti non e un patto (ADR-0138) |
| Genitori e tutori di un atleta | `src/lib/server/athlete-guardians.ts` (scrittura) + `src/lib/guardians/` (regole pure) | **L'unico** scrittore di `athlete_guardians`, e a farlo valere e l'**archivio**: un vaglio rifiuta ogni `INSERT`/`UPDATE` fuori da una transazione che abbia dichiarato `SET LOCAL "easygame.guardian_writer"`, e quella riga la scrive una funzione sola. Un tutore e una riga, unica per `(athlete_id, identity_key)`; `athletes.data.guardians[]` e una **proiezione in sola lettura** che non governa nessun accesso, e la rotta generica toglie quella chiave da cio che riceve. La revoca e un fatto sulla riga e la toglie solo un riscatto (ADR-0135, ADR-0136) |
| Le **regole** del dominio dei tutori | `src/lib/guardians/` — `exclusion`, `identity`, `projection`, `documents`, `notifications` | «Questa persona e fuori?» e **un OR**, e ha **una** funzione (`isGuardianExcluded`): nessun consumatore la ricostruisce, e nessuna primitiva ha parametri che ne cambino la semantica — un parametro di sicurezza e il permesso di divergere scritto nella firma. Sei stesure dell'esclusione, tre delle notifiche e due della guardia sulla concessione hanno tenuto in piedi quindici revisioni. Lo fa valere `scripts/pp-02-censimento.mjs` (C3: chi e canonico **importa** una primitiva che il modulo **esporta**; C5: nessuno ripiega l'OR in casa) (ADR-0153) |
| Accesso EasyGame di un atleta | `src/lib/server/athlete-accounts.ts` | **L'unica** strada che scrive `athletes.user_id`. Nessun ramo compone, salva o manda una password: in archivio vive solo l'impronta del token, e la password la sceglie la persona con il meccanismo che esiste gia (ADR-0104) |
| Scollegare un profilo dall'account (allenatore, genitore) e ripulire i riferimenti dopo una revoca | `src/lib/server/profile-account-links.ts` | Scollegare un profilo **non e** revocare una tessera: nessuna funzione di questo file tocca `organization_users`. Per l'atleta lo scollegamento puro e `unlinkAthleteAccount` in `athlete-accounts.ts` (stesso proprietario di `athletes.user_id`); qui vivono solo trainer e genitore, piu lo sweep che `revokeClubAccess` e l'uscita volontaria dal club chiamano entrambi per non lasciare riferimenti dangling dopo una revoca completa (ADR-0110) |
| Diritti dell'interessato: export e cancellazione | `src/lib/server/data-subject.ts` | **L'unico** posto in cui si dichiara dove vive una persona — sei indici polimorfi che nessuna chiave esterna copre. Tre classi: si cancella, si anonimizza, si conserva **con il motivo scritto**. Per un minore la cancellazione senza riepilogo confermato fallisce (ADR-0105) |
| Errori del server e identificativo di richiesta | `src/lib/server/observability.ts` | Un punto solo: `console.error(msg, error)` non si scrive altrove. L'errore si riduce a nome, prima riga del messaggio e codice — mai l'oggetto intero, che sull'ORM contiene il record che si stava scrivendo |
| Sessioni e scope | `src/lib/server/auth.ts` | Ogni endpoint passa da `requireAuthenticatedUser` + `resolveOrganizationScopeForUser` |
| Stagioni sportive | `src/lib/club-seasons.ts` (modello) + `src/lib/server/seasons.ts` (scrittura) + `src/lib/server/season-delete.ts` (eliminazione) | Una sola stagione attiva; nessuna scrittura di `settings.seasons` altrove. Eliminare una stagione non e un `DELETE`: configurazione via, riferimenti staccati, **storia mai** (ADR-0197 §9) |
| La stagione di una richiesta | `src/lib/seasons/context.ts` (puro) + `src/lib/server/season-context.ts` (lettura del club) | **Un solo risolutore** (ADR-0197): attiva, dichiarata (`x-active-season-id`), della riga, per data, nessuna — e non si mescolano. Nessuna rotta legge l'header a mano; nessun lettore sostituisce la stagione **della riga** con l'attiva; la stagione per data vale solo senza stagione scritta e con finestra unica. I record senza annata sono della stagione piu vecchia (`filterCollectionBySeason`, `seasonWhere`) |
| Assegnazioni di un allenatore a categorie e gruppi | `src/lib/trainers/season-assignments.ts` | L'allenatore e del club, la sua squadra e della stagione: si spacca per stagione (`splitTrainerAssignmentsBySeason`) e si scrive con `mergeTrainerAssignmentsForSeason`, che tiene lo storico. Un id dell'anno scorso non e una squadra di quest'anno, e un nome non sceglie fra due stagioni (ADR-0197 §7). **Chi allena un allenamento nuovo lo dice l'assegnazione della stagione** (`buildTrainerAssignmentIndex`, ADR-0198 §1): il generatore non scrive sull'evento chi non e assegnato nella stagione alla squadra della voce, il riporto non copia gli allenatori, un allenamento gia scritto conserva il suo snapshot |
| Contatore delle presenze di un evento e «l'appello e stato fatto?» | `src/lib/events/attendance-count.ts` | Registrato = **almeno una riga** di appello, presenti o assenti; `presenti > 0` non e una prova. Numeratore = persone registrate presenti (rosa, fuori rosa, in prova), una persona una volta sola (`athlete:<id>` / `trial:<id>`); denominatore = rosa attesa, mai allargata: `15/13` e un dato (ADR-0198 §2, §6) |
| Analitiche di un atleta (presenze/convocazioni per categoria) | `src/lib/athlete-category-analytics.ts` (`calculateAthleteCategoryAnalytics`) | L'unica letta dalla scheda atleta — `athlete-participation-utils.ts` e la sua omonima sono **irraggiungibili** (D-RD-18), non toccarle credendole vive. Le presenze arrivano da righe vere (`club_event_participants`, mai la copia incassata nella proiezione `clubs.trainings`) piu, per chi viene da una prova, `trial_attendances` ri-chiavate sull'atleta (`GET /api/v1/athletes/:id/trial-history`). Un evento fuori da `[activityStartAt, now]` non entra ne nel consuntivo ne nella scoperta della categoria (ADR-0199 Wave B) |
| Il gruppo numerazione di un atleta | `src/lib/jersey-numbering-utils.ts` (`resolveNumberingGroupForCategory`) | Lo dice la **categoria primaria** (`NumberingGroup.categoryIds`), mai una scelta libera dell'operatore: un gruppo che nomina la categoria vince sempre, un gruppo senza categorie («copre tutto il club») e l'ultima spiaggia. Un numero gia assegnato conserva il suo gruppo; solo chi non ne ha uno riceve quello derivato da oggi (ADR-0199 Wave B, §B8-B11) |
| Come si presenta un allenamento | `src/lib/events/training-presenter.ts` | Il titolo e il tipo («Allenamento»), la categoria un badge, la data un campo: nessuna schermata inventa un titolo con la data, e la data resta nel dominio. Un titolo scritto a mano che non e una data e la nota (ADR-0198 §3) |
| Incassi (movimenti di denaro) | `src/lib/server/payment-transactions.ts` (scrittura) + `src/lib/payments/installment-ledger.ts` (calcolo) | Nessuno scrive `payment_transactions` altrove; lo stato di una rata **non si imposta**, si ricava |
| Riconciliazione di una schedule di rate contro il totale dovuto | `src/lib/payments/installment-ledger.ts` (`reconcileInstallmentTotal`, `describeScheduleMismatch`) | Confronto in centesimi, tolleranza **un** centesimo (l'arrotondamento a cinque euro puo lasciarlo). `syncAthleteEnrollmentInstallmentPayments` (`src/lib/simplified-db.ts`) la chiama e rifiuta **prima** di scrivere una rata: uno scarto non e un avviso, e un errore che blocca (ADR-0199 Wave D, §D12-D15). Il vaglio vive nell'unico orchestratore del flusso, non in un confine di rete indipendente (D-RD-49) |
| Voucher e contributi da enti | `src/lib/server/funding.ts` (scrittura) + `src/lib/funding/` (calcolo) | Le regole di un bando sono **configurazione**, mai codice. I due domini non si importano: un contributo non e un pagamento della famiglia |
| Lavoro sportivo: anagrafica, rapporti, piani, scadenze, dichiarazioni, posizioni | `src/lib/server/sport-work.ts` (scrittura) + `src/lib/sport-work/` (dominio puro) | Lo stato di una scadenza e di un rapporto si **deriva**, non si scrive. Le regole dell'anno sono dati con la loro fonte: un anno non configurato **fallisce**, non ricade sull'anno prima |
| Denaro in uscita | `src/lib/server/sport-work-ledger.ts` | **L'unica** funzione che fa uscire denaro verso una persona. Niente `DELETE`: si storna. Blocca prima la persona e poi la scadenza, perche la franchigia annua e per persona |
| Premi, rimborsi, fatture P.IVA, adempimenti | `src/lib/server/sport-work-agenda.ts` | Nessuno di questi e un compenso: esce dal registro ma **non** consuma le franchigie del lavoratore |
| Autorita di un lavoro di sfondo | `src/lib/server/system-actor.ts` | Un cron non e una persona: **non** si finge il proprietario, **non** si conia un’utenza, **non** esiste un `isSystem` che scavalchi. Un contesto vive solo sul server, e legato a **un club solo** e porta un elenco **chiuso** di capacita; la traduzione capacita → permesso vive nel **dominio che concede**, non qui. L’audit dice `system:automation` e lascia `actorUserId` nullo (ADR-0156) |
| Eventi sportivi: allenamenti, gare, convocazioni | `src/lib/server/events.ts` (scrittura) + `src/lib/events/` (dominio puro) | **L'unica** strada per creare, modificare o annullare un evento. Nessuno scrive `clubs.trainings` o `clubs.matches`: le due colonne sono una **proiezione in sola lettura** con un solo scrittore (ADR-0098) |
| Partecipazione a un evento | `src/lib/server/events.ts` per convocazione e presenza, `src/lib/server/rsvp.ts` per la risposta della famiglia | Tre colonne, tre scrittori distinti, **nessuna scrittura incrociata** (ADR-0086, esteso da ADR-0099). Una promessa non diventa mai una presenza |
| Richieste e depositi documentali | `src/lib/server/document-requests.ts` (scrittura) + `src/lib/documents/request-model.ts` (dominio puro) | Lo stato di una richiesta si **deriva** dall'ultimo deposito, non si scrive. I byte passano **sempre** da `attachments.ts`: nessun altro archivio (ADR-0100) |
| Appuntamenti e disponibilita | `src/lib/server/appointments.ts` (scrittura) + `src/lib/appointments/` (dominio puro) | Una transizione per rotta. La riprogrammazione crea una riga e chiude la vecchia: **niente mutazione della data in luogo** (ADR-0101) |
| Dato sanitario | `src/lib/health/permissions.ts` | Chi vede lo **stato** del certificato non vede per cio stesso il **contenuto** clinico. Default negato sul contenuto |
| Catalogo dei permessi | `src/lib/permissions/catalog.ts` | Ogni chiave ha un'etichetta e una matrice per ruolo. Le matrici restano nei domini; qui vive l'elenco. Un dominio che tiene una **matrice propria** (sport-work, accounting, communications, seasons) deve passare da `narrowDomainPermission`, altrimenti risponde al ruolo **base** e le caselle di un ruolo personalizzato non fanno niente |
| Causale contabile di un movimento | `src/lib/fiscal/operation-types.ts` (vocabolario) + `resolveInboundClassification` / `resolveOutboundClassification` in `src/lib/server/fiscal-config.ts` (risoluzione) | La causale di un movimento si **deduce** da cio che il dominio gia sa, non si chiede. Etichetta e ambito si **congelano** sulla riga; una causale che **contraddice il verso del fatto** e un errore, non un avviso, e vale nei due sensi (ADR-0106). Il verso appartiene al fatto, non alla riga: lo storno di una liquidazione ha segno opposto e resta sulla stessa causale, altrimenti le due righe non si elidono |
| Catalogo dei moduli adottabili | `src/lib/forms/catalog.ts` | Una voce di catalogo non e un modulo del club: adottarla ne crea una **copia**, e la chiave resta sulla copia solo per dire da dove viene. Stessa forma del catalogo dei documenti (ADR-0092), non una seconda |
| Identita di una categoria | `src/lib/categories/identity.ts` (`resolveCategoryReference`) + `src/lib/category-utils.ts` (`resolveCategoryId`) + `src/lib/trainer-dashboard-helpers.ts` (`extractCategoryIdentity`); in scrittura il vaglio e `src/lib/server/category-write-guard.ts` (ADR-0186): il registro generico scrive l'identificativo o rifiuta | L’identita e l’**identificativo**; il nome e un’etichetta, e serve a leggerla non a riconoscerla. Un nome che ne nomina due non ne nomina nessuna: non si sceglie la prima. Il ripiego sui nomi vale **solo** dove il catalogo non c’e, mai fra due categorie che sanno entrambe chi sono — due sedi con la stessa fascia d’eta sono due squadre (ADR-0155) |
| Pratiche di iscrizione online, revisioni e bozze pubbliche | `src/lib/server/form-submissions.ts` (pratiche e revisioni) + `src/lib/server/form-drafts.ts` (bozze) + `src/lib/server/forms.ts` (modelli) | La pratica **e** `form_submissions` (ADR-0189): una compilazione pubblica non scrive mai `athletes`, tutori, appartenenze o accessi; li scrive solo l'approvazione, che passa dal registro generico e — per una persona in prova — dalla conversione di ADR-0188. Il reinvio dopo «integrazione richiesta» cambia solo i campi elencati e conserva la copia precedente. Il testo formattato (blocchi `content`, modelli di documento) si sanifica **sul server** con `src/lib/rich-text/sanitize.ts` (ADR-0190): nessun `dangerouslySetInnerHTML` senza quella funzione a monte. Nessuna rotta pubblica cerca persone (ADR-0191) |
| Appartenenze di un atleta alle categorie e sede derivata | `src/lib/server/athlete-category-memberships.ts` (writer) + `src/lib/categories/membership-change.ts` (piano puro) + `src/lib/categories/placement.ts` (squadre e sede) | **L'unico** writer che cambia le appartenenze dalla scheda, dalla creazione e dal blocco (ADR-0194): un cambio di categoria e un comando con una politica sulla primaria precedente (default: si toglie) e sulle altre secondarie (default: restano), mai `category_id = X`. La sede di un'appartenenza **e quella della squadra** (gruppo operativo): nessun selettore di sede indipendente, e il registro generico rifiuta una coppia (categoria, sede) che il club non ha configurato. Togliere una categoria toglie una riga corrente: presenze, convocazioni, eventi e audit non si toccano, e i lettori storici leggono il contesto dall'evento |
| Import di atleti da file | `src/lib/server/athlete-import.ts` (writer) + `src/lib/athletes/import/plan.ts` (piano puro) + `src/lib/athlete-import.ts` (lettura) | **Un piano solo** per anteprima, carico, test e rapporto (ADR-0195): ogni riga non vuota ha uno stato e `candidates = ready + warning + error + duplicate + excluded`. Le categorie del file **non si creano mai da sole**: sono decisioni del club, scritte alla conferma dal registro. Il server rivaglia e scrive un atleta per transazione dai registri dei domini; riprovare lo stesso `batchId` non crea doppioni. Un duplicato non si fonde: si decide |
| Persone in prova e loro presenze | `src/lib/server/trial-athletes.ts` | **L'unico** scrittore di `trial_athletes` e `trial_attendances` (ADR-0188). Una persona in prova **non e** un atleta: niente righe in `athletes`, niente categoria «Prova», niente account ne tutore. La presenza esiste solo dentro un evento, mai come testo libero. Prima di creare si cerca e gli omonimi si mostrano, mai si fondono; la conversione crea la scheda dal registro generico o collega quella scelta, e la riga di prova resta con `athlete_id` |
| Accesso dati server | `src/lib/server/resources.ts` | Nessuna query Prisma club-scoped fuori da qui senza filtro esplicito |
| Client Prisma | `src/lib/server/prisma.ts` | Mai istanziare un secondo `PrismaClient` |
| Email | `src/lib/server/email/` | Unico punto di invio |
| Policy auth | `src/lib/auth/*.ts` | Moduli puri e testabili |
| Trasporto HTTP client | `src/lib/api/client.ts` | Mai un `fetch` diretto a `/api` da un componente |
| Dominio client | `src/lib/simplified-db.ts` | In riduzione (WP-07): non aggiungere logica nuova qui |
| Dati mobile | `easygamemobile/client/services/api.ts` + `mobile-backend-storage.ts` | Mai `storage.ts` (mock) ne `mobile-storage-service.ts` (orfano) |

---

## 3. Modifiche atomiche, niente refactoring estraneo

- Un commit = un cambiamento coerente.
- **Vietato** il refactoring opportunistico: niente riformattazioni di massa,
  rinomine non richieste, riordino import, «gia che c'ero».
- Se noti un problema fuori scope: annotalo in
  [16 — Debito tecnico](docs/knowledge-base/16-technical-debt.md) o proponi un
  WP. **Non risolverlo nello stesso commit.**
- Se il diff supera ~400 righe, valuta di dividerlo.
- Non toccare Web e Mobile nello stesso commit, salvo un cambio di contratto
  API che li riguarda entrambi (e in quel caso spiegalo).

---

## 4. Test obbligatori

Prima di ogni commit:

```bash
npm test           # tutti verdi (4.564 al 2026-09-03, revisione finale Wave 6)
npm run typecheck  # nessun output
npm run lint       # 0 errori; i warning non devono aumentare
npm run build      # deve completare
```

Se hai toccato il mobile (raro: lo sviluppo e differito, vedi ADR-0025):

```bash
cd easygamemobile && npm run check:types && npm run lint
```

**Ogni commit che tocca auth, ruoli, permessi o accesso ai dati deve includere
o aggiornare un test.**

Il runner fa **discovery automatica** su `tests/**/*.test.mjs`: un file nuovo
viene eseguito senza toccare `package.json`.

---

## 5. Aggiorna la Knowledge Base

Nello stesso commit del codice:

| Cambi | Aggiorna |
|-------|----------|
| Schema Prisma / migrazioni | [06](docs/knowledge-base/06-data-model.md) |
| Auth, OTP, OAuth | [07](docs/knowledge-base/07-authentication.md) |
| Ruoli o permessi | [08](docs/knowledge-base/08-roles-and-permissions.md) |
| Endpoint | [09](docs/knowledge-base/09-api-conventions.md) + `docs/api-registry.md` + `src/lib/api/registry.ts` |
| Stato di una funzione | [11](docs/knowledge-base/11-capabilities.md) |
| Integrazioni | [12](docs/knowledge-base/12-integrations.md) |
| Variabili / deploy | [13](docs/knowledge-base/13-environments.md) + `.env.example` |
| Sicurezza | [14](docs/knowledge-base/14-security.md) |
| Scelta architetturale | nuovo ADR in [18](docs/knowledge-base/18-decision-log.md) |
| Stato di un WP | [20](docs/knowledge-base/20-work-packages.md) |

---

## 6. Separazione Web / Mobile

- Progetti npm **indipendenti**: `package.json`, `node_modules`, `tsconfig.json`
  separati.
- **Nessun import tra i due alberi.** Non esistono alias condivisi.
- Il mobile e escluso dal `tsconfig.json` del web e dal `.vercelignore`: non
  viene mai deployato con il web.
- Il codice comune di fatto duplicato (permessi trainer, utility certificati) va
  allineato **a mano**; se lo cambi da una parte, verifica l'altra e dichiaralo.

---

## 7. Git

- Branch dal `main`: `feat/`, `fix/`, `chore/`, `docs/`, `test/`,
  `wp/<numero>-<slug>`.
- **Non committare su `main`.** Nessun push forzato su branch condivisi.
- Messaggi in **italiano**, imperativo, con prefisso convenzionale. Nel corpo:
  cosa e cambiato, perche, come e stato validato.
- Non committare: `.env` o segreti, `node_modules`, `.next`, build artifact,
  screenshot di debug, snapshot del repository, contenuti di `.codex-*`.
- Prima di committare esegui `git diff` e leggilo davvero.

---

## 8. Sicurezza database e ambienti

**Il locale usa un database di sviluppo dedicato**, non piu staging
([ADR-0012](docs/knowledge-base/18-decision-log.md)):

```bash
docker compose -f docker-compose.dev.yml up -d
```

e in `.env`: la connection string di `.env.example` piu
`EASYGAME_DB_ENV="development"`.

`scripts/db-guard.mjs` blocca comunque gli script npm di scrittura se
`EASYGAME_DB_ENV` non vale `development`. **La guardia copre solo gli script
npm**: un `npx prisma db push` invocato a mano la aggira.

| Operazione | Autorizzazione |
|------------|----------------|
| `npm run db:status`, `npx prisma migrate status`, query di lettura | libera |
| `npm run db:push`, `db:migrate`, `prisma:seed`, `staging:provision-e2e` | bloccati dalla guardia; **richiedono autorizzazione esplicita** |
| `npx prisma ...` di scrittura invocato a mano | **richiede autorizzazione esplicita** — la guardia non lo intercetta |
| Qualunque `UPDATE` / `DELETE` massivo | **richiede autorizzazione esplicita** |
| Reintrodurre un ORM o una connection string in `easygamemobile/` | **VIETATO** ([ADR-0018](docs/knowledge-base/18-decision-log.md)); la CI lo blocca |

Regole di codice:

- mai una query Prisma club-scoped senza `scope` e senza filtro
  `organization_id`;
- mai fidarsi di un `organization_id` che arriva dal client: deve passare da
  `ensureOrganizationAccess`;
- mai importare `src/lib/server/**` da un componente client;
- mai restituire `password_hash`, credenziali cifrate, token o codici OTP;
- un errore di autorizzazione **deve** contenere la stringa `Accesso negato`
  (il route handler generico la usa per mappare il 403).

---

## 9. Nessuna modifica non autorizzata alla produzione

- Deploy su **staging** (`easygame-staging`): consentito dopo che tutti i gate
  sono verdi. `npx vercel --prod` sul progetto gia collegato.
- Deploy su **produzione**: **mai senza autorizzazione esplicita.**
  Nello scope Vercel corrente non esiste un progetto production: se ne trovi
  uno, **fermati e chiedi**.
- **Ogni deploy esegue `prisma migrate deploy`.** Verifica sempre
  `npx prisma migrate status` e il contenuto di `prisma/migrations/` prima.
- Non modificare variabili d'ambiente Vercel senza autorizzazione.
- Dopo un deploy: verifica lo stato `READY` e fai uno smoke test
  (`/`, `/login`, `/api/v1/registry`).

---

## 10. Vincolo Cedi Platform

EasyGame potrebbe in futuro diventare un prodotto della Cedi Platform con un
backend .NET. **Non avviare alcuna migrazione ora.**

Regola operativa permanente: **non introdurre nuovo accoppiamento** che renda
difficile spostare la logica di dominio fuori da Next.js.

- Niente servizi proprietari dell'hosting (Vercel KV, Blob, Edge Config).
- Niente Server Actions come unico canale di scrittura: passa dalle API.
- La logica nuova va in moduli isolabili sotto `src/lib/server/`.

Vedi [ADR-0007](docs/knowledge-base/18-decision-log.md).

---

## 11. Errori tipici da evitare su questo repository

1. Aggiungere una seconda implementazione di qualcosa che esiste gia (e
   successo con toast, storage mobile, dashboard trainer, pagine account).
2. Mettere logica di dominio in `page.tsx`.
3. Scrivere `clubs.<campo>` direttamente con Prisma, aggirando `resources.ts`:
   disallinea `club_resource_items`.
4. Creare un test e dimenticare di aggiungerlo a `package.json`.
5. Usare `src/components/ui/*` presumendo che siano tutti in uso: 19 non lo
   sono.
6. Fidarsi del nome `src/lib/supabase.ts`: **non parla con Supabase**, e un
   adapter su `fetch`.
7. Eseguire un comando Prisma di scrittura in locale credendo di essere su un
   DB locale: si e su **staging**.
8. Dichiarare una funzione «completa» senza flusso end-to-end. La forma piu
   comune non e il codice mancante: e il codice **irraggiungibile**. L'RSVP era
   completo e testato da due Wave e **nessuna schermata sapeva accenderlo**;
   `board.read` era un permesso senza pagina; il checkout online funzionava e la
   famiglia non aveva un pulsante che lo aprisse. Prima di scrivere `COMPLETE`
   in [11](docs/knowledge-base/11-capabilities.md), percorri il flusso dal clic
   del ruolo interessato fino alla riga scritta.

   (Il vecchio esempio — «i pagamenti online rispondono 501» — non e piu vero:
   l'adattatore Stripe e reale e cablato, e il 501 e il ripiego per un provider
   senza adattatore.)
