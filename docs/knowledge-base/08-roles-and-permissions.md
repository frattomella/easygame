# 08 — Ruoli e permessi

**Unica fonte di verita: [`src/lib/access-roles.ts`](../../src/lib/access-roles.ts).**
Non duplicare logiche di ruolo altrove: estendi quel file.

## Ruoli canonici (7)

`owner` · `club_manager` · `collaborator` · `staff` · `trainer` · `parent` ·
`athlete`

`normalizeAccessRole()` normalizza da un dizionario di alias che include
sinonimi inglesi e italiani (anche flessi al femminile): `proprietario`,
`amministratore`, `gestore`, `collaboratrice`, `segreteria`, `allenatrice`,
`genitore`, `tutore`, `atleta`, `giocatrice`, ...

Un valore non riconosciuto restituisce `""` → nessun accesso alle aree
protette.

> Nota: `admin` e alias di **`club_manager`**, non di `owner`. `owner` deriva da
> `clubs.creator_id` oppure da una membership con ruolo owner.

## Aree di accesso

`getAccessArea(role)` → `management` | `trainer` | `parent` | `athlete` |
`account` | `public`

| Area | Ruoli | Redirect post-login (`getAccessRedirectPath`) |
|------|-------|-----------------------------------------------|
| `management` | owner, club_manager, collaborator, staff | `/dashboard?clubId=<id>` |
| `trainer` | trainer | `/trainer-dashboard` |
| `parent` | parent | `/parent-view/<athleteId>` con **un** figlio; `/parent-view` — la schermata di scelta — con piu d'uno (Wave 6) |
| `athlete` | athlete | `/athlete-dashboard`, senza identificativo nel percorso (Wave 6) |
| `account` | qualsiasi utente autenticato | `/account` |

## Permessi di navigazione — `canAccessPath`

`getPathAccessArea(pathname)` classifica il percorso, poi:

- `public` e `account` → **sempre consentiti** a un utente autenticato;
- `management` → richiede un ruolo management. Alcuni prefissi sono
  **solo owner / club_manager**:
  `/create-club`, `/dashboard/access-management`, `/organization`,
  `/permissions`, `/settings`;
- `trainer` → solo `trainer`;
- `parent` → solo `parent`, **e** il path deve essere
  `/parent-view/<linkedAthleteId>` dell'atleta effettivamente collegato. Fa
  eccezione `/parent-view` nudo, che e la schermata di **scelta del figlio** e
  non parla di nessun figlio in particolare (Wave 6);
- `athlete` → sul proprio `/athletes/<linkedAthleteId>/profile` passano anche i
  ruoli management, perche e la scheda di un atleta del loro club; su
  `/athlete-dashboard` passa **solo** `athlete`, perche li non c'e nessun atleta
  da guardare — c'e la propria area, e per un dirigente sarebbe vuota.

Prefissi management riconosciuti (`MANAGEMENT_PATH_PREFIXES`): `/audit`,
`/calendar`, `/dashboard`, `/athletes`, `/categories`, `/clothing`,
`/communications`, `/consensi`, `/hub`, `/matches`, `/medical`, `/modulistica`,
`/movements`, `/notifications`, `/onboarding`, `/organization`, `/payments`,
`/permissions`, `/procura`, `/registration-management`, `/reports`,
`/secretariat`, `/settings`, `/soci`, `/sponsors`, `/sport-work`, `/staff`,
`/structures`, `/trainers`, `/training`.

> **Due aree della Wave 6 non sono in quell'elenco: `/appuntamenti` e
> `/documenti`.** Montano il guscio con `AccessAreaGuard`, e il middleware
> chiede la sessione; ma `getPathAccessArea` non le riconosce come gestionali e
> risponde `public`, e per `public` il guard **consente sempre**. Il risultato e
> che un genitore o un allenatore con una sessione valida vede la *struttura* di
> due schermate di segreteria — i dati no, perche le API rifiutano comunque.
>
> E la stessa classe che il commento in testa a `src/middleware.ts` racconta per
> `/consensi`, `/sport-work` e `/calendar`, e che il presidio nuovo di
> `tests/auth/route-guards.test.mjs` dovrebbe chiudere. Non la chiude: quel test
> verifica che ogni area abbia **un guscio con una guardia e un prefisso nel
> middleware**, non che il guard la **classifichi**. Un guard montato su un
> percorso che il classificatore chiama `public` e un guard che non guarda
> niente.

> Dal 2026-08-22 `canAccessPath` e applicato da `AccessAreaGuard` su **tutte**
> le aree, tramite `src/components/auth/management-area-layout.tsx` montato in
> ogni `layout.tsx` di area. A monte, `src/middleware.ts` reindirizza a
> `/login` chi non ha il cookie di sessione.
>
> Nessuno dei due e il presidio principale: il middleware non valida la
> sessione (niente Prisma su edge) e il guard e client-side. **L'autorizzazione
> vera resta server-side nelle API.** Vedi [14 — Sicurezza](14-security.md).

## Permessi sulle risorse API — `canAccessClubResource`

Applicato **server-side** in `src/app/api/v1/[resource]/route.ts` e
`.../[id]/route.ts` tramite `assertClubResourceAccess(role, resource, action)`.
Azioni: `read` | `create` | `update` | `delete`.

| Ruolo | Regola |
|-------|--------|
| `owner`, `club_manager` | **tutto** |
| `collaborator`, `staff` | tutto **tranne** le risorse admin-only |
| `trainer` | whitelist esplicita, separata per lettura e scrittura |
| `parent`, `athlete` | **nessun accesso** alle API generiche di club |

Risorse admin-only (`MANAGEMENT_ADMIN_ONLY_RESOURCES`):
`access_tokens`, `bank_accounts`, `clubs`, `organizations`,
`organization_users`, `payment_methods`, `users`.

### Trainer — lettura

`athlete_category_memberships`, `athletes`, `categories`,
`club_resource_items`, `matches`, `medical_certificates`, `notifications`,
`secretariat_notes`, `simplified_athletes`, `simplified_certificates`,
`simplified_notifications`, `staff_members`, `trainers`,
`training_attendance`, `trainings`

### Trainer — scrittura

`matches`, `notifications`, `simplified_notifications`, `training_attendance`,
`trainings`

### Parent e athlete

Non possono enumerare le risorse del club. Usano endpoint dedicati:

- `/api/v1/auth/athlete-profile/[athleteId]`
- `/api/parent-dashboard/[athleteId]` e sottorotte
  (`appointments`, `documents`, `structures`)

## Configurazione del club — `canManageClubConfiguration`

