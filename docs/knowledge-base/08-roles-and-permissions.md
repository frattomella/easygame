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
| `parent` | parent | `/parent-view/<athleteId>` |
| `athlete` | athlete | `/athletes/<athleteId>/profile` |
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
  `/parent-view/<linkedAthleteId>` dell'atleta effettivamente collegato;
- `athlete` → i ruoli management passano; l'atleta passa solo sul proprio
  `/athletes/<linkedAthleteId>/profile`.

Prefissi management riconosciuti: `/dashboard`, `/athletes`, `/categories`,
`/clothing`, `/hub`, `/matches`, `/medical`, `/modulistica`, `/movements`,
`/notifications`, `/organization`, `/payments`, `/permissions`, `/procura`,
`/registration-management`, `/reports`, `/secretariat`, `/settings`, `/soci`,
`/sponsors`, `/staff`, `/structures`, `/trainers`, `/training`.

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