`true` solo per `owner` e `club_manager`. Usato ad esempio da
`/api/v1/training-automation`.

## Ruolo attivo: come viene deciso

`resolveOrganizationScopeForUser(userId, preferredOrganizationId, preferredRole)`
in `src/lib/server/auth.ts`:

1. carica tutte le membership (`organization_users`) ordinate per `is_primary`
   desc, poi `created_at` asc;
2. carica i club di cui l'utente e `creator_id` (**ownership implicita**);
3. `allowedOrganizationIds` = unione dei due insiemi;
4. `activeOrganizationId` = il valore richiesto **se e in allowed**, altrimenti
   la membership primaria, altrimenti il primo club posseduto, altrimenti il
   primo consentito;
5. `activeRole`:
   - `owner` se il ruolo richiesto e `owner` **e** l'utente possiede il club;
   - `null` se e stato richiesto un ruolo che non corrisponde ad alcuna
     membership del club attivo (**scelta voluta: non si degrada a un ruolo
     piu alto**);
   - altrimenti il ruolo della membership preferita / primaria / prima
     disponibile, oppure `owner` per ownership implicita.

Il client propone il contesto con gli header `x-active-club-id` e
`x-active-access-role`; il server **non si fida** e li valida contro
`allowedOrganizationIds`.

## Platform admin

E un ruolo **ortogonale** ai 7 ruoli di club: non compare in
`access-roles.ts`. Vedi [07 — Autenticazione](07-authentication.md).

## Test

`tests/auth/role-authorization.test.mjs` e
`tests/auth/active-club-access.test.mjs` coprono la matrice. **Ogni modifica a
`access-roles.ts` deve aggiornare questi test.**


---

## Lavoro sportivo: cinque permessi, nessun ruolo nuovo (2026-08-28)

Un rapporto di lavoro dice quanto guadagna una persona. In un club e il dato
che circola per pettegolezzo prima che per necessita, e i sette ruoli canonici
non bastano a governarlo: dicono **chi e** una persona, non **cosa puo fare**
sul dato economico piu riservato che la societa possiede.

Da qui cinque permessi di dominio, in `src/lib/sport-work/permissions.ts`, e
nessun ottavo ruolo — che CLAUDE.md vieta, e a ragione: aggiungere un ruolo
avrebbe costretto a duplicare l'intera gerarchia alla capability successiva.

| Permesso | Cosa consente |
|----------|---------------|
| `sport_work.manage` | creare e modificare rapporti, piani, premi, rimborsi, adempimenti |
| `sport_work.read` | vedere rapporti e compensi **di tutto il club** |
| `sport_work.read_own` | vedere i propri compensi |
| `sport_work.pay` | registrare e stornare erogazioni |
| `sport_work.fiscal` | vedere e preparare i dati contributivi e fiscali (F24, CU) |

| Ruolo | Permessi |
|-------|----------|
| `owner` | tutti |
| `club_manager` | tutti |
| `collaborator` | `read_own` |
| `staff` | `read_own` |
| `trainer` | `read_own` |
| `athlete` | `read_own` |
| `parent` | nessuno |

**Perche il perimetro si ferma a proprietario e club manager.** Perche e lo
stesso che gia protegge conti correnti, metodi di pagamento e configurazione
societaria (`MANAGEMENT_ADMIN_ONLY_RESOURCES`), e i compensi non sono meno
sensibili di quelli. Allargarlo a segreteria e collaboratori e una decisione di
prodotto: va presa esplicitamente, non per omissione.

**`read_own` esiste ma in V1 nessuna superficie lo consuma.** Non c'e ancora
una dashboard personale del collaboratore. Concederlo ora significa che il
giorno in cui quella dashboard esistera non si dovra riaprire il modello dei
permessi; **non** significa che un allenatore possa elencare i rapporti del
club, perche gli endpoint di elenco richiedono `sport_work.read`.

**Ogni diniego si traccia.** `sportWorkRoute` scrive `resource.access.denied`
con il permesso mancante, il percorso e il metodo: un tentativo di leggere i
compensi altrui e un evento di sicurezza, non un errore di navigazione.

**La conseguenza da dichiarare in schermata.** Chi non ha `sport_work.read`
vede Movimenti **senza le uscite dei compensi**, quindi con un totale Uscite
piu basso. E voluto — mostrare il totale senza le righe sarebbe una fuga a
meta — e resta fra le voci aperte di [16](16-technical-debt.md).

`tests/lib/sport-work-permissions.test.mjs` e
`tests/server/sport-work-routes.test.mjs` coprono la matrice, ruolo per ruolo,
sul dominio e sulle rotte.

---

## Comunicazioni: otto permessi, nessun ruolo nuovo (2026-08-29)

La Wave 2 apre sei superfici che parlano con le famiglie — comunicazione
massiva, automazioni, bacheca, RSVP, link di pagamento, solleciti — e sono
superfici diverse dello stesso fatto: **il gestionale che manda un messaggio a
nome della societa**.

Se ogni lane si fosse scritta la propria matrice, la Wave avrebbe lasciato
quattro copie della stessa decisione, e la prima volta che una si allarga le
altre restano indietro **in silenzio**. E l'errore che l'audit di fine Wave 1
aveva trovato in `seasons/permissions.ts`, e che non e stato ripetuto.

Da qui otto permessi di dominio in `src/lib/communications/permissions.ts`, e
nessun ottavo ruolo.

| Permesso | Cosa consente |
|----------|---------------|
| `communications.send` | creare e inviare una comunicazione alle famiglie |
| `communications.read_recipients` | vedere l'elenco **nominativo** dei destinatari e degli esclusi |
| `communications.audience_economic` | selezionare un pubblico in base alla posizione economica |
| `automations.manage` | creare, modificare, accendere e spegnere un'automazione |
| `board.publish` | pubblicare un avviso in bacheca |
| `board.read` | leggere gli avvisi destinati a se |
| `rsvp.read` | leggere le risposte di partecipazione |
| `rsvp.answer` | rispondere all'invito per il proprio atleta |

| Ruolo | Permessi |
|-------|----------|
| `owner` | tutti tranne `rsvp.answer` |
| `club_manager` | tutti tranne `rsvp.answer` |
| `collaborator` | `board.read`, `rsvp.read` |
| `staff` | `board.read`, `rsvp.read` |
| `trainer` | `board.read`, `rsvp.read` (limitato ai propri gruppi operativi) |
| `parent` | `board.read`, `rsvp.answer` |
| `athlete` | `board.read`, `rsvp.answer` |

**Il perimetro si delega, non si ricopia.** `listCommunicationPermissions`
chiede a `canManageClubConfiguration` invece di elencare a mano proprietario e
gestore: il giorno in cui quel perimetro si allarga, questa matrice si allarga
con lui. Un test strutturale verifica che la delega ci sia.

**`communications.audience_economic` protegge un criterio, non una pagina.**
«Manda a chi non ha pagato» non mostra nessun importo a schermo, eppure produce
**l'elenco delle famiglie in arretrato**, che e un dato economico a tutti gli
effetti. Se il permesso proteggesse solo la pagina dei movimenti, un allenatore
otterrebbe lo stesso elenco passando dal motore del pubblico. La porta da
chiudere e il criterio, ed e per questo che ha una chiave propria separata da
`communications.send`: oggi hanno lo stesso perimetro, domani potrebbero non
averlo.

**Perche `owner` e `club_manager` non hanno `rsvp.answer`.** Non e una
restrizione: rispondere all'invito e un atto della famiglia, e chi risponde al
posto suo produrrebbe un dato che l'allenatore leggerebbe come una conferma
ricevuta. Il gate vero e comunque il **legame con l'atleta**, non il ruolo.

> **Il catalogo diceva il contrario, e diceva male** (2026-09-01, sonda di
> sicurezza 5J). `src/lib/permissions/catalog.ts` marcava `rsvp.answer` come
> permesso della gestione e la negava a genitore e atleta: due tabelle in
> disaccordo su sei ruoli su sette, con questa — quella che `answerRsvp`
> interroga davvero — nel ruolo di chi decide. Una schermata che avesse creduto
> al catalogo avrebbe mostrato alla segreteria un pulsante che il server rifiuta,
> e nascosto alla famiglia l'unica cosa che le e chiesto di fare. Il catalogo e
> stato allineato a chi decide.
>
> Resta vero che su questa chiave **nessun ruolo puo essere negato**: il ruolo
> con cui si risponde e derivato dal legame appena verificato, quindi e sempre
> `parent` o `athlete`. La porta chiusa e il legame assente — provare a
> rispondere per il figlio di un altro — e da 5J lascia una riga di audit.

**Perche segreteria e collaboratori leggono ma non mandano.** Mandare un
messaggio a nome della societa ha lo stesso perimetro che gia protegge il
sollecito degli insoluti (Wave 1). Allargarlo e una decisione di prodotto, da
prendere esplicitamente e non per omissione — la stessa regola gia applicata al
lavoro sportivo.

`tests/lib/communication-permissions.test.mjs` copre la matrice ruolo per ruolo,
e la maggioranza dei suoi controlli prova **il diniego**: un test che provasse
solo cio che un proprietario puo fare passerebbe anche se la matrice desse tutto
a tutti.

---

## `sport_work` e una risorsa riservata (2026-08-31, decima tornata)

`MANAGEMENT_ADMIN_ONLY_RESOURCES` non conteneva `sport_work`, e
`canAccessClubResource` risponde **vero** a segreteria e collaboratore per
qualunque nome che non sia in quell'elenco.

Il perimetro del lavoro sportivo era dichiarato in due punti su tre: fra i
`MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` (la pagina) e nei permessi di dominio di
`src/lib/sport-work/permissions.ts`, che a collaboratore e segreteria danno il
solo `sport_work.read_own`. Non era dichiarato dove conta per **le porte che
non sono ne la pagina ne la rotta del dominio**.

Gli allegati ereditano il permesso da cio a cui sono attaccati
(`src/lib/server/attachment-permissions.ts`), quindi ereditavano un permesso
che non esisteva: respinti da `/api/v1/sport-work/people`, gli stessi
documenti — documento d'identita, autocertificazione, **coordinate bancarie** —
si ottenevano da `/api/v1/attachments?owner_type=sport_work_person`, e si
potevano riscrivere e cancellare.

La regola generale che questo caso illustra: **il perimetro di un dominio si
dichiara nella matrice**, non solo nelle sue rotte. La matrice e il posto in cui
lo si dice una volta per tutte le porte, comprese quelle che non esistevano
quando il dominio e nato.

---

## Il dato sanitario: tre permessi, nessun ruolo nuovo (2026-09-01, Wave 5 — 5A)

`src/lib/health/permissions.ts` e il proprietario. Tre chiavi, sullo stampo di
ADR-0077:

| Permesso | owner | club_manager | collaborator | staff | trainer | parent | athlete |
|---|---|---|---|---|---|---|---|
| `clinical.status_read` | ✔ | ✔ | ✔ | ✔ | ✔ | legame | legame |
| `clinical.read` | ✔ | ✔ | ✔ | ✔ | **✖** | legame | legame |
| `clinical.manage` | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |

**Il taglio, e perche e quello giusto.** Lo *stato* — valido, in scadenza,
scaduto, con la data — risponde alla domanda operativa «questo atleta puo
scendere in campo?»: serve all'allenatore, e gli resta. Il *contenuto* —
allergie, patologie, farmaci, gruppo sanguigno, il file del certificato —
risponde a una domanda che l'allenatore non deve porsi per fare il proprio
lavoro. Default **negato**.

Il taglio non e inventato: e quello che l'interfaccia gia distingueva, con il
badge di scadenza da una parte e le schede allergie/farmaci/BLSD dall'altra. La
differenza e che prima lo distingueva **il browser** — `viewMedicalStatus`
compariva in diciannove componenti e in **zero** moduli server — e adesso lo
distingue la proiezione di `serializeRecord`, cioe ogni strada che porta al
campo (ADR-0058).

**Per genitore e atleta il gate e il legame, non il ruolo**: le loro rotte
risolvono il legame e sono l'unico controllo. Questo modulo decide cosa vede chi
guarda il fascicolo **di qualcun altro**.

**Dove le tre chiavi vengono applicate** (2026-09-01, dopo la sonda di
sicurezza). Fino a 5J erano dichiarate e mai chieste: si registrava un
certificato medico senza passare da nessuna di esse. Adesso il registro generico
le applica in `src/lib/server/resources.ts`:

| Chiave | Dove |
|---|---|
| `clinical.status_read` | `listResourcePage` e `getResourceById` sulle risorse `medical_certificates` e `simplified_certificates` |
| `clinical.manage` | `createResource`, `updateResource` e `deleteResource` sulle stesse risorse, **e** sulla scrittura di una scheda atleta che tocchi uno dei campi di `CLINICAL_ATHLETE_FIELDS` |
| `clinical.read` | non nega: **proietta**, con `proiettaSenzaDatoClinico` |

La scheda atleta e a condizione di proposito: scrivere l'anagrafica di un atleta
non e un atto clinico, e chiedere la chiave su ogni scrittura vorrebbe dire che
chi non puo vedere le allergie non puo piu correggere un cognome.

Nessuna delle due guardie toglie qualcosa a qualcuno oggi — i ruoli che hanno le
chiavi sono gli stessi che gia scrivevano e leggevano — ed e il punto: la
chiave esiste **da applicare** il giorno dei ruoli personalizzati. Una chiave
che nessuna strada applica non e un permesso, e una casella che si spunta senza
che cambi niente e peggio di una casella che non c'e.

**Cosa il club perde, e va detto:** un allenatore smette di vedere allergie,
farmaci e gruppo sanguigno. Finche non esiste la concessione per singolo
operatore (Wave 6, con i ruoli personalizzati) non c'e modo di restituirglielo.
E deliberato: il default su un dato sanitario di un minore e negato, e un
default sbagliato non si compensa con una casella di spunta nel browser.

Copertura: `tests/auth/dato-clinico-e-perimetro-allenatore.test.mjs`.

---

## Il perimetro dell'allenatore e implicito sul ruolo (2026-09-01, Wave 5 — 5A)

`filterTrainerDashboardRecords` si attivava solo se il chiamante passava
`trainer_dashboard=1` nella query string. **Un filtro che si accende su un
parametro scelto da chi chiama non e un confine**: bastava ometterlo, e
`simplified_athletes` — che sta in `TRAINER_READ_RESOURCES` — restituiva
l'anagrafica completa di tutti gli atleti del club. Era esattamente cio che
faceva il contesto della dashboard, che poi filtrava **nel browser**.

Adesso il filtro guarda `scope.activeRole`. Il parametro storico resta accettato
e non decide piu niente.

---

## Il genitore ha i figli che ha, non il primo (2026-09-01, Wave 5 — 5A)

`canAccessPath` ammetteva un solo percorso, `/parent-view/<linkedAthleteId>`,
dove il valore era **singolo** e lo calcolava un `athletes.find(...)`. Il campo
e diventato `linkedAthleteIds`, un elenco, con **un solo proprietario** della
domanda: `getParentLinkedAthletes` in `src/lib/server/parent-dashboard.ts`, che
risolve i figli in tutti i club e accetta anche il legame per email verificata.

L'elenco non si filtra per club: la guardia risponde a «questo profilo e uno dei
miei», che riguarda la persona. Il confine vero resta sul server, che risolve di
nuovo il legame a ogni lettura.

Lo espongono `GET /api/v1/auth/memberships` e
`POST /api/v1/auth/memberships/activate` come `linked_athlete_ids`, cosi il
legame **sopravvive a un ricaricamento della pagina**. La forma singolare resta
accettata per le sessioni gia aperte.

Copertura: `tests/auth/genitore-piu-figli.test.mjs`.

---

## Il catalogo unico delle chiavi (2026-09-01, Wave 5 — 5B, W5-70)

`src/lib/permissions/catalog.ts`. EasyGame aveva **tre generazioni di
permessi** una accanto all'altra:

1. i domini nati con una matrice — `sport-work`, `communications`,
   `accounting`, e da questa Wave `health` — con chiave, etichetta, ruolo per
   ruolo e default negato;
2. una quindicina di **predicati booleani senza chiave** in `documents/`,
   `members/` e `attachment-permissions`: corretti, ma non elencabili, non
   mostrabili in una schermata e non assegnabili;
3. un flag di **interfaccia** che nasceva acceso e viveva solo nel browser
   (`viewMedicalStatus`), chiuso in 5A.

La differenza non e estetica. Una chiave si puo **elencare** — e quindi
mostrare in una configurazione — e si puo **assegnare** — e quindi leggere da un
motore di ruoli personalizzati. Un predicato booleano senza chiave esiste solo
per chi legge il codice.

**Il catalogo tiene l'elenco; le matrici restano nei domini** (CLAUDE.md §2).
`documents/permissions.ts`, `members/permissions.ts` e `health/permissions.ts`
leggono il catalogo invece di tenere una seconda copia della tabella dei ruoli,
e `tests/lib/catalogo-permessi.test.mjs` prova che dominio e catalogo non
possono divergere.

**Questo non e un motore di ruoli personalizzati** e non ne e l'inizio scritto
di sfuggita: nessuna tabella, nessuna concessione per membership, nessuna
revoca. E la **forma** che un motore potra leggere senza essere riscritto — il
presidio che rende la Wave 6 un'aggiunta e non un rifacimento.

---

## Niente piu allow-by-default (2026-09-01, Wave 5 — 5B, W5-71, chiude W2-13)

Il ramo di `canAccessClubResource` per collaboratore e segreteria terminava con
`return true`: potevano leggere e scrivere **qualunque nome** non presente
nell'elenco riservato. Non e teorico — e lo schema che ha tenuto `sport_work`
aperto alla segreteria: il perimetro era dichiarato nella pagina e nel dominio,
e la matrice rispondeva `true` a una risorsa di cui non sapeva niente.

Adesso c'e `MANAGEMENT_OPEN_RESOURCES`, un elenco esplicito, e
`isClubResourceDeclared`. `resources.ts` **non si carica** se una risorsa del
registro non compare ne fra le aperte ne fra le riservate
(`assertOgniRisorsaDichiaraIPermessi`), esattamente come gia fa per
`RESOURCE_BOUNDARIES` (ADR-0094).

**Cosa ha scoperto subito.** `attachment-permissions.ts` mappava
`owner_type: "staff"` sulla risorsa `"staff"`, che **non esiste**: la risorsa e
`staff_members`. Finche il ramo permissivo rispondeva `true` a ogni nome
sconosciuto, l'errore era invisibile. E il tipo di difetto che
l'allow-by-default teneva nascosto per costruzione.

---

## Il gruppo operativo come confine (2026-09-01, Wave 5 — 5B, W5-69)

Il gruppo operativo — categoria **piu** sede, ADR-0055 — era consumato da un
solo posto: l'RSVP. Ovunque altro il perimetro dell'allenatore era la sola
categoria, e in un club multi-sede il mister dei `Pulcini · Scauri` leggeva
l'anagrafica completa dei `Pulcini · Santi Cosma`.

La regola adesso: **confine dove il dato e personale, filtro dove non lo e.**
Sugli atleti il gruppo e il confine; su allenamenti e gare resta la categoria,
perche il calendario di una squadra non e il dato di nessuno. Un allenatore
senza gruppi dichiarati ricade sulla categoria: un club che non ha configurato
le sedi non perde l'accesso da un giorno all'altro.

Corretto nello stesso passaggio un difetto che restringeva **troppo**: la
categoria di un atleta si leggeva solo dal campo di comodita e non da
`category_memberships`, quindi un atleta iscritto correttamente alla tabella
vera restava invisibile al proprio allenatore.

Copertura: `tests/auth/perimetro-gruppo-operativo.test.mjs`.

---

## `consents.decide_own`: una chiave che non si ottiene da nessun ruolo (2026-09-01, Wave 5 — 5J)

Il §12 la elencava e il catalogo non l'aveva: c'era solo
`consents.decide_for_others`, che e il permesso opposto — la segreteria che
registra per conto di qualcuno. La capacita esisteva gia (una famiglia accetta e
revoca dalla propria area, dalla lane 5H) ma **senza un nome**, e cio che non ha
un nome non si elenca in una schermata ne si concede a un ruolo personalizzato.

E in catalogo con `roles: []` e `byLink: true`. **L'elenco vuoto non e una
dimenticanza**: questo permesso non si ottiene mai da un ruolo. Lo scope della
famiglia porta `activeRole: null` proprio perche ogni controllo di ruolo
risponda «no» e l'unica strada resti il legame, che `assertSubjectMayDecide`
verifica in `src/lib/server/consents.ts`. Scrivere `parent` fra i ruoli non
aprirebbe niente e **mentirebbe sul come**: direbbe che chiunque abbia il ruolo
genitore puo decidere, mentre la verita e che puo decidere chi e legato a
**quell'** atleta.

E la stessa forma di `documents.submit_own` e `rsvp.answer`: tre chiavi il cui
gate e il legame. Il simbolo `⛓` della matrice del §12 significa esattamente
questo, e vale la pena leggerlo come un avviso — un permesso `⛓` che qualcuno
«sistemasse» aggiungendogli dei ruoli diventerebbe un permesso piu largo di
quello che sembra.

---

## Le nove chiavi che nessuno chiedeva (2026-09-01, Wave 6 — 6B, chiude W5-D01)

La Wave 5 ha costruito il catalogo unico delle chiavi. La Wave 6 ha dovuto
constatare che **nove chiavi su trentatre non le chiedeva nessuno**, e che il
difetto era peggiore del numero.

### Come collassavano

`src/lib/documents/permissions.ts` esportava nove predicati. Il perno era una
funzione privata di due righe:

```ts
const canStandBeforeADocument = (role) =>
  roleHasPermission(role, "documents.templates.read");
```

Era **l'unica** chiamata a `roleHasPermission` dell'intero file. Cinque chiavi
si riducevano a quella:

| Chiave nominale | Cosa decideva davvero |
|---|---|
| `documents.generate` | `documents.templates.read` |
| `documents.generated.read` | `documents.templates.read` |
| `documents.generated.advance` | `documents.templates.read` |
| `consents.decide_for_others` | `documents.templates.read` |
| `consents.records.read` | `documents.templates.read` |

Altre tre si riducevano a `canManageClubConfiguration`, cioe a
`owner || club_manager` **cablato**, che non passa da nessuna chiave:
`documents.templates.manage`, `consents.definitions.manage`,
`members.register.manage`.

La nona, `sport_work.read_own`, non aveva un atto da proteggere.

### Perche era il primo commit della Wave 6 e non un residuo

Togliere `documents.templates.read` a un ruolo gli toglieva **in blocco**
generazione, rilettura, avanzamento di stato, registrazione dei consensi per
conto terzi e lettura del registro consensi. Cinque capability distinte, un solo
interruttore.

E un ruolo «segreteria consensi» che non deve vedere i modelli di stampa era
**irrappresentabile**: una chiave del dominio *documenti* decideva tre atti sui
*consensi*.

Un motore di ruoli personalizzati costruito sopra questo stato avrebbe mostrato
a un club cinque caselle che agiscono su un bit solo, e tre caselle che non
agiscono affatto: cioe avrebbe promesso una configurabilita che non c'e.

### Cosa e cambiato

Ogni funzione chiede la propria chiave, e **il comportamento non cambia**: il
catalogo dava gia esattamente i ruoli che le funzioni cablate rispondevano. Lo
prova un test dedicato.

I tre predicati sui consensi hanno lasciato il dominio dei documenti e vivono in
**`src/lib/consents/permissions.ts`**, che e il loro proprietario:

| Chiave | Atto | Ruoli |
|---|---|---|
| `consents.definitions.manage` | definire un consenso, pubblicarne le versioni | direzione |
| `consents.decide_for_others` | registrare accettazione o revoca per conto di qualcuno | segreteria |
| `consents.records.read` | leggere lo stato dei consensi del club | segreteria |

`consents.decide_own` resta fuori: non e di ruolo ma **di legame**, e la sua
regola e nella sezione precedente.

### Il presidio, che e la parte che dura

`tests/lib/catalogo-permessi.test.mjs` verificava etichette, duplicati e
appartenenza ai ruoli — **mai** che una chiave fosse interrogata da qualche
parte. Era la ragione per cui il difetto e sopravvissuto a un test che gia
leggeva il catalogo.

Adesso lo verifica, con la definizione operativa del debito:

> una chiave e **chiesta** se compare sotto `src/lib/server/**` o
> `src/app/api/**` — li vivono le guardie — oppure, altrove, se sta sulla riga
> di una chiamata a un verificatore.

Le chiavi non ancora chieste vivono in un elenco **con il motivo scritto**.

> **Aggiornamento a fine Wave 6: l'elenco e vuoto.** `sport_work.read_own` era
> l'ultima voce, e la lane 6C ha costruito la superficie che la consuma —
> `/trainer-dashboard/compensi` e `GET /api/v1/sport-work/me`, che chiede quella
> chiave e non `sport_work.read`. Chi aggiunge oggi una chiave al catalogo senza
> innestarla in una guardia trova un test rosso e **nessuna eccezione da
> imitare**: se gli serve una deroga deve scriverla, e dichiararne il motivo.

> **La regola.** Una chiave in un catalogo non e un permesso finche una strada
> non la chiede. Un catalogo che elenca chiavi non applicate e **peggio di un
> catalogo assente**.

---

## I ruoli personalizzati di club (2026-09-01, Wave 6 — 6G, chiude W6-1)

I sette ruoli canonici dicono **chi e** una persona. Un club ha bisogno di dire
**cosa fa**, e fin qui l'unica risposta possibile sarebbe stata un ottavo ruolo
cablato — che CLAUDE.md vieta, e a ragione: il nono sarebbe arrivato subito
dopo. La Wave 5 lo aveva gia constatato e scritto per esteso: «la verita sui
ruoli personalizzati: non esistono».

Adesso esistono, e la parte che vale la pena capire non e che esistono: e
**perche non allargano niente**.

### Lo slug, e perche porta dentro il proprio ruolo base

`organization_users.role` e testo libero, e qualunque stringa che
`normalizeAccessRole` non riconosce vale `""`, cioe accesso negato. Un ruolo di
club deve quindi non poter collidere con un canonico e restare leggibile in
archivio. Da qui il prefisso:

    custom:collaborator:segreteria

La base **dentro** il nome non e un vezzo. Senza, la stringa non e
autodescrittiva: `normalizeAccessRole` — il funnel di ogni controllo, del
catalogo delle chiavi, delle guardie di rotta e della navigazione del browser —
non avrebbe modo di sapere cosa quel ruolo sia, e risponderebbe `""`. Il giorno
dell'assegnazione la persona perderebbe **ogni** accesso: la migrazione non
sarebbe additiva, sarebbe una porta che si chiude.

Con la base dentro, ogni controllo gia scritto continua a funzionare e risponde
**al massimo** quanto risponderebbe al ruolo base — mai di piu. Il «mai di piu»
e l'invariante di sicurezza dell'intero meccanismo.

Le basi ammesse sono quattro: `club_manager`, `collaborator`, `staff`,
`trainer`. Fuori restano:

- **`owner`**, perche la proprieta non e un modello da clonare e la sua
  distinzione e strutturale (`clubs.creator_id`);
- **`parent` e `athlete`**, perche i loro permessi nascono dal **legame** con un
  atleta: un ruolo che li imitasse prometterebbe un accesso che nessuna rotta
  gli darebbe.

### Il gettone di sessione: effimero, e per questo puo portare le chiavi

In archivio sta lo **slug** e basta; le chiavi stanno nelle loro righe. A ogni
richiesta `resolveOrganizationScopeForUser` costruisce un *gettone* che aggiunge
allo slug le chiavi concesse e che vive quanto la richiesta:

    custom:collaborator:segreteria#documents.request,documents.review

**Non e mai una colonna.** Portare le chiavi nel ruolo attivo e cio che rende il
restringimento vero ovunque senza riscrivere le quindici guardie di dominio:
tutte chiedono `roleHasPermission(scope.activeRole, chiave)`, e passando di li la
domanda riceve la risposta ristretta invece di quella del ruolo base.

Il gettone finisce anche in `audit_logs.actor_role`, ed e un vantaggio e non un
effetto collaterale: la riga dice con **quali** chiavi l'atto e stato compiuto,
e non solo sotto quale etichetta di ruolo.

Le due letture in piu si fanno solo se qualche tessera nomina un ruolo di club:
chi non ne ha paga zero round trip aggiuntivi.

### Il soffitto e la concessione: due condizioni, e la piu stretta vince

`roleHasPermission` risponde a un ruolo personalizzato in due passi:

1. **il soffitto** — la chiave deve appartenere al **ruolo base**. Un ruolo
   personalizzato e un sottoinsieme, mai un soprainsieme, e questa condizione
   resta vera anche se una riga di `club_role_permissions` dicesse il contrario:
   un archivio si puo corrompere, questa riga di codice no;
2. **la concessione** — la chiave dev'essere fra quelle assegnate.

Un gettone **senza chiavi** — per esempio lo slug letto dall'archivio, che le
chiavi non le porta — nega tutto. E il verso giusto in cui sbagliare: chi non ha
risolto la riga non concede niente.

### Le quattro caselle che non facevano niente, e `narrowDomainPermission`

Il gettone funziona per le guardie che passano dal catalogo. **Non tutti i
domini ci passano.** `sport-work`, `accounting` e `communications` tengono una
matrice per ruolo tutta loro — la prima duplica il catalogo, la seconda ha
chiavi che in catalogo **non ci sono affatto**, la terza e l'autorita vera su
`rsvp.answer` — e la interrogano dopo aver **normalizzato** il ruolo, cioe dopo
aver visto il ruolo base.

Conseguenza, prima della correzione: togliere `sport_work.pay` a un ruolo
personalizzato non toglieva niente. Cinque caselle che non fanno niente sono
esattamente cio che il mandato vieta — «ogni permesso mostrato deve avere
effetto reale» — e nasconderle sarebbe stato il rimedio sbagliato: si sarebbe
smesso di mostrarle **e** di poterle togliere.

`narrowDomainPermission` (in `src/lib/permissions/catalog.ts`) e il ponte, e
risponde tre cose:

| Risposta | Quando | Effetto |
|----------|--------|---------|
| `null` | il ruolo **non** e personalizzato | chi chiama prosegue come prima: nessun comportamento esistente cambia |
| `false` | la chiave non appartiene al ruolo **base** | il soffitto, di nuovo |
| la concessione | la chiave e **in catalogo** | si restringe |
| `true` | la chiave **non** e in catalogo | vale il ruolo base |

L'ultima riga e la parte che vale rileggere: **si restringe cio che qualcuno ha
potuto scegliere, non cio che nessuno ha mai visto.** Le chiavi `accounting.*`
non compaiono in nessuna casella dell'editor, e restringerle su una concessione
che nessuno ha mai potuto dare toglierebbe a un ruolo basato su `club_manager`
la contabilita intera: sarebbe una regressione muta.

> **Un quarto dominio con matrice privata resta fuori, e va saputo.**
> `src/lib/seasons/permissions.ts` decide `seasons.change` delegando a
> `canManageClubConfiguration(normalizeAccessRole(role))`, quindi risponde al
> ruolo **base** e non chiama `narrowDomainPermission`. Oggi e innocuo per la
> stessa ragione dell'ultima riga della tabella: `seasons.change` **non e nel
> catalogo delle chiavi**, quindi non e una casella che qualcuno abbia potuto
> togliere. Diventerebbe un difetto il giorno in cui entrasse in catalogo senza
> che quella funzione venga adeguata. (Il commento di `narrowDomainPermission`
> nomina quattro domini: i chiamanti sono tre.)

### Cosa un ruolo non puo contenere

**Le tre chiavi di legame**, elencate a mano e non dedotte:
`consents.decide_own`, `documents.submit_own`, `rsvp.answer`.

La tentazione sarebbe dedurle dal campo `byLink` del catalogo, e sarebbe
sbagliato — l'errore e credibile, per questo e scritto nel codice: `byLink`
significa «questa chiave si ottiene **anche** dal legame», ed e vero per
`documents.read_dossier`, `clinical.status_read`, `events.read`,
`appointments.read_own`, che restano perfettamente di ruolo e che una segreteria
deve poter avere. Per le tre di sopra il legame non e una strada in piu, e
**l'unica**: concederle a un ruolo direbbe che chiunque lo porti puo decidere
per **chiunque**, mentre la verita e che puo decidere per chi e legato a
**quell'** atleta. Sarebbero permessi piu larghi di quello che sembrano.

**Le chiavi di direzione** — quelle che nessun ruolo diverso da proprietario e
gestore porta — non sono vietate: un club puo volere un «controllo interno» che
legge il registro e non tocca nient'altro. Ma **assegnarlo e un atto del
proprietario**. Si ricavano dal catalogo invece di elencarle, cosi una chiave
nuova riservata alla direzione entra nell'insieme il giorno in cui nasce.

### `owner` smette di essere indistinguibile da `club_manager`

`isOwnerAccessRole` aveva **zero chiamanti**: le sole differenze fra i due ruoli
erano strutturali, via `clubs.creator_id`. Da qui un elenco **chiuso** di sette
atti che soltanto il proprietario compie — `OWNER_ONLY_ACTIONS` in
`src/lib/roles/custom-role.ts`:

creare, modificare e cancellare un ruolo personalizzato; assegnare o revocare il
ruolo di proprietario; assegnare un ruolo personalizzato che contiene permessi
di direzione; cancellare l'organizzazione; cambiare le configurazioni di
piattaforma e di fatturazione.

Chiuso vuol dire che si allunga con una riga li e non con un `if` sparso: il
giorno in cui qualcuno aggiunge un atto di direzione e l'elenco non lo nomina,
l'atto **non** e riservato, e si vede.

### Nessuno concede un ruolo che non possiede

`assertConcessioneDiAccessoLecita` verificava che il concedente fosse
`owner || club_manager` e **non confrontava il ruolo concesso con quello
posseduto**: un `club_manager` poteva fabbricare una tessera `role: "owner"` per
chiunque. Il codice lo sapeva e lo accettava con una motivazione datata —
«piccola oggi, perche owner e club_manager hanno gli stessi diritti, e una
scalata il giorno in cui non li avranno piu». Con i sette atti riservati, quel
giorno e arrivato.

`assertMayGrantRole` pone quattro condizioni:

1. si concede solo amministrando il club attivo;
2. `owner` lo concede **solo** un `owner`;
3. un ruolo personalizzato che contiene chiavi di **direzione** lo assegna solo
   un `owner`;
4. **nessuna chiave che il concedente non abbia** — altrimenti basterebbe
   assegnarla a un complice, o a se stessi il giorno dopo, per ottenerla.

La quarta condizione interroga il ruolo **attivo** passando dal catalogo, quindi
un gestore che porta a sua volta un ruolo personalizzato non puo concedere le
chiavi del proprio ruolo base che a lui sono state tolte. L'auto-promozione
resta impedita a monte, dal chiamante: una tessera non si firma da soli.

**E la rotta generica non serve piu a questo.** `assertConcessioneDiAccessoLecita`
in `resources.ts` rifiuta oggi qualunque ruolo personalizzato con una riga di
audit del diniego, perche una tessera con lo slug e senza `custom_role_id`
darebbe il ruolo base **senza** restringimento. L'unica strada e
`src/lib/server/club-roles.ts`.

### Il perimetro: sede e categoria, e zero righe che significano tutto

`club_access_scopes` porta il perimetro di **un'assegnazione**, non di un ruolo.
Due assi, `site` e `category`, in **AND** fra loro e in **OR** dentro se stessi:
«le sedi di Scauri e Santi Cosma, categoria Pulcini» significa Pulcini in una di
quelle due sedi.

Due regole che conviene non scoprire per tentativi:

- **zero righe non sono zero accessi, sono nessuna restrizione.** E cio che
  hanno tutte le tessere esistenti, ed e la scelta che rende il perimetro
  additivo invece che una migrazione di comportamento;
- **una riga che non porta il valore dell'asse ristretto non passa.** Se qualcuno
  ha dichiarato che quella persona vede solo una sede, un dato senza sede non e
  «di tutte le sedi»: e un dato di cui non si sa dire dove sia.

Prima della Wave 6 la sede era un filtro che arrivava **dal chiamante**, e la
documentazione lo diceva a chiare lettere: «non e un confine di sicurezza».
Adesso lo e — ma solo per chi ne ha uno dichiarato.

#### Dove il perimetro arriva, e le quattro porte che non lo chiedevano

Il perimetro non e un filtro di elenco: e un confine. Nel closeout della
Wave 6 due revisioni indipendenti hanno misurato quattro superfici che lo
ignoravano, e nessuna delle quattro era un elenco di atleti — erano gli
**altri** modi di chiedere la stessa cosa.

| Superficie | Cosa usciva | Dove si applica ora |
|-----------|-------------|---------------------|
| `invoices`, `receipts` | Il documento fiscale di un minore fuori perimetro: nome, indirizzo, codice fiscale, importo | `buildAccessScopeFilter` in `resources.ts`, insieme a certificati e rate |
| Roster della riconferma (`GET /api/v1/seasons/:id/roster`) | La corrispondenza completa **atleta → sede/categoria** del club | `readMembershipsForCategories` in `season-memberships.ts` |
| Risolutore del pubblico (`resolveAudience`) | I recapiti di tutte le famiglie del club a chi puo comunicare solo con la propria sede | La query degli atleti in `audience.ts` |
| Dettaglio persona del lavoro sportivo | Non il perimetro ma l'**IBAN**, a chi ha `sport_work.read` e non `manage` | L'involucro `sportWorkRoute`, sulla **risposta** |
| Partecipazione a un evento (`club_event_participants`, alias `training_attendance`) | Stato, convocazione e note in testo libero su un minore fuori perimetro | `buildAccessScopeFilter`, per insieme di identificativi |
| Lettura per identificativo di un atleta fuori dal **gruppo** dell'allenatore | Tutori, codice fiscale, data di nascita, codice di accesso | `getResourceById`, con lo stesso filtro dell'elenco |
| `club_resource_items` | IBAN, codice fiscale e gettone di accesso delle schede di club; e la scrittura di tipi che la porta per nome nega | Proiezione e permesso sul **tipo della riga** |

Le prime tre sono la stessa lezione gia scritta per la lettura per
identificativo: **un filtro di elenco si aggira chiedendo altro**. La quarta
e la lezione gemella sul verso opposto — la proiezione dell'elenco toglieva
l'IBAN e dichiarava che «si legge aprendo la scheda, e chi lo fa ha
`sport_work.manage`»; la scheda chiedeva `read` e restituiva la riga intera.
La difesa non stava dove il commento diceva.

Per l'IBAN il presidio e sull'**involucro** e non sulle due rotte di oggi:
la proprieta da tenere non e «questa funzione proietta», e «nessuna risposta
di questo dominio porta un IBAN a chi non amministra». Una rotta scritta
domani la eredita senza saperlo.

Un documento fiscale **senza atleta** — intestato al club — non porta il
valore di nessuno dei due assi, quindi non passa: e la seconda regola qui
sopra, applicata.

Copertura: `U-66` in `scripts/wave-6-security-probe.mjs`, che misura ognuna
delle quattro **dalla rotta o dalla funzione che la rotta chiama**, con la
controprova positiva accanto — senza perimetro l'elenco resta intero, e chi
amministra l'IBAN lo vede.
Il «gruppo» non e un `scope_kind`: e la coppia (categoria, sede)
([ADR-0055](18-decision-log.md)), non un'entita, e darglielo come perimetro
significherebbe crearne una.

### Le due chiavi nuove

Il catalogo passa da trentatre a **trentacinque** voci.

| Chiave | Ruoli | Perche li |
|--------|-------|-----------|
| `accounts.athlete.manage` | gestione | Consegnare un accesso non e leggere una scheda, ma **non concede niente che chi lo compie non abbia gia**: il ruolo dell'invito e fisso (`athlete`) e il perimetro e la scheda di quell'atleta, che segreteria e collaboratore leggono tutti i giorni. Chiuderla alla direzione avrebbe messo la consegna dell'accesso in un ufficio diverso da quello che tiene l'anagrafica, cioe l'avrebbe resa una cosa che non si fa |
| `audit.read` | direzione | Il registro porta **tutti** gli atti del club insieme — chi ha stornato un incasso, chi ha cambiato l'anagrafica di un minore, chi ha provato a fare cosa e si e visto negare. E il piu trasversale dei dati societari, e il suo perimetro e lo stesso che gia protegge i conti correnti. Resta **concedibile** a un ruolo personalizzato basato su `club_manager`, ed e la chiave con cui un club costruisce un controllo interno — ma concederla e un atto del proprietario, perche e una chiave di direzione |

`/audit` sta fra i percorsi **gestionali** e non fra quelli amministrativi, ed e
deliberato: a decidere e la chiave, non il prefisso. Metterlo fra gli
amministrativi lo avrebbe chiuso a ogni ruolo diverso da proprietario e gestore
**prima** che la chiave potesse dire la sua, e un ruolo personalizzato a cui il
club concede la lettura del registro avrebbe trovato una porta chiusa dal
browser con la rotta che rispondeva 200. Due serrature che dicono cose diverse
sono gia rotte prima che qualcuno trovi come aprirle.

### Cosa cambia per l'area atleta

`/athlete-dashboard` e l'unica area che **non prende un identificativo nel
percorso**, e non e una dimenticanza: l'atleta e se stesso, la scheda si risolve
dal legame `athletes.user_id`, e non esiste un parametro da cambiare per farla
diventare la scheda di un altro. Il genitore ha `/parent-view/<figlio>` perche di
figli puo averne piu d'uno; l'atleta no.

E in quell'area **non entra la gestione**. Sulla scheda `/athletes/<id>/profile`
un ruolo gestionale passa — e la scheda di un atleta del suo club, che gia legge
— ma su `/athlete-dashboard` non c'e nessun atleta da guardare: c'e la propria
area, e per un dirigente sarebbe vuota. Aprirgliela vorrebbe dire prometterle un
contenuto che non puo avere.

Sul redirect d'ingresso cambiano due cose:

- un **genitore con piu figli** entra da `/parent-view`, la schermata da cui si
  sceglie di quale figlio parlare, e non piu sul **primo** figlio. La pagina e
  raggiungibile anche da chi di figli ne ha uno, altrimenti «cambia figlio»
  rimanderebbe su una porta chiusa;
- un **atleta** entra su `/athlete-dashboard` e non piu su
  `/athletes/<id>/profile`, che monta la sidebar del club: vedeva cliccabili
  Pagamenti, Movimenti, Impostazioni e altre trenta voci, ci cliccava, e
  rimbalzava sulla guardia senza una parola. Un menu che elenca cio che non si
  puo fare non e un menu.

## Closeout Wave 6 — chi amministra gli accessi (2026-09-02)

`assertPuoAmministrareAccessi` — l'unica guardia degli otto ingressi di
`club-roles.ts` — chiedeva `canManageClubConfiguration`, che **normalizza sulla
base**. Un ruolo personalizzato costruito su `club_manager`, anche con **zero
chiavi** — il piu ristretto che si possa creare — entrava: leggeva l'elenco di
chi ha accesso al club con le chiavi di ciascuno, e poteva creare, modificare,
cancellare e assegnare ruoli.

Il modello e **soffitto ∧ concessione**. Questa era la porta che permetteva di
rialzare il soffitto dal di dentro: darsi le chiavi negate, o assegnarsele con
un secondo ruolo. Il soffitto di `assertMayGrantRole` reggeva ancora — era
l'ultima difesa — ma dentro una stanza in cui quel ruolo non doveva poter
entrare.

Adesso la configurazione degli accessi la amministra un ruolo **canonico**:
`owner` o `club_manager` non personalizzati. Non esiste una chiave di catalogo
con cui delegarlo, ed e voluto: **delegare la facolta di ridefinire le deleghe
e un atto del proprietario**.

`canAccessManagementPath` e stato allineato per la sola
`/dashboard/access-management`: senza, la pagina restava nel menu di quel ruolo
per aprirsi piena di errori 403 — e una divergenza fra cio che si vede e cio che
si puo e essa stessa un difetto, perche insegna a diffidare dei messaggi. Vale
per quella pagina e non per le altre riservate — `/settings`, `/communications`
hanno chiavi di catalogo con cui un club puo delegarle davvero.

Prove: `U-29.2` e `U-29.2bis` in `wave-6-roles-probe.mjs`, e i due `escalation 2`
in `tests/server/ruoli-personalizzati-rotte.test.mjs`. La seconda esiste perche
la guardia nuova rende il soffitto irraggiungibile per la strada che lo provava:
va esercitato dove **resta** raggiungibile, cioe su un `club_manager` canonico
che tenta di concedere una chiave di direzione.
