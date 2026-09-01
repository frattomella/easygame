# 39 — Wave 5: planning esecutivo

> **Attività sportiva, self-service della famiglia, workflow documenti,
> appuntamenti, e le due dashboard che devono arrivare complete alla
> produzione.**
>
> Questo documento è un **piano**, non un'implementazione. Nessuna riga di
> codice è stata scritta, nessuna migrazione creata, nessun dato toccato. Le
> sette ricognizioni che lo precedono sono state **di sola lettura**.
>
> Redatto il 2026-09-01, dopo le Wave 1, 2, 3 e 4
> ([32](32-wave-1-implementation-uat.md), [34](34-wave-2-implementation-uat.md),
> [36](36-wave-3-implementation-uat.md), [38](38-wave-4-implementation-uat.md)).

---

## Indice

1. [Cosa è stato letto, e con quale metodo](#1--cosa-è-stato-letto-e-con-quale-metodo)
2. [Baseline verificata a HEAD](#2--baseline-verificata-a-head)
3. [Il fatto architetturale: il calendario non ha un modello](#3--il-fatto-architetturale-il-calendario-non-ha-un-modello)
4. [I cinque difetti che vengono prima del piano](#4--i-cinque-difetti-che-vengono-prima-del-piano)
5. [Il registro dei gap: 80 voci verificate](#5--il-registro-dei-gap-80-voci-verificate)
6. [EXTEND contro NEW: il mattone della Wave 5](#6--extend-contro-new-il-mattone-della-wave-5)
7. [Cosa NON sviluppiamo](#7--cosa-non-sviluppiamo)
8. [I workstream](#8--i-workstream)
9. [File e domain ownership](#9--file-e-domain-ownership)
10. [Il DAG delle dipendenze](#10--il-dag-delle-dipendenze)
11. [Lane realmente parallelizzabili, e l'ordine di merge](#11--lane-realmente-parallelizzabili-e-lordine-di-merge)
12. [Permission matrix](#12--permission-matrix)
13. [Impatto Parent](#13--impatto-parent)
14. [Impatto Trainer](#14--impatto-trainer)
15. [Impatto Club](#15--impatto-club)
16. [Iscrizione online](#16--iscrizione-online)
17. [Workflow documenti Club ↔ Parent](#17--workflow-documenti-club--parent)
18. [Appuntamenti](#18--appuntamenti)
19. [Multi-tenant e multi-sede](#19--multi-tenant-e-multi-sede)
20. [Rischi privacy e legali](#20--rischi-privacy-e-legali)
21. [I due residui della Wave 4: W4-R7 e W4-R18](#21--i-due-residui-della-wave-4-w4-r7-e-w4-r18)
22. [UAT definita prima del codice](#22--uat-definita-prima-del-codice)
23. [Prestazioni](#23--prestazioni)
24. [Blocker pre-production](#24--blocker-pre-production)
25. [Cosa resta alla Wave 6](#25--cosa-resta-alla-wave-6)
26. [Riferimenti](#26--riferimenti)

---

## 1 — Cosa è stato letto, e con quale metodo

Sette letture indipendenti e **parallele**, tutte in sola lettura, ognuna con un
dominio e il divieto di sconfinare. Nessuna ha modificato un file.

| Lettura | Dominio | Esito in una riga |
|---|---|---|
| **A** | Attività sportiva e calendario | Non esiste un modello di evento. L'RSVP è completo lato server e **irraggiungibile** in produzione. Le presenze si scrivono in tre posti e si rileggono dal posto sbagliato |
| **B** | Self-service della famiglia e iscrizione online | Un genitore può fare **cinque scritture** in tutta l'applicazione. Con due figli, il secondo non si raggiunge |
| **C** | Dashboard Trainer | La dashboard interroga otto volte una risorsa che il suo ruolo non può leggere. La configurazione dei permessi trainer **non arriva mai** all'allenatore |
| **D** | Documenti, allegati e workflow Club ↔ Parent | Il workflow richiesto **esiste già per intero**, sul sistema file sbagliato, senza audit e senza un test |
| **E** | Appuntamenti | Metà sistema. La richiesta della famiglia **si cancella da sola** alla prima operazione della segreteria |
| **F** | Ruoli, permessi, scope | I ruoli personalizzati **non esistono**. Sede e categoria non sono confini di sicurezza |
| **G** | Gap Golee aperti e residui Wave 1–4 | 43 gap aperti su 72. Il prerequisito della Wave 3 — l'unificazione dei due archivi documentali — **non è mai stato eseguito**, e la sua sigla è stata riassegnata |

**Il metodo, e perché conta.** A ogni lettura è stato chiesto di citare
`file:riga` per ogni affermazione e di scrivere **«non esiste»** mostrando il
comando che glielo ha fatto concludere. È la stessa regola della Wave 4, e
serve per la stessa ragione: una parte consistente di ciò che segue contraddice
la documentazione esistente, e senza una citazione non sarebbe distinguibile da
un'opinione.

**Le quattro affermazioni portanti sono state riverificate a mano nella
sessione principale**, non accettate sulla parola:

| Affermazione | Verifica eseguita | Esito |
|---|---|---|
| Le richieste di appuntamento delle famiglie si cancellano | Lettura di `syncClubAggregateField` ([resources.ts:1641](../../src/lib/server/resources.ts)) e delle sue quattro chiamate, più il percorso di scrittura del genitore | **Confermata** |
| Il trainer riceve 403 su `clubs` e perde i propri permessi | Lettura di `TRAINER_READ_RESOURCES` ([access-roles.ts:219](../../src/lib/access-roles.ts)), di `getClubSettings` ([simplified-db.ts:2087](../../src/lib/simplified-db.ts)) e delle otto chiamate del contesto trainer | **Confermata** |
| Un genitore con due figli non raggiunge il secondo | Lettura del ramo `parent` di `canAccessPath` ([access-roles.ts:384](../../src/lib/access-roles.ts)) e di `findParentAthleteIdForUser` | **Confermata** |
| Il dato clinico è mascherato solo dal browser | `grep viewMedicalStatus` su tutto `src/`: 19 occorrenze, **zero** in `src/lib/server/**` e in `src/app/api/**`; default `true` | **Confermata** |

Il documento [30](30-golee-easygame-gap-audit.md) resta la fonte dei gap `G-xx`.
Il suo §3 **non è aggiornato dopo tre Wave** — lo dichiara il debito `W4-D17` —
e il §4 si ferma alla Wave 3. Gli stati usati qui sono stati ricostruiti
incrociando §4.5/§4.6/§4.7 del 30, il §22 del [37](37-wave-4-planning.md) e il
§9 del [38](38-wave-4-implementation-uat.md), poi **riverificati nel codice**
per il perimetro di questa Wave. Dove il registro e il codice divergono, il
§5 di questo documento dice quale dei due ha ragione.

---

## 2 — Baseline verificata a HEAD

Misurata, non citata. Commit `f92c9b6`, branch `integration/web-v1`, albero
pulito.

| Gate | Esito | Nota |
|---|---|---|
| `npm test` | **3.632 test, 3.632 verdi, 0 falliti**, 122,5 s | Discovery automatica su 259 file `tests/**/*.test.mjs` |
| `npm run typecheck` | Nessun output | |
| `npm run lint` | **0 errori, 39 warning** | I warning non devono aumentare |
| `npm run build` | Completa | **153 route** (93 dinamiche, 60 statiche) |

**Prima divergenza da correggere.** [CLAUDE.md](../../CLAUDE.md) §4 dichiara
«2.273 al 2026-08-28, WP Sport Work». Sono 3.632. Il numero va aggiornato nel
primo commit della Wave.

### Il perimetro del dato, a HEAD

70 modelli in `prisma/schema.prisma`. Per le aree di questa Wave, ciò che esiste
come **tabella** è poco e ciò che esiste come **JSON** è molto:

| Concetto | Come vive oggi |
|---|---|
| Presenza e RSVP | `TrainingAttendance` — **tabella**, con chiave unica e colonne separate (ADR-0086) |
| Appartenenza a categoria | `AthleteCategoryMembership` — **tabella**, con `site_id` |
| Allegato | `Attachment` + `AttachmentBlob` — **tabelle**, con driver di storage (ADR-0034) |
| Consenso | `ConsentDefinition` / `ConsentVersion` / `ConsentRecord` — **tabelle**, append-only (ADR-0090) |
| Compilazione modulo | `FormSubmission` + `FormTemplate` + `FormTemplateVersion` — **tabelle** (ADR-0039) |
| Documento generato | `GeneratedDocument` + `DocumentTemplate*` — **tabelle** (ADR-0088, ADR-0089) |
| Consegna di una comunicazione | `CommunicationDelivery` — **tabella** (ADR-0084) |
| **Allenamento** | `clubs.trainings` JSON ⇄ `club_resource_items` |
| **Gara** | `clubs.matches` JSON ⇄ `club_resource_items` |
| **Appuntamento** | `clubs.appointments` JSON ⇄ `club_resource_items` |
| **Categoria, gruppo, sede, struttura, programma settimanale, orari** | `clubs.<colonna>` JSON ⇄ `club_resource_items` |
| **Documento condiviso con la famiglia** | `athletes.data.sharedDocuments` JSON + tabella `Asset` |
| **Tutore di un atleta** | `athletes.data.guardians[]` JSON, in tre grafie |

I trenta tipi di risorsa di club sono elencati in
[`resources.ts:47`](../../src/lib/server/resources.ts). La doppia
rappresentazione — colonna JSON aggregata **e** righe `club_resource_items` — è
una scelta documentata ([06](06-data-model.md)), non un difetto. Ma è la
premessa di tutto il capitolo 3.

---

## 3 — Il fatto architetturale: il calendario non ha un modello

La Wave 4 è cominciata con una frase: *«non esiste una tabella movimenti»*. La
Wave 5 comincia con la sua gemella.

**Non esiste un modello di evento.** In `prisma/schema.prisma` non c'è
`Training`, non c'è `Match`, non c'è `Event`, non c'è `Convocation`, non c'è
`Appointment`. Allenamenti e gare sono due collezioni JSON indipendenti, con
payload di forma diversa, due semantiche di stato, due pagine, due percorsi di
lettura. L'unico punto in cui si toccano è `serializeParentEvent`
([parent-dashboard.ts:452](../../src/lib/server/parent-dashboard.ts)), che li
normalizza per il cruscotto della famiglia — e poi le pagine tornano separate.

### Le sette conseguenze, e perché sono la stessa conseguenza

Questo non è un problema estetico. Sette gap distinti, che sembrano
indipendenti, poggiano su un solo mattone mancante:

1. **Calendario unico** (G-31): non c'è niente da unire, perché non c'è
   un'entità comune da elencare.
2. **RSVP sulle gare** (G-20 parziale, `W2-08`): il dominio RSVP è cablato su
   `trainings` — `findTraining` legge solo `club.trainings`
   ([rsvp.ts:135](../../src/lib/server/rsvp.ts)). Una gara non ha dove
   ospitare una risposta.
3. **Convocazione come fatto**: oggi è un campo dentro il payload della gara,
   letto con **dieci grafie alternative** (`calledAthletes`, `calledAthleteIds`,
   `called_athletes`, `selectedAthletes`, `athletes`, `roster`, `lineup`,
   `convocations`, `convocatedAthletes`, `convocationEntries` —
   [parent-dashboard.ts:325](../../src/lib/server/parent-dashboard.ts)). Non si
   può dare un permesso, un audit o una notifica a una chiave di dizionario.
4. **Presenze sulle gare**: non esistono. `TrainingAttendance` ha
   `training_id`, e nessuno ci mette l'id di una gara.
5. **Comunicazioni per evento** (G-35): `AUDIENCE_CRITERION_KINDS`
   ([criteria.ts:20](../../src/lib/audience/criteria.ts)) ha otto criteri e
   nessuno nomina un evento. «Scrivi ai convocati» non è esprimibile.
6. **Capienza dell'evento** (G-32): non c'è la riga su cui metterla.
   `grep -rn "capacity|capien|maxAthletes"` sul dominio eventi non trova nulla.
7. **Sede sulla gara**: `grep -n "site" src/app/matches/page.tsx` restituisce
   **zero occorrenze**. L'allenamento la deriva dalla struttura; la gara non la
   ha affatto.

È la stessa forma della Wave 4, dove *«cinque assenze note poggiano su un solo
mattone: la causale con i flag fiscali»*. Qui il mattone è **l'evento come
riga**.

### Perché la doppia scrittura non è neutrale

Tre difetti misurabili discendono direttamente dal fatto che questi dati sono
array JSON riscritti per intero:

- **Le scritture si perdono.** Ogni operazione è «leggi l'array, modificalo,
  riscrivilo» (`prisma.club.update`). Due richieste concorrenti: l'ultima
  vince, l'altra sparisce. `addClubData` ha un retry che ritenta lo stesso
  conflitto, non un controllo ottimistico.
- **Le presenze si scrivono tre volte.** `saveTrainingAttendance`
  ([simplified-db.ts:3378](../../src/lib/simplified-db.ts)) scrive lo stesso
  fatto nella tabella `training_attendance`, in `clubs.trainings[].attendance`
  e in `club_resource_items.payload.attendance`. Le due UI che l'allenatore usa
  rileggono **la copia JSON**; la fonte con cui si rendicontano i contributi
  pubblici (`src/lib/funding/attendance-measure.ts`) legge **la tabella**. Sono
  due verità sullo stesso appello.
- **L'aggregato si rigenera e cancella.** È il difetto D-1 del capitolo
  seguente.

### La decisione

**L'evento diventa una riga.** Non tutto il JSON: solo ciò che è un *fatto* con
partecipanti, permessi, notifiche e audit — l'evento sportivo, la
partecipazione a un evento, l'appuntamento. Resta JSON ciò che è
*configurazione* del club a bassa frequenza di scrittura e con un dominio già
funzionante: categorie, gruppi operativi, sedi, strutture, programma
settimanale, orari di apertura.

Il precedente è esplicito e recente: **ADR-0039** ha fatto uscire i moduli da
`clubs.document_templates`, **ADR-0088** ha fatto uscire i modelli di documento
dalla stessa colonna. Nessuno dei due ha svuotato `clubs`: hanno estratto
il dominio che aveva bisogno di stato, versioni e permessi, e lasciato il
resto. La Wave 5 fa la terza estrazione, e la fa sulla stessa regola.

La scelta produce **ADR-0098** (l'evento sportivo è una riga, non un elemento
di array) e **ADR-0099** (la partecipazione a un evento è una riga sola:
convocazione, risposta e presenza sono tre colonne dello stesso fatto —
l'estensione di ADR-0086 dagli allenamenti a tutti gli eventi).

---

## 4 — I cinque difetti che vengono prima del piano

La Wave 4 ne aveva tre. Questa ne ha cinque, e tre sono di classe BLOCKER
perché **distruggono dati o rendono inutilizzabile una superficie che il brief
chiede completa**. Vanno chiusi nella lane 0, prima di ogni altra cosa: senza
di essi non esiste una dashboard Parent o Trainer su cui collaudare il resto.

### D-1 — Le richieste di appuntamento delle famiglie si cancellano da sole — **BLOCKER**

Il route della famiglia scrive l'appuntamento **solo** nella colonna
`clubs.appointments`
([appointments/route.ts:175](../../src/app/api/parent-dashboard/%5BathleteId%5D/appointments/route.ts)),
con un `prisma.club.update` diretto che aggira `resources.ts` — l'errore n. 3
dell'elenco di [CLAUDE.md](../../CLAUDE.md) §11. Non tocca mai
`club_resource_items`.

Ma `syncClubAggregateField`
([resources.ts:1641](../../src/lib/server/resources.ts)) **rigenera
`clubs.appointments` da zero** a partire da `club_resource_items`, ed è
invocata a ogni create, update e delete del CRUD generico (righe 3934, 3959,
4662, 5025).

Conseguenza: la prima volta che la segreteria opera un appuntamento da
`/api/v1/appointments`, **tutte le richieste delle famiglie spariscono**.
Nessun errore, nessun audit, nessuna traccia. La pagina `/secretariat` le salva
solo per un caso fortunato — passa da `PATCH /api/v1/clubs`, che rilegge
l'array intero prima di riscriverlo.

**Chiusura**: la sola correzione stabile è far nascere l'appuntamento come riga
propria (lane 4). Nel frattempo, e nello stesso commit della lane 0,
`appointments` va reso **risorsa chiusa** al CRUD generico (`isClosedResource`,
come già `assets`), così che nessuna strada possa rigenerare l'aggregato.

### D-2 — La Dashboard Trainer interroga otto volte una risorsa che il suo ruolo non può leggere — **BLOCKER**

`clubs` sta in `MANAGEMENT_ADMIN_ONLY_RESOURCES`
([access-roles.ts:149](../../src/lib/access-roles.ts)) e **non** sta in
`TRAINER_READ_RESOURCES` (riga 219, quindici voci). Il contesto della dashboard
allenatore
([trainer-dashboard-context.tsx:543](../../src/components/trainer/trainer-dashboard-context.tsx))
esegue otto letture che finiscono tutte su `GET /api/v1/clubs?fields=…` tramite
`readClubFields`. Rispondono **403**.

Fra queste c'è `getClubSettings`
([simplified-db.ts:2087](../../src/lib/simplified-db.ts)), che **inghiotte
l'errore e restituisce `{}`**. Da lì:

- `resolveTrainerDashboardPermissions({})` ricade sui default. **La
  configurazione dei permessi trainer che il club imposta in `/permissions`
  non raggiunge mai la sessione di un allenatore.**
  [11-capabilities.md:217](11-capabilities.md) la dichiara `COMPLETE`.
- `matchConvocationDeadlineDays` ricade sul default 2.
- Il pannello «Programmazione» è **sempre vuoto**: legge `weekly_schedule` e
  `structures` per la stessa strada.
- Annullare un allenamento e salvare le convocazioni falliscono, perché
  passano da `updateClubDataItem` → `PATCH /api/v1/clubs` invece che da
  `PATCH /api/v1/trainings|matches/:id`, che il ruolo **ha** in scrittura.
- Ogni 403 in lettura scrive una riga di audit `resource.access_denied`
  ([[resource]/route.ts:87](../../src/app/api/v1/%5Bresource%5D/route.ts)):
  **ogni caricamento della dashboard allenatore produce circa sette righe di
  audit «negato»** su un club che funziona normalmente. Il registro di
  sicurezza è rumoroso al punto da nascondere un attacco vero.

**Chiusura**: togliere la fallback legacy dal contesto (le liste arrivano già
dalle API v1 per risorsa) ed esporre i permessi trainer e la scadenza
convocazioni da una rotta che il ruolo può leggere — `/api/v1/trainer/…`, che è
già l'unica rotta d'area. Instradare le due scritture sulle rotte corrette.

### D-3 — Un genitore con più figli non raggiunge il secondo — **BLOCKER**

`canAccessPath`, nel ramo dell'area genitore
([access-roles.ts:384](../../src/lib/access-roles.ts)), ammette **un solo**
percorso: `/parent-view/<linkedAthleteId>`, dove `linkedAthleteId` è un valore
**singolo**. Chi lo calcola — `findParentAthleteIdForUser`
([activate/route.ts:47](../../src/app/api/v1/auth/memberships/activate/route.ts))
— fa un `athletes.find(...)` e restituisce **il primo figlio trovato**.

La home genitore disegna correttamente i bottoni per tutti i figli quando
`linkedAthletes.length > 1`, e `getParentLinkedAthletes`
([parent-dashboard.ts:620](../../src/lib/server/parent-dashboard.ts)) li
risolve tutti, in tutti i club, accettando anche il legame per email
verificata. Il clic sul secondo figlio finisce contro la guardia e rimbalza sul
primo.

Due difetti gemelli, dallo stesso disallineamento:

- **Il legame si perde al reload.** `parent-dashboard-context.tsx` riscrive
  `localStorage.activeClub` con un oggetto ridotto **senza
  `linkedAthleteId`**, e `buildActiveClubFromMembership` non lo ricostruisce.
  Un F5 su `/parent-view/[id]` porta a `/account`.
- **Due proprietari della stessa domanda.** `findParentAthleteIdForUser`
  guarda solo `guardians[].linkedUserId`; ignora `parent1`/`parent2` e ignora
  l'email verificata. Un tutore legato solo per email ottiene `null`, viene
  mandato a `/account` e legge «Accesso attivato, ma il profilo collegato non è
  disponibile» — mentre `getParentDashboardData` gli darebbe accesso.

**Chiusura**: `linkedAthleteId` diventa `linkedAthleteIds` (un elenco),
risolto da **un solo** proprietario — `getParentLinkedAthletes` — e usato sia
in `canAccessPath` sia in `activate`. È una correzione di coerenza, non una
funzione nuova. Il brief mette «più figli per Parent» e «Parent con figli in
categorie differenti» fra gli scenari UAT obbligatori: senza questa correzione
non sono eseguibili.

### D-4 — Il dato clinico dei minori è mascherato solo dal browser — **IMPORTANT (sicurezza)**

È il gap **G-33**, e non è «assente»: è peggio, perché sembra esserci.

`medical_certificates` e `simplified_certificates` stanno in
`TRAINER_READ_RESOURCES` accanto ad `athletes`. Il flag `viewMedicalStatus`
([trainer-dashboard-permissions.ts:24](../../src/lib/trainer-dashboard-permissions.ts))
nasce **`true`** (riga 58) e compare in 19 punti, **tutti dentro
`src/components/**`**: zero occorrenze in `src/lib/server/**` e in
`src/app/api/**`. Nasconde schede — allergie, farmaci, BLSD, scadenza
certificato — mentre il dato esce comunque da `GET /api/v1/athletes` e da
`GET /api/v1/medical_certificates`.

Viola **ADR-0058** alla lettera: *«uno stato che si ricava non si scrive, e la
guardia sta in ogni strada che porta al campo»*. E cade sotto **ADR-0019**,
che dichiara privacy, retention e audit bloccanti per la produzione: qui si
tratta di dati sanitari di minori.

**Chiusura**: un permesso vero, `clinical.read`, con default **negato** per
ogni ruolo tranne owner e club_manager, applicato **lato server** nella
proiezione dei campi e sulle rotte dei certificati — non un flag di
interfaccia. Il modello è ADR-0077 (i compensi hanno permessi propri, il
default è negato), che il §22 del [37](37-wave-4-planning.md) indicava già come
il pattern per G-33.

### D-5 — Il perimetro atleti dell'allenatore lo decide il client — **IMPORTANT (sicurezza)**

Il filtro server che restringe l'allenatore alle proprie categorie
([resources.ts:3491](../../src/lib/server/resources.ts)) si attiva **solo se il
chiamante passa `trainer_dashboard=1`** nella query string (riga 3498). Un
filtro che si accende su un parametro scelto da chi chiama non è un confine.

E nella stessa `Promise.all` il contesto chiama anche `getClubAthletes` →
`GET /api/v1/simplified_athletes?club_id=…` **senza** quel parametro.
`simplified_athletes` è in `TRAINER_READ_RESOURCES`: la risposta contiene
**l'anagrafica completa di tutti gli atleti del club**. Il filtro applicato
dopo, nel browser, è cosmetico: il dato è già uscito.

**Chiusura**: il filtro diventa **implicito** quando `scope.activeRole ===
"trainer"`, non più opt-in, e la fallback legacy sparisce dal contesto. Con un
test in `tests/auth/` che, tolto il filtro, deve fallire.

### Riepilogo, e cosa impone

| # | Difetto | Classe | Lane |
|---|---|---|---|
| D-1 | Le richieste di appuntamento si cancellano | **BLOCKER** — perdita dati | 0 → 4 |
| D-2 | Il trainer perde permessi e scritture per un 403 inghiottito | **BLOCKER** — superficie inutilizzabile | 0 → 7 |
| D-3 | Il genitore con più figli non raggiunge il secondo | **BLOCKER** — superficie inutilizzabile | 0 → 6 |
| D-4 | Il dato clinico è mascherato solo dal browser | **IMPORTANT** — sicurezza, minori | 0 → 8 |
| D-5 | Il perimetro atleti del trainer è opt-in del client | **IMPORTANT** — sicurezza | 0 → 8 |

I tre BLOCKER hanno una proprietà in comune che vale la pena nominare: **nessuno
è visibile dai gate**. 3.632 test verdi, typecheck pulito, build a 153 route, e
tre superfici del prodotto che non funzionano. È la stessa lezione del Blocco E
e del collaudo E-13: i difetti che stanno fra il clic e la rete, o dentro un
`catch` che restituisce `{}`, non li vede un test che sostituisce il trasporto.
La UAT del §22 è costruita su questa constatazione.

---

## 5 — Il registro dei gap: 80 voci verificate

Ogni voce ha un **verdetto** — cosa è vero a HEAD — e un'**azione** — cosa ne
facciamo. I quattro verdetti sono quelli chiesti dal brief:

- `CONFIRMED` — il gap esiste, e il codice lo dimostra;
- `PARTIAL` — esiste a metà: una parte funziona, una parte no;
- `ALREADY SOLVED` — è già risolto, non serve nulla;
- `FALSE POSITIVE` — dichiarato aperto (o dichiarato chiuso) da una fonte che
  il codice smentisce.

Le quattro azioni sono `EXTEND`, `NEW`, `NO ACTION`, `DEFER`. La regola, imposta
dal brief e coerente con l'audit anti-duplicazione della Wave 4: **si preferisce
sempre `EXTEND` quando EasyGame possiede già il dominio corretto**, e `NEW` va
motivato dimostrando che il dominio esistente non può essere esteso.

### A — Attività sportiva (19 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-01 | Calendario unico degli eventi (**G-31**) | `CONFIRMED` | **NEW** | Non c'è niente da unire: allenamenti e gare non hanno un'entità comune |
| W5-02 | L'allenamento non ha un modello: array JSON riscritto per intero dal browser | `CONFIRMED` | **NEW** | Nessuna chiave unica, nessuna concorrenza, nessuna FK verso l'atleta |
| W5-03 | La gara non ha un modello, né sede, né filtro sede | `CONFIRMED` | **NEW** | `grep -n "site" src/app/matches/page.tsx` restituisce zero occorrenze |
| W5-04 | La convocazione non è un'entità: **dieci grafie** nel payload della gara | `CONFIRMED` | **NEW** | Non si dà un permesso, un audit o una notifica a una chiave di dizionario |
| W5-05 | L'RSVP è configurabile solo con un campo che nessun file di produzione scrive | `FALSE POSITIVE` | `EXTEND` | La KB lo dichiara `COMPLETE`. Il server lo è; il prodotto no |
| W5-06 | RSVP sulle gare (**G-20** parziale, `W2-08`) | `CONFIRMED` | `EXTEND` | `findTraining` legge solo `club.trainings`: la gara non ha dove ospitare una risposta |
| W5-07 | Presenze scritte in tre posti; le due UI rileggono la copia JSON | `CONFIRMED` | `EXTEND` | La tabella alimenta la rendicontazione dei bandi; il JSON alimenta lo schermo |
| W5-08 | Presenze sulle gare: non esistono | `CONFIRMED` | `EXTEND` | `TrainingAttendance.training_id` non ospita l'id di una gara |
| W5-09 | Presenze per persona con percentuale (**G-34**, **G-55**) | `FALSE POSITIVE` | `EXTEND` | `CategoryAthleteTable` esiste ed è montata in `/reports`. Manca **solo** la colonna «senza risposta» |
| W5-10 | Capienza dell'evento (**G-32**) | `CONFIRMED` | `EXTEND` | Diventa un campo sulla riga nuova. **La lista d'attesa resta fuori** |
| W5-11 | Nessuna validazione dell'evento contro orari di apertura e disponibilità impianto | `CONFIRMED` | `EXTEND` | `isDateTimeWithinOpeningHours` e `FieldAvailabilityV2` esistono e nessuno li chiama per un evento |
| W5-12 | Sede sull'evento | `CONFIRMED` | `EXTEND` | L'allenamento la deriva dalla struttura, in modo fragile; la gara non la ha |
| W5-13 | Piani di lavoro tecnici, esercizi, carichi | `CONFIRMED` | `DEFER` | Dominio nuovo, nessun pezzo riusabile. Wave 6 |
| W5-14 | Comunicazioni collegate agli eventi (**G-35**) | `CONFIRMED` | `EXTEND` | Due criteri nuovi in `AUDIENCE_CRITERION_KINDS`, dentro l'unico risolutore (ADR-0087) |
| W5-15 | Il perimetro dell'allenatore in scrittura sugli eventi non esiste | `CONFIRMED` | `EXTEND` | `trainings` e `matches` sono in `TRAINER_WRITE_RESOURCES` senza vincolo di categoria |
| W5-16 | Gli attesi dell'appello ignorano gruppo e sede, e il numero viene **persistito** (`W4-R20`) | `CONFIRMED` | `EXTEND` | `training-automation.ts` usa `athleteMatchesAnyCategory` con `groupIds` disponibile dodici righe sopra |
| W5-17 | L'assegnazione dell'allenatore non è rimappata al rollover di stagione | `CONFIRMED` | `EXTEND` | `trainers` non è fra i tipi di rollover: dopo il cambio stagione la dashboard si svuota |
| W5-18 | Categorie, gruppi operativi, compatibilità | `ALREADY SOLVED` | `NO ACTION` | ADR-0038, ADR-0030, ADR-0055; tabella vera per l'appartenenza, con `site_id` |
| W5-19 | Stagione sugli eventi: scoping, riporto, «mai copiati» | `ALREADY SOLVED` | `NO ACTION` | `SEASON_SCOPED_DATA_TYPES` e `SEASON_NEVER_COPIED_DATA_TYPES` sono corretti |

### B — Self-service della famiglia e iscrizione online (17 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-20 | La famiglia non ha nessun riscontro sulla propria domanda di iscrizione | `CONFIRMED` | `EXTEND` | `FormSubmission` ha già `status`: manca la lettura per la famiglia |
| W5-21 | Rinnovo e re-iscrizione self-service | `CONFIRMED` | `EXTEND` | Il riporto stagionale è gestionale (`seasons.change`); la famiglia non partecipa |
| W5-22 | Modifica dei dati anagrafici consentiti alla famiglia | `CONFIRMED` | `EXTEND` | Passa dal canale moduli, non da una seconda porta di scrittura sull'anagrafica (ADR-0040) |
| W5-23 | «Paga ora» disabilitato nell'area genitore, in due punti | `CONFIRMED` | `EXTEND` | L'adattatore Stripe è reale; l'unico canale che funziona è il link pubblico |
| W5-24 | Ricevuta non scaricabile dalla famiglia | `CONFIRMED` | `EXTEND` | Per `parent` il permesso su `receipts` è sempre negato: il gate deve essere il **legame**, non il ruolo |
| W5-25 | La famiglia non può accettare né revocare un consenso | `CONFIRMED` | `EXTEND` | `canRecordConsentDecision` esclude `parent`; l'unica via è il modulo pubblico, dove decide l'operatore |
| W5-26 | L'evidenza del consenso non registra IP né user-agent | `CONFIRMED` | `EXTEND` | `recordConsentDecision` non passa `request`: `AuditLog.ip` e `user_agent` restano nulli |
| W5-27 | Il certificato caricato dalla famiglia non diventa un certificato | `CONFIRMED` | `EXTEND` | Finisce in `sharedDocuments`; `medical_certificates` non lo vede mai |
| W5-28 | Richieste della segreteria alla famiglia: il canale non esiste | `CONFIRMED` | `EXTEND` | `form-request.ts` è il parser di un invio, non un sistema di richieste |
| W5-29 | Le notifiche sono caricate nel payload e nessuna pagina le disegna; «vedi tutte» rimbalza | `CONFIRMED` | `EXTEND` | `/notifications` è un percorso gestionale: un genitore che clicca viene respinto |
| W5-30 | Bacheca per le famiglie: il backend è pronto, nessuna pagina lo chiama | `CONFIRMED` | `EXTEND` | `GET /api/v1/announcements?mine=1` esiste ed è già scritto per il destinatario |
| W5-31 | Calendario, allenamenti e gare lato Parent | `PARTIAL` | `EXTEND` | L'RSVP allenamenti funziona; la convocazione si **indovina** da nove grafie |
| W5-32 | Il selettore figlio non funziona (**D-3**) | `CONFIRMED` | `EXTEND` | `canAccessPath` ammette un solo `linkedAthleteId` |
| W5-33 | Il legame si perde al reload | `CONFIRMED` | `EXTEND` | `localStorage.activeClub` viene riscritto senza `linkedAthleteId` |
| W5-34 | Due risolutori del legame genitore-atleta, con regole diverse | `CONFIRMED` | `EXTEND` | `getParentLinkedAthletes` accetta l'email verificata; `findParentAthleteIdForUser` no |
| W5-35 | Zero audit sulle letture della famiglia | `CONFIRMED` | `EXTEND` | Aprire il certificato medico di un minore non lascia traccia |
| W5-36 | Il legame genitore-atleta è JSON senza FK né vincolo | `CONFIRMED` | `DEFER` | Tabella `athlete_guardians`: è un WP a sé, e la Wave 5 non lo regge |

### C — Workflow documenti Club ↔ Parent (9 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-37 | **Due archivi del fascicolo atleta** (`AU-5` / `D-H`) | `CONFIRMED` | `EXTEND` | Era **il prerequisito della Wave 3** e non è mai stato eseguito. La sigla `W3-B` è stata riassegnata ad altro |
| W5-38 | Il workflow richiesta → carico → verifica → decisione esiste, ma non ha righe proprie | `PARTIAL` | **NEW** | Gli stati sono già scritti e giusti; manca il **posto** dove metterli |
| W5-39 | La decisione di accettare o rifiutare non lascia audit | `CONFIRMED` | `EXTEND` | Nessuna delle due aree chiama `recordAuditEvent`. Il catalogo delle azioni esiste già |
| W5-40 | Attachment Core non è raggiungibile da un genitore | `CONFIRMED` | `EXTEND` | Il permesso si eredita dall'oggetto, e per `parent` è sempre negato |
| W5-41 | `Asset` non ha `organization_id`: il confine è un prefisso di stringa | `CONFIRMED` | `EXTEND` | Cinque lettori, tre modi diversi di ricostruire il confine |
| W5-42 | L'upload della famiglia viaggia in JSON base64 | `CONFIRMED` | `EXTEND` | Un terzo di banda in più e tre copie in memoria, mentre allegati e moduli sono già multipart |
| W5-43 | Nessun motore sorveglia la scadenza di una richiesta documentale | `CONFIRMED` | `EXTEND` | `listExpiringAttachments` esiste e ha **un solo** chiamante, ristretto agli atleti |
| W5-44 | `medical_certificates.status` è scritto e congelato, e diverge dallo stato ricalcolato | `CONFIRMED` | `EXTEND` | Viola ADR-0058: uno stato che si ricava non si scrive |
| W5-45 | Il fascicolo dell'atleta non esiste come oggetto | `CONFIRMED` | `EXTEND` | Quattro collezioni eterogenee affiancate in una scheda |

### D — Appuntamenti (9 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-46 | Le richieste della famiglia si cancellano da sole (**D-1**) | `CONFIRMED` | **NEW** | L'aggregato si rigenera da righe che non contengono la richiesta |
| W5-47 | Nessuna conferma, nessun rifiuto: la richiesta resta in attesa per sempre | `CONFIRMED` | **NEW** | Nessun codice scrive `confirmed`. Le etichette esistono solo nel formatter generico |
| W5-48 | Nessun modulo di dominio proprietario | `CONFIRMED` | **NEW** | La logica vive nel route handler e in una pagina client: gli errori 2 e 3 di CLAUDE.md §11 |
| W5-49 | Disponibilità: solo orari di apertura, nessuno slot, nessun controllo di occupazione | `CONFIRMED` | **NEW** | Due famiglie possono chiedere lo stesso orario, e la segreteria inserirne un terzo sopra |
| W5-50 | Nessuna notifica verso la famiglia; zero email | `CONFIRMED` | `EXTEND` | `createClubNotifications` e `sendNotificationEmails` esistono e non vengono chiamate |
| W5-51 | Nessuna sede sull'appuntamento; gli orari di apertura sono uno solo per club | `CONFIRMED` | `EXTEND` | Un club con due sedi non può dire che una apre solo il martedì |
| W5-52 | Il trainer è escluso da lettura e scrittura | `CONFIRMED` | `EXTEND` | `appointments` non è in nessuna delle due liste del ruolo |
| W5-53 | Nessun audit, id collidibili, data e ora come due stringhe, fuso orario | `CONFIRMED` | **NEW** | Identificativi da orologio; il giorno della settimana si calcola in ora locale del server |
| W5-54 | Il confine «solo i miei» è un OR permissivo | `CONFIRMED` | `EXTEND` | Vale l'atleta **oppure** l'utente richiedente: due condizioni in alternativa, non in congiunzione |

### E — Dashboard Parent e Trainer (12 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-55 | I permessi trainer configurati non arrivano mai all'allenatore (**D-2**) | `CONFIRMED` | `EXTEND` | Un 403 inghiottito da un blocco che restituisce un oggetto vuoto |
| W5-56 | Il perimetro atleti del trainer è opt-in del client (**D-5**) | `CONFIRMED` | `EXTEND` | Il filtro si accende su un parametro scelto da chi chiama |
| W5-57 | Il dato clinico è mascherato solo dal browser (**G-33**, **D-4**) | `CONFIRMED` | **NEW** | Serve un permesso vero, non un flag di interfaccia. Modello: ADR-0077 |
| W5-58 | Salvare le convocazioni e annullare un allenamento rispondono 403 | `CONFIRMED` | `EXTEND` | Passano da `/api/v1/clubs`; la strada legittima esiste e non è usata |
| W5-59 | Il pannello «Programmazione» è sempre vuoto per l'allenatore | `CONFIRMED` | `EXTEND` | Stessa causa di W5-55 |
| W5-60 | L'allenatore non vede i propri documenti dalla propria dashboard | `CONFIRMED` | `EXTEND` | Il pannello documenti è montato solo nell'area gestionale |
| W5-61 | `board.read` senza schermata; le note di segreteria filtrate e mai mostrate | `CONFIRMED` | `EXTEND` | Lavoro fatto e buttato a ogni caricamento |
| W5-62 | Gli alert operativi si calcolano nel browser, e il server li persiste come arrivano | `CONFIRMED` | `EXTEND` | Titolo, messaggio e link vengono dal client e finiscono in una email |
| W5-63 | Nessun invariante responsive sulle pagine `trainer-dashboard` | `CONFIRMED` | `EXTEND` | Il test copre l'area **gestionale** degli allenatori, non quella che si usa in palestra |
| W5-64 | Dodici file trainer orfani, circa 3.400 righe, e la scheda tecnica non portata sulla v2 | `CONFIRMED` | `EXTEND` | `WP-18`, `D9`. La scheda tecnica richiede una decisione: portarla o cancellarla |
| W5-65 | `/login/trainer` è un login **simulato**, non protetto dal middleware | `CONFIRMED` | `EXTEND` | Il commento nel file lo dichiara. La KB lo elenca fra le rotte pubbliche valide |
| W5-66 | Ogni caricamento della dashboard trainer scrive circa sette righe di audit «negato» | `CONFIRMED` | `EXTEND` | Il registro di sicurezza è rumoroso al punto da nascondere un attacco vero |

### F — Ruoli, permessi, scope (8 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-67 | **I ruoli personalizzati creati dal club non esistono** | `FALSE POSITIVE` | `DEFER` | Nessuna tabella dei ruoli o dei permessi. L'unico «ruolo personalizzato» è un'etichetta in `clubs.staff_members` **senza effetto sull'autorizzazione**. Vedi §12 |
| W5-68 | `/dashboard/access-management` è un mock dichiarato `COMPLETE` (**G-57**) | `CONFIRMED` | `DEFER` | Tre nomi cablati e un token generato con il generatore casuale del browser. Non è «da migliorare»: la superficie non esiste |
| W5-69 | Sede e categoria non sono confini di sicurezza, solo filtri | `CONFIRMED` | `EXTEND` | Un trainer di una sola sede legge gli atleti di tutte |
| W5-70 | Il catalogo dei permessi è frammentato in tre generazioni | `CONFIRMED` | `EXTEND` | 22 chiavi con etichetta, circa 14 predicati booleani senza chiave, 20 flag di sola interfaccia |
| W5-71 | `canAccessClubResource` è **allow-by-default** per collaborator e staff | `CONFIRMED` | `EXTEND` | Una risorsa nuova è concessa finché qualcuno non la mette in una blacklist. Il silenzio concede |
| W5-72 | Il registro API non dichiara i permessi, ed esiste in tre copie | `CONFIRMED` | `DEFER` | Nessun test le riconcilia |
| W5-73 | Sette entitlement su dieci non gattano nulla | `CONFIRMED` | `NO ACTION` | Compreso `multi_site`. Catalogo senza consumatore: non è un difetto che la Wave 5 introduce né aggrava |
| W5-74 | Cinque namespace API fuori da `/api/v1` e fuori dal registro | `CONFIRMED` | `EXTEND` | `/api/parent-dashboard/**` è il canale della famiglia e non compare in `docs/api-registry.md` |

### G — Residui e falsi positivi documentali (6 voci)

| # | Gap | Verdetto | Azione | Perché |
|---|---|---|---|---|
| W5-75 | `W4-R7` — compensi e liquidazioni non si classificano | `CONFIRMED` | `DEFER` | Wave 6, previa decisione di prodotto. Vedi §21 |
| W5-76 | `W4-R18` — il consenso non è consultato da nessun percorso di invio | `CONFIRMED` | `DEFER` | Richiede **prima** una decisione di prodotto e legale. La Wave 5 prende solo il presidio che impedisce di peggiorarlo. Vedi §21 |
| W5-77 | **G-29** profilo sanitario esteso | `FALSE POSITIVE` | `NO ACTION` | Gruppo sanguigno, allergie, farmaci e BLSD esistono e sono editabili. Manca solo «intolleranze» come campo distinto |
| W5-78 | **G-52** federazioni come entità del club | `FALSE POSITIVE` | `DEFER` | La struttura c'è. Manca il **segnaposto documentale**: matricola e data non arrivano ai documenti |
| W5-79 | `AU-4` — il componente di conferma presenza dichiarato orfano | `FALSE POSITIVE` | `NO ACTION` | Non è più vero: la catena è viva dalla Wave 2 |
| W5-80 | Cinque righe di documentazione che il codice smentisce | `FALSE POSITIVE` | `NO ACTION` | Correzione di documentazione, non di codice. Elenco qui sotto |

**Le sei righe di documentazione da correggere nel primo commit della Wave:**

| Fonte | Dice | Il codice dice |
|---|---|---|
| [11-capabilities.md](11-capabilities.md) | RSVP `COMPLETE` | Il campo che lo abilita non lo scrive nessuna schermata |
| [11-capabilities.md](11-capabilities.md) | Parent dashboard `COMPLETE` | Selettore figli rotto, «Paga ora» disabilitato, notifiche non disegnate, bacheca assente |
| [11-capabilities.md](11-capabilities.md) | Permessi trainer `COMPLETE` | La configurazione non raggiunge mai l'allenatore |
| [11-capabilities.md](11-capabilities.md) | Access management `COMPLETE` | È un mock, senza nessuna chiamata di rete |
| [11-capabilities.md](11-capabilities.md) | Segreteria `COMPLETE` | Nessuna azione porta un appuntamento da «in attesa» a «confermato» |
| [CLAUDE.md](../../CLAUDE.md) §11.8 | «i pagamenti online rispondono 501» | L'adattatore Stripe è reale e cablato; il 501 è il fallback per provider senza adattatore |

### Il conto

| Verdetto | Voci |
|---|---|
| `CONFIRMED` | **69** |
| `PARTIAL` | **2** |
| `ALREADY SOLVED` | **2** |
| `FALSE POSITIVE` | **7** |
| **Totale** | **80** |

| Azione | Voci |
|---|---|
| `EXTEND` | **55** |
| `NEW` | **11** |
| `DEFER` | **8** |
| `NO ACTION` | **6** |
| **Totale** | **80** |

Gli **11 `NEW` si concentrano in quattro entità**, non in undici: l'evento
sportivo con la sua partecipazione (W5-01…04), la richiesta documentale con il
suo deposito (W5-38), l'appuntamento con la sua disponibilità (W5-46…49,
W5-53) e il permesso clinico (W5-57). Tutto il resto della Wave — **55 voci su
80** — è estensione di domini che EasyGame già possiede.

---

## 6 — EXTEND contro NEW: il mattone della Wave 5

### Le entità nuove, e perché il dominio esistente non basta

**1. `club_events` — l'evento sportivo.**
Il dominio esistente è una colonna JSON riscritta per intero da un client. Non
regge una chiave unica, non regge una chiave esterna, non regge due scritture
concorrenti, non regge un permesso per riga e non regge un audit. Le sette
conseguenze sono al §3. **Non è estendibile**: a un array JSON si può aggiungere
un campo, non un vincolo.

Assorbe `clubs.trainings` e `clubs.matches` con un campo `kind`
(`training | match`), lasciando la porta aperta a un terzo tipo senza una terza
tabella. Porta `season_id`, `site_id`, `structure_id`, `capacity`,
`rsvp_required`, `rsvp_deadline`, `status`, e una colonna di versione per il
controllo ottimistico.

**2. `club_event_participants` — la partecipazione.**
È l'estensione di ADR-0086 da «l'allenamento» a «l'evento»: convocazione,
risposta della famiglia e presenza sono **tre colonne dello stesso fatto**, sulla
stessa riga, senza scritture incrociate. `TrainingAttendance` è già esattamente
questa tabella per gli allenamenti — ha `status`, `rsvp_status`, `rsvp_note`,
`rsvp_at`, `rsvp_by_user_id` e la chiave unica giusta. La Wave 5 **non ne crea
una seconda**: la rinomina, sostituisce `training_id` con `event_id`, aggiunge
`convocation_status` e `convocated_at`, e mantiene un alias durante la
migrazione. È il caso limite fra `EXTEND` e `NEW`: lo classifichiamo `NEW`
perché cambia la chiave, ma il codice che la usa — e i tre test che la coprono —
sopravvivono quasi intatti.

**3. `document_requests` e `document_submissions` — la richiesta e il deposito.**
Il workflow **esiste già per intero** (§17) con gli stati giusti. Ciò che manca
è che richiesta e decisione siano **righe**, non elementi di un array dentro
`athletes.data`, senza un proprio `organization_id`, senza scadenza sorvegliata
e senza audit. Il modello da imitare è `ConsentRecord`: append-only, stato
corrente **derivato** dall'ultima riga, evidenza come puntatore e non come
copia. I **byte non generano una tabella nuova**: passano da Attachment Core,
che è già il posto giusto (ADR-0034).

**4. `appointments` e `appointment_slots` — l'appuntamento e la disponibilità.**
Il dominio esistente non ha un proprietario: la logica sta in un route handler e
in una pagina client, i due scrittori usano due forme diverse dello stesso
oggetto, e uno dei due cancella l'altro (D-1). Estendere significherebbe
consolidare l'assenza di proprietario. Vale la regola di CLAUDE.md §2: **un
dominio ha un punto di ingresso unico**.

**5. `clinical.read` — il permesso sul dato sanitario.**
Non è una tabella: è una chiave di permesso con matrice per ruolo esplicita e
default negato, sullo stampo di `src/lib/sport-work/permissions.ts`. È `NEW`
perché oggi **non esiste nessun permesso** su quel dato: esiste un flag di
interfaccia che nasce acceso.

### Cosa NON diventa una tabella, e perché

| Resta JSON | Perché |
|---|---|
| `categories`, `category_groups` | Configurazione a bassa frequenza, con un dominio funzionante (ADR-0038, ADR-0055) e una tabella vera già al posto giusto per l'appartenenza |
| `club_sites` | Idem. Il modello sede funziona; ciò che manca è che la sede sia un **confine**, e quello è un problema di autorizzazione, non di persistenza |
| `structures`, `opening_hours` | Configurazione. La Wave 5 aggiunge solo la **capienza** e le **chiamate di validazione** che oggi mancano |
| `weekly_schedule` | È la ricetta da cui si generano gli eventi. Resta la ricetta; cambia solo il prodotto |
| `secretariat_notes`, `discounts`, `payment_plans` | Fuori perimetro |

### L'audit anti-duplicazione

Prima di ogni riga di codice, la Wave 5 dichiara di **non** creare:

| Cosa esiste già | Chi lo possiede | Cosa la Wave 5 fa |
|---|---|---|
| Sistema file | `src/lib/server/attachments.ts` (ADR-0034) | Ci fa passare i documenti della famiglia. **Chiude** il secondo archivio |
| Notifiche | `src/lib/server/club-notifications.ts`, una riga per destinatario | Aggiunge tipi, non canali |
| Registro consegne | `CommunicationDelivery` (ADR-0084) | Ci scrive le email nuove. Nessun secondo registro |
| Risolutore del pubblico | `src/lib/audience/` (ADR-0087) | Aggiunge **due criteri**, dentro l'enum chiusa |
| Automazioni | `src/lib/automations/` (ADR-0083) | Aggiunge **un trigger** al catalogo chiuso. **Nessun bus di eventi** |
| Consensi | `src/lib/server/consents.ts` (ADR-0090) | Aggiunge un decisore «soggetto» e l'evidenza di rete. Nessun secondo registro |
| Presenze e RSVP | `TrainingAttendance` (ADR-0086) | La **estende** all'evento. Nessuna seconda tabella |
| Categorie, gruppi, sedi | `club-sites.ts`, `category-*` | Le usa. Non le riscrive |
| Pagamenti e link | `payment-transactions.ts`, `payment-links.ts` | Riusa il checkout esistente con l'identità di sessione. Nessun secondo checkout |
| Audit | `src/lib/server/audit.ts` | Aggiunge azioni al catalogo. Nessun secondo registro |
| Moduli online | `form-submissions.ts` (ADR-0039, ADR-0040) | È il canale dell'iscrizione **e** del rinnovo. Nessun secondo motore di iscrizione |

---

## 7 — Cosa NON sviluppiamo

Diviso in tre, perché le ragioni sono tre diverse.

### 7.1 — Cosa non copiamo da Golee

Golee è stato un **benchmark per trovare capability mancanti**, non un modello
da riprodurre. Restano fuori, con la stessa motivazione della Wave 4:

- **Tessera digitale del tesserato** (G-72): senza un'entità tesseramento
  (G-30) è una grafica, non una funzione.
- **Pacchetti, abbonamenti e carnet** (G-38): dominio nuovo, di taglia `XL`, e
  nessuna società del perimetro attuale lo ha chiesto.
- **Valutazione sportiva su criteri configurabili** (G-62): un motore di schede
  tecniche è un prodotto dentro il prodotto.
- **Sincronizzazione con un portale federale** (G-63): un solo portale reale
  raggiungibile, e nessun accordo.
- **App dedicata alla famiglia** (G-59): differita da **ADR-0025**.
- **Assemblee, ordini del giorno, deleghe, verbali** (G-48, G-49) e
  **safeguarding** (G-50): materia statutaria e normativa, non software.
- **Ricerca globale e palette da tastiera** (G-65, G-66): ergonomia, non
  capability.

### 7.2 — Cosa è nel perimetro tematico e resta fuori per dimensione

Sono le otto voci `DEFER` del §5, elencate al §25. Inoltre, **dentro** le aree
che tocchiamo, restano fuori per scelta esplicita:

- **Lista d'attesa** sull'evento: la Wave 5 mette la capienza e il conteggio,
  non la coda. Una coda ha regole di priorità che nessuno ha ancora dichiarato.
- **Stato «forse» nell'RSVP**: escluso da ADR-0086, e lo confermiamo.
- **RSVP e iscrizione senza account** (`W2-09`): riuserebbe il token opaco di
  ADR-0085, ma apre una superficie pubblica di scrittura che va progettata a
  parte.
- **Pagamento contestuale nel modulo di iscrizione** (G-37) e **sconti
  automatici o per fratelli** (G-36, G-61): l'iscrizione online della Wave 5
  produce una domanda e un riscontro, non un incasso.
- **Firma elettronica** del documento accettato: ADR-0091 dichiara il tetto —
  tre significati su quattro — e non lo alziamo.

### 7.3 — Cosa non tocchiamo affatto

- **Il mobile** (`easygamemobile/`): ADR-0025. Nessuna riga, salvo un
  adeguamento reso necessario da un cambio di contratto API deciso lato Web — e
  in quel caso dichiarato nel commit.
- **Contabilità, prima nota, rendiconto, fiscalità**: dominio della Wave 4.
  L'unico punto di contatto è W5-75, che rinviamo.
- **Lavoro sportivo, bandi e contributi**: domini chiusi con proprietario unico.
  La Wave 5 non ci scrive.
- **Il motore documentale e il catalogo dei modelli**: Wave 3. La Wave 5 usa il
  fascicolo, non il generatore.

---

## 8 — I workstream

Dieci lane, come la Wave 4. La prima non costruisce niente: chiude.

### 5A — I difetti che vengono prima

Chiude D-1…D-5. È una **barriera**: nessuna altra lane parte prima che questa
sia unita, perché tre delle cinque rendono inutilizzabile una superficie su cui
tutto il resto va collaudato.

- `appointments` diventa risorsa **chiusa** al CRUD generico: nessuna strada può
  più rigenerare l'aggregato e cancellare le richieste delle famiglie (D-1);
- la dashboard trainer smette di interrogare `clubs`: le liste arrivano dalle
  API per risorsa, e i permessi trainer più la scadenza convocazioni escono da
  `/api/v1/trainer/preferences`, che il ruolo può leggere (D-2);
- le due scritture del trainer vanno su `PATCH /api/v1/trainings|matches/:id`;
- `linkedAthleteId` diventa `linkedAthleteIds`, con **un solo** proprietario
  della domanda, e sopravvive al reload (D-3);
- il filtro del perimetro allenatore diventa implicito sul ruolo, e la fallback
  che perde l'anagrafica completa sparisce (D-5);
- `clinical.read` nasce qui come **negazione**: il dato clinico esce dalla
  proiezione per chi non lo ha (D-4). Il catalogo completo arriva in 5B.

**Test obbligatori**: uno per difetto, e per i tre di sicurezza un test che
**deve fallire** se si toglie la guardia.

### 5B — Permessi: il catalogo con le chiavi, e il dato clinico

- I circa 14 predicati booleani senza chiave (`documents/`, `members/`,
  `attachment-permissions`) prendono una chiave, un'etichetta e una matrice per
  ruolo, sullo stampo di `src/lib/sport-work/permissions.ts` (W5-70);
- nasce `src/lib/health/permissions.ts` con `clinical.status_read`,
  `clinical.read`, `clinical.manage` (W5-57, §12);
- il perimetro per **gruppo operativo** diventa un confine dove il dato è
  personale — atleti, presenze, documenti — e resta un filtro dove non lo è
  (W5-69);
- `canAccessClubResource` smette di essere allow-by-default: una risorsa nuova
  deve dichiararsi, come già fa per il confine multi-tenant (ADR-0094). È la
  chiusura di `W2-13` (W5-71).

### 5C — L'evento sportivo: la riga, la migrazione, il congelamento

Il mattone. Nasce `club_events`, nasce `club_event_participants` come
evoluzione di `TrainingAttendance`, migrano i dati, e le due colonne JSON
diventano **sola lettura**: `trainings` e `matches` escono da
`CLUB_RESOURCE_TYPES`.

- migrazione una tantum da `clubs.trainings` + `clubs.matches` +
  `club_resource_items`, con le dieci grafie della convocazione normalizzate
  **una volta sola, nella migrazione**, mai più a runtime;
- `src/lib/server/events.ts` diventa l'unico scrittore; `src/lib/events/` il
  dominio puro (stati, transizioni, conflitti, ricorrenze);
- `RESOURCE_BOUNDARIES` dichiara il confine delle due tabelle nuove, altrimenti
  `resources.ts` non si carica (ADR-0094);
- la generazione automatica dal programma settimanale scrive nella tabella e
  smette di scrivere `clubs.trainings` (chiude `STAG-02`);
- gli attesi dell'appello passano da `athleteMatchesGroup` e non più da
  `athleteMatchesAnyCategory` (`W4-R20`, W5-16).

Produce **ADR-0098** e **ADR-0099**.

### 5D — Il fascicolo unico: Attachment Core e il workflow documenti

- nascono `document_requests` e `document_submissions` (§17);
- i byte passano da Attachment Core; l'upload della famiglia diventa
  **multipart** e ottiene il permesso per il **legame**, non per il ruolo;
- travaso una tantum di `athletes.data.sharedDocuments` e degli `Asset` dei
  bucket `shared-documents` e `parent-documents` verso `attachments`;
- `src/lib/shared-documents.ts` e le due rotte legacy restano **in sola
  lettura** per una release, poi spariscono;
- audit su richiesta, deposito e decisione, con il motivo nel metadato;
- la scadenza della richiesta entra nel giro notturno esistente, senza un
  motore nuovo;
- il certificato medico accettato **promuove** una riga in
  `medical_certificates`, e `status` smette di essere scritto (W5-27, W5-44).

Chiude `AU-5` / `D-H`, il prerequisito saltato dalla Wave 3.

### 5E — Appuntamenti: il dominio, la disponibilità, il ciclo di vita

- nascono `appointments` e `appointment_slots`;
- `src/lib/server/appointments.ts` è l'unico scrittore; `src/lib/appointments/`
  ospita la macchina a stati e il calcolo della disponibilità;
- `starts_at`/`ends_at` come istante assoluto con fuso dichiarato: finiscono le
  due stringhe separate;
- indice **unico parziale** su (club, operatore, inizio) per gli stati vivi:
  la doppia prenotazione la impedisce il database, non il codice;
- chiave di idempotenza contro il doppio clic, versione per il controllo
  ottimistico;
- la riprogrammazione **crea una riga nuova** e chiude la vecchia: l'audit
  resta leggibile;
- notifiche verso la famiglia — conferma, rifiuto, riprogrammazione,
  cancellazione — e email sui due eventi che una famiglia deve sapere senza
  aprire l'applicazione.

### 5F — Calendario unico, gare al pari, comunicazioni per evento

- una pagina calendario che elenca gli eventi di entrambi i tipi, con filtro
  sede, categoria, gruppo, stagione e tipo;
- la gara ottiene ciò che l'allenamento ha già: sede, filtro sede, RSVP,
  presenze, capienza (W5-03, W5-06, W5-08, W5-12);
- l'RSVP diventa **configurabile dalle schermate**: il toggle «richiedi
  conferma» e la scadenza entrano nei form di creazione e modifica. È la riga
  che sblocca circa 900 righe di dominio già scritte e già testate (W5-05);
- due criteri nuovi nel risolutore del pubblico: **convocati a un evento** e
  **senza risposta a un evento** (W5-14);
- la colonna «senza risposta» entra nella tabella presenze per atleta già
  montata in `/reports` (W5-09);
- validazione dell'evento contro orari di apertura e disponibilità del campo
  (W5-11).

### 5G — Iscrizione online e rinnovo: il riscontro alla famiglia

§16. Non un motore nuovo: il motore moduli esiste ed è corretto.

### 5H — Dashboard Parent

§13.

### 5I — Dashboard Trainer

§14.

### 5J — Pulizia, documentazione, UAT

- rimozione dei dodici file trainer orfani, di `/login/trainer`, dei due file
  morti dell'area genitore e del modale segnaposto degli appuntamenti (W5-64,
  W5-65);
- decisione sulla scheda tecnica dell'atleta: portarla sulla v2 o cancellarla.
  Non resta dov'è;
- i cinque namespace fuori da `/api/v1` entrano nel registro (W5-74);
- correzione delle sei righe di documentazione che il codice smentisce (W5-80);
- aggiornamento di `06`, `08`, `09`, `10`, `11`, `13`, `14`, `16`, `18`, `20`,
  `docs/api-registry.md`, `src/lib/api/registry.ts` e `CLAUDE.md`;
- esecuzione della UAT del §22 e stesura del documento `40 — Wave 5:
  implementazione e collaudo`.

---

## 9 — File e domain ownership

### Righe nuove da aggiungere a CLAUDE.md §2

| Dominio | File proprietario | Regola |
|---|---|---|
| Eventi sportivi: allenamenti, gare, convocazioni | `src/lib/server/events.ts` (scrittura) + `src/lib/events/` (dominio puro) | **L'unica** strada per creare, modificare o annullare un evento. Nessuno scrive `clubs.trainings` o `clubs.matches`: le due colonne sono sola lettura per compatibilità |
| Partecipazione a un evento | `src/lib/server/events.ts` per convocazione e presenza, `src/lib/server/rsvp.ts` per la risposta della famiglia | Tre colonne, tre scrittori distinti, **nessuna scrittura incrociata** (ADR-0086, esteso da ADR-0099). Una promessa non diventa mai una presenza |
| Richieste e depositi documentali | `src/lib/server/document-requests.ts` (scrittura) + `src/lib/documents/request-model.ts` (dominio puro) | Lo stato di una richiesta si **deriva** dall'ultimo deposito, non si scrive. I byte passano **sempre** da `attachments.ts`: nessun altro archivio |
| Appuntamenti e disponibilità | `src/lib/server/appointments.ts` (scrittura) + `src/lib/appointments/` (dominio puro) | Una transizione per rotta. La riprogrammazione crea una riga e chiude la vecchia: **niente mutazione della data in luogo** |
| Dato sanitario | `src/lib/health/permissions.ts` | Chi vede lo **stato** del certificato non vede per ciò stesso il **contenuto** clinico. Default negato sul contenuto |

### Ownership che la Wave 5 rispetta e non tocca

`access-roles.ts` (ruoli), `server/auth.ts` (sessioni e scope),
`auth/active-club-boundary.ts` (confine), `server/resources.ts` (accesso dati),
`server/attachments.ts` (file), `server/consents.ts` (consensi),
`audience/` (pubblico), `server/communications.ts` e
`server/club-notifications.ts` (invio), `server/audit.ts` (traccia),
`club-seasons.ts` e `server/seasons.ts` (stagioni), `club-sites.ts` (sedi),
`server/payment-transactions.ts` (incassi), `server/sport-work*.ts` (lavoro
sportivo), `server/funding.ts` (bandi), `server/accounting.ts` (contabilità).

### La riduzione di `simplified-db.ts`

`src/lib/simplified-db.ts` è 4.300 righe e CLAUDE.md lo dichiara **in
riduzione** (WP-07): non ci si aggiunge logica. La Wave 5 ne **toglie**:
`saveTrainingAttendance` e le letture di `clubs.trainings`/`clubs.matches`
migrano al dominio server. È una riduzione misurabile, da riportare nel
consuntivo.

---

## 10 — Il DAG delle dipendenze

```
                        5A  I difetti che vengono prima
                     (BARRIERA — nessuno parte prima)
                                  |
                        5B  Permessi: catalogo + clinico
                                  |
              +-------------------+-------------------+
              |                   |                   |
        5C  Evento           5D  Fascicolo        5E  Appuntamenti
        (tabella,            (Attachment Core,    (tabella, slot,
         migrazione,          richieste,           macchina a stati,
         congelamento)        depositi, audit)     notifiche)
              |                   |                   |
              |                   |                   |
        +-----+-----+             |                   |
        |           |             |                   |
   5F Calendario    |        5G Iscrizione            |
   unico, gare,     |        online e rinnovo         |
   audience evento  |             |                   |
        |           |             |                   |
        +-----------+-------------+-------------------+
                    |                         |
              5H  Dashboard Parent      5I  Dashboard Trainer
                    |                         |
                    +------------+------------+
                                 |
                    5J  Pulizia, KB, UAT
```

### Le dipendenze, dichiarate una per una

| Da | A | Perché |
|---|---|---|
| 5A | tutte | Tre superfici non funzionano: senza 5A non c'è dove collaudare |
| 5B | 5C, 5D, 5E | Ogni dominio nuovo deve dichiarare le proprie chiavi di permesso in un catalogo che esiste già |
| 5C | 5F | Il calendario unico elenca righe che 5C crea |
| 5C | 5I | Il trainer legge e scrive eventi |
| 5C | 5H | Il genitore vede il calendario dei figli |
| 5D | 5G | La domanda di iscrizione porta allegati, che devono già passare da Attachment Core |
| 5D | 5H | I documenti del genitore sono la superficie più visibile della famiglia |
| 5E | 5H, 5I | Le tre dashboard degli appuntamenti |
| 5F | 5H | L'RSVP sulle gare e la convocazione leggibile arrivano al genitore |
| 5G | 5H | Il riscontro sulla domanda vive nell'area genitore |
| 5H, 5I | 5J | La UAT collauda le superfici finite |

### Le barriere, e cosa contengono

Due sole, e sono vere barriere — non comodità di calendario:

1. **Dopo 5A.** Contiene i cinque difetti. La ragione è di collaudo, non di
   codice: ogni lane successiva va provata su una dashboard Parent e Trainer
   funzionante, e oggi non lo sono.
2. **Dopo 5B.** Contiene il catalogo dei permessi e il permesso clinico. La
   ragione è di coerenza: se 5C, 5D e 5E inventassero ognuna il proprio modo di
   dichiarare un permesso, ci ritroveremmo con una **quarta** generazione di
   permessi accanto alle tre che W5-70 già registra.

---

## 11 — Lane realmente parallelizzabili, e l'ordine di merge

### Cosa è davvero parallelo

| Gruppo | Lane | Perché non collidono |
|---|---|---|
| **1** | 5C, 5D, 5E | File disgiunti. 5C tocca eventi e presenze; 5D tocca allegati e documenti; 5E tocca appuntamenti. Nessuna delle tre importa le altre. Le tre migrazioni Prisma vanno numerate con la convenzione di **ADR-0041** (numerazione quando più workstream lavorano in parallelo) |
| **2** | 5F, 5G | 5F tocca calendario, gare e audience; 5G tocca moduli e iscrizioni. Il solo file condiviso è `registry.ts`, in append |
| **3** | 5H, 5I | Due aree separate: `parent-view` e `trainer-dashboard`. Condividono `access-roles.ts` in sola lettura |

### Cosa **non** è parallelo, benché sembri

- **5A e 5B non si parallelizzano.** 5A contiene già la *negazione* clinica; 5B
  la trasforma in un catalogo. Farle insieme significa scrivere due volte lo
  stesso permesso.
- **5C e 5F non si parallelizzano**, benché siano entrambe «attività
  sportiva»: 5F consuma la tabella che 5C crea. Provare a sovrapporle produce
  una pagina calendario contro un modello che cambia sotto.
- **5D e 5G non si parallelizzano** per la stessa ragione, sull'allegato.

### L'ordine di merge

| # | Lane | Contenuto | Gate aggiuntivo |
|---|---|---|---|
| 1 | **5A** | I cinque difetti | Un test per difetto; per i tre di sicurezza, un test che fallisce se si toglie la guardia |
| 2 | **5B** | Catalogo permessi, `clinical.*`, fine dell'allow-by-default | Test di matrice sui moduli puri |
| 3 | **5C** | `club_events`, `club_event_participants`, migrazione, congelamento JSON | Migrazione provata su una copia con dati reali; conteggio righe prima e dopo |
| 4 | **5D** | Fascicolo unico, richieste, depositi, travaso | Nessun byte perso: conteggio `Asset` prima, `Attachment` dopo |
| 5 | **5E** | Appuntamenti | Doppia prenotazione respinta **dal database** |
| 6 | **5F** | Calendario unico, gare al pari, criteri di audience | RSVP esercitabile end-to-end da una schermata |
| 7 | **5G** | Iscrizione e rinnovo self-service | Una domanda inviata e seguita fino all'approvazione |
| 8 | **5H** | Dashboard Parent | Scenari UAT famiglia del §22 |
| 9 | **5I** | Dashboard Trainer | Scenari UAT allenatore del §22 |
| 10 | **5J** | Pulizia, KB, UAT completa | I quattro gate, più la UAT a runtime |

Ogni merge esige i quattro gate di CLAUDE.md §4 verdi. **La regola della Wave 4
resta**: se il diff di una lane supera le 400 righe, si divide.

---

## 12 — Permission matrix

### Il principio, e perché non cambia

Il modello resta quello dichiarato dal brief: **sette ruoli**, nessun ottavo.
Ogni capability nuova ottiene una **chiave di permesso** con default negato,
sullo stampo di **ADR-0077** — che è esattamente ciò che il §22 del
[37](37-wave-4-planning.md) indicava come strada per G-33.

### La verità sui ruoli personalizzati, dichiarata qui

Il brief chiede che ogni capability nuova «funzioni anche con ruoli
personalizzati» e mette i ruoli personalizzati fra gli scenari UAT. **Il motore
non esiste** (W5-67): non c'è nessuna tabella di ruoli o permessi, e l'unico
«ruolo personalizzato» del prodotto è una stringa di etichetta sulla scheda di
uno staff member, salvata in `clubs.staff_members`, **senza alcun effetto
sull'autorizzazione**. La pagina che sembra gestirli
(`/dashboard/access-management`) è un mock con tre nomi cablati e un token
generato dal browser, ed è dichiarata `COMPLETE` nella KB.

Conseguenze operative, senza attenuazioni:

1. **Lo scenario UAT «ruoli personalizzati» non è eseguibile nella Wave 5.**
   Al suo posto la UAT prova la cosa che *esiste*: un ruolo predefinito a cui è
   stato **negato** un permesso nuovo, e la verifica che il diniego valga anche
   sull'API e non solo sullo schermo.
2. **La Wave 5 non introduce il motore**, e non introduce nemmeno un
   meccanismo provvisorio di concessione per membership: sarebbe l'inizio di un
   motore di ruoli scritto di sfuggita dentro una Wave che ha altri obiettivi.
3. **Ogni permesso nuovo di questa Wave nasce con una matrice per ruolo
   esplicita**, cioè nella forma che un motore di ruoli personalizzati potrà
   leggere senza essere riscritto. È il presidio che rende la Wave 6
   un'aggiunta e non un rifacimento.
4. **La decisione è del prodotto** ed è elencata al §24 fra i blocker
   pre-produzione: se i ruoli personalizzati sono un requisito di produzione,
   la Wave 6 ha un `L` da pianificare, non una rifinitura.

### La matrice

Convenzione: **✔** concesso dal ruolo · **✖** negato · **◐** concesso ma
ristretto al perimetro (gruppo operativo, sede, «solo i miei») · **⛓** concesso
dal **legame** (genitore-atleta, oppure assegnazione), non dal ruolo.

| Permesso | Nuovo | owner | club_manager | collaborator | staff | trainer | parent | athlete |
|---|---|---|---|---|---|---|---|---|
| `events.read` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ⛓ | ⛓ |
| `events.manage` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ✖ | ✖ |
| `events.convoke` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ✖ | ✖ |
| `events.attendance` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ✖ | ✖ |
| `rsvp.read` | — | ✔ | ✔ | ✔ | ✔ | ◐ | ✖ | ✖ |
| `rsvp.answer` | — | ✔ | ✔ | ✔ | ✔ | ✖ | ⛓ | ⛓ |
| `documents.request` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| `documents.review` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| `documents.submit_own` | ✱ | ✔ | ✔ | ✔ | ✔ | ✔ | ⛓ | ⛓ |
| `documents.read_dossier` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ⛓ | ⛓ |
| `clinical.status_read` | ✱ | ✔ | ✔ | ✔ | ✔ | ✔ | ⛓ | ⛓ |
| `clinical.read` | ✱ | ✔ | ✔ | ✔ | ✔ | **✖** | ⛓ | ⛓ |
| `clinical.manage` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| `appointments.read` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| `appointments.read_own` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ⛓ | ✖ |
| `appointments.request` | ✱ | ✔ | ✔ | ✔ | ✔ | ✖ | ⛓ | ✖ |
| `appointments.manage` | ✱ | ✔ | ✔ | ✔ | ✔ | ◐ | ✖ | ✖ |
| `consents.decide_own` | ✱ | ✖ | ✖ | ✖ | ✖ | ✖ | ⛓ | ⛓ |
| `enrollment.review` | — | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| `board.read` | — | ✔ | ✔ | ✔ | ✔ | ✔ | ⛓ | ⛓ |

✱ = permesso nuovo introdotto dalla Wave 5. **17 chiavi nuove**, zero ruoli
nuovi.

### Il taglio sul dato clinico, e perché è quello giusto

La riga che conta è la coppia `clinical.status_read` / `clinical.read`.

- **Lo stato** — valido, in scadenza, scaduto, mancante, con la data — risponde
  alla domanda operativa «questo atleta può scendere in campo?». Serve
  all'allenatore, e la Wave 5 gliela **conferma**.
- **Il contenuto** — allergie, farmaci, gruppo sanguigno, note mediche, il file
  del certificato — risponde a una domanda che l'allenatore non deve porsi per
  fare il proprio lavoro. Default **negato**.

Il taglio non è inventato: è esattamente quello che l'interfaccia già distingue
oggi, con il badge di scadenza da una parte e le schede allergie/farmaci/BLSD
dall'altra. La differenza è che oggi lo distingue **il browser**, e da domani
lo distingue il server (D-4, ADR-0058).

### La procedura che ogni rotta nuova della Wave 5 deve seguire

Non è nuova: è quella già in vigore, e va rispettata alla lettera.

1. `requireAuthenticatedUser` → 401 se assente;
2. `resolveOrganizationScopeForUser` → 400/403 se non c'è club attivo;
3. `assertXPermission(scope.activeRole, "dominio.azione")`, oppure
   `assertClubResourceAccess` per il CRUD generico;
4. su diniego, **prima** di rispondere: `recordAuditEvent` con `outcome:
   "denied"` e il nome del permesso nel metadato;
5. nel servizio, su **ogni riga letta**: `assertActiveClub(scope,
   row.organization_id, …)`. Mai il confronto con `allowedOrganizationIds`
   (ADR-0094);
6. per parent e athlete il gate è il **legame**, non il ruolo: la stessa regola
   già scritta per l'RSVP — «i due permessi non sono lo stesso permesso»;
7. ogni errore di autorizzazione contiene la stringa `Accesso negato`;
8. la risorsa nuova dichiara il proprio confine in `RESOURCE_BOUNDARIES`;
9. l'endpoint entra in `src/lib/api/registry.ts` e in `docs/api-registry.md`;
10. **due test nello stesso commit**: uno di matrice sul modulo puro, uno di
    confine che provi che una riga di un altro club non si legge, non si scrive
    e non si cancella.

---

## 13 — Impatto Parent

Il requisito è esplicito: **la Dashboard Parent deve arrivare completa al 100%
rispetto alle funzioni necessarie al ruolo prima della produzione.** Non
necessariamente tutto nella Wave 5. Questa è la verifica voce per voce, con la
riga di confine dichiarata.

### Il punto di partenza, misurato

**Un genitore, oggi, può compiere cinque scritture in tutta l'applicazione**:
richiedere, modificare e annullare un appuntamento; caricare un documento;
prenotare una struttura; rispondere a un RSVP; compilare un modulo pubblico
(da anonimo). Tutto il resto è lettura.

### La verifica voce per voce

| Voce del brief | Oggi | Dopo la Wave 5 | Wave 6 / pre-produzione |
|---|---|---|---|
| **Figli / atleti collegati** | Risolti tutti e bene dal server; **il secondo figlio non è raggiungibile** (D-3) | Selettore funzionante, figli in club diversi compresi, legame che sopravvive al reload | Tabella `athlete_guardians` con vincolo vero (W5-36) |
| **Calendario** | Non esiste: due pagine separate, sola lettura | Calendario unico dei figli, filtrabile per figlio | — |
| **Allenamenti** | Elenco in sola lettura, filtrato per categoria | Invariato, dentro il calendario | — |
| **Gare** | Elenco in sola lettura | Con sede, e allineate agli allenamenti | — |
| **Convocazioni** | Stato **indovinato** da nove grafie | Stato letto da una colonna, con notifica al convocato | — |
| **RSVP** | Funziona bene sugli allenamenti, **ma nessun evento lo richiede mai** | Esercitabile davvero, e anche sulle gare | RSVP da link senza account (`W2-09`) |
| **Presenze visibili** | Visibili dal cruscotto | Invariate, lette dalla tabella e non dalla copia JSON | — |
| **Pagamenti e rate** | Elencati; stato derivato corretto | Invariati | — |
| **Link di pagamento / «Paga ora»** | **Disabilitato** nell'area genitore; funziona solo il link pubblico | «Paga ora» attivo, riusando il checkout esistente con l'identità di sessione | — |
| **Ricevute** | Elencate e **non scaricabili** | Scaricabili: il gate diventa il legame, non il ruolo | — |
| **Documenti** | Visibili, su un archivio parallelo | Visibili dal fascicolo unico | — |
| **Richieste documenti dal club** | Esistono come stato in un array JSON | Righe proprie, con scadenza sorvegliata e sollecito | — |
| **Upload** | Esiste, in JSON base64, fuori da Attachment Core | Multipart, dentro Attachment Core, con audit | Antivirus e controllo dei magic byte |
| **Certificati** | Visibili; **il caricamento della famiglia non diventa un certificato** | L'accettazione promuove la riga in `medical_certificates` | — |
| **Consensi** | La famiglia **non può accettare né revocare** nulla | Accettazione e revoca dalla famiglia, con evidenza di rete | Politica su quale consenso governa quale invio (`W4-R18`) |
| **Iscrizione online** | Invio cieco: nessun riscontro | Stato della domanda visibile e seguito fino alla decisione | Pagamento contestuale (G-37) |
| **Rinnovo** | Non esiste lato famiglia | Modulo di rinnovo precompilato | Sconti automatici e fratelli (G-36, G-61) |
| **Notifiche** | Caricate nel payload e **mai disegnate**; «vedi tutte» rimbalza | Elenco nell'area genitore, con il link giusto | Push (G-59, differito da ADR-0025) |
| **Comunicazioni / bacheca** | Backend pronto, **nessuna pagina** | Bacheca della famiglia | — |
| **Appuntamenti / segreteria** | Richiesta possibile, **conferma impossibile**, richiesta che si cancella da sola | Ciclo completo su slot, con notifiche | — |

### Cosa vedrà concretamente un genitore, il giorno dopo il rilascio

Apre l'applicazione e trova, in ordine di evidenza: **i suoi figli, tutti, e li
può cambiare**; un **calendario** con allenamenti e gare di ciascuno; la
**convocazione** con il pulsante per confermare la presenza; una **bacheca**
con le comunicazioni del club; l'elenco delle **notifiche**; il pulsante
**«Paga ora»** che funziona e la **ricevuta** che si scarica; un **fascicolo**
con i documenti richiesti dal club, quelli che ha caricato e lo stato di
ciascuno — «da verificare», «accettato», «rifiutato» con il motivo; i
**consensi** che può accettare o revocare lui; lo **stato della domanda** di
iscrizione o rinnovo; un **appuntamento** che si chiede su uno slot libero e
che riceve una risposta.

---

## 14 — Impatto Trainer

Stesso requisito, stessa verifica.

### Il punto di partenza, misurato

La Dashboard Trainer non è incompleta: per la parte configurabile è **rotta**
(D-2). Otto letture su una risorsa vietata al ruolo, un errore inghiottito, i
permessi che ricadono sui default, due scritture che rispondono 403, un
pannello sempre vuoto, e circa sette righe di audit «negato» a ogni
caricamento. Più un perimetro atleti che il client può disattivare (D-5) e un
dato clinico mascherato solo dal browser (D-4).

### La verifica voce per voce

| Voce del brief | Oggi | Dopo la Wave 5 | Wave 6 / pre-produzione |
|---|---|---|---|
| **Squadre / gruppi assegnati** | Modellati in `clubs.trainers[]`; il gruppo operativo è usato **solo** dall'RSVP; l'assegnazione **non sopravvive al cambio stagione** | Perimetro unico per gruppo operativo, rimappato al riporto | — |
| **Calendario** | Due calendari separati, filtrati lato client | Calendario unico dei propri gruppi | — |
| **Allenamenti** | Può solo annullare e ripristinare, **e l'azione risponde 403** | Annullamento funzionante; creazione e modifica sugli eventi dei propri gruppi | — |
| **Gare** | Sola lettura | Lettura e convocazione sui propri gruppi | — |
| **Convocazioni** | UI presente, **il salvataggio risponde 403** | Funzionante, come fatto tracciato e notificato | — |
| **Presenze** | Funzionano — è l'unica scrittura del trainer che non passa da `clubs` | Invariate, con la copia JSON rimossa; presenze anche sulle gare | — |
| **RSVP** | Riepilogo corretto, con perimetro applicato dal server | Invariato, esteso alle gare | — |
| **Atleti autorizzati** | Perimetro **aggirabile**: una fallback restituisce l'anagrafica completa | Perimetro implicito sul ruolo, senza fallback | — |
| **Comunicazioni** | Non può scrivere a nessuno; `board.read` **senza schermata** | Bacheca in lettura; note di segreteria mostrate invece che calcolate e buttate | Invio dal trainer verso il proprio gruppo: **decisione di prodotto** |
| **Notifiche** | Due tipi, **calcolati nel browser** e persistiti dal server così come arrivano | Calcolo lato server, contenuto non più dettato dal client | — |
| **Documenti pertinenti** | I propri documenti esistono ma sono visibili **solo** nell'area gestionale | Pannello «i miei documenti» nella dashboard; vista «certificati in scadenza del mio gruppo», limitata allo **stato** | — |
| **Dato clinico** | Mascherato dal browser, flag acceso di default | `clinical.read` negato di default, applicato dal server; resta `clinical.status_read` | Meccanismo di concessione per singolo operatore (con i ruoli personalizzati) |
| **Programmazione** | Pannello **sempre vuoto** | Funzionante | Piani di lavoro tecnici, esercizi, carichi (W5-13) |
| **Strumenti operativi** | La scheda tecnica dell'atleta esiste **solo in un file orfano** | Decisione: portata sulla v2 o cancellata | Valutazioni su criteri configurabili (G-62) |
| **Responsive 375 px** | Corretto di fatto, **zero invarianti a presidio** | Le pagine `trainer-dashboard` entrano nel test degli invarianti | — |

### Cosa vedrà concretamente un allenatore

I **suoi permessi**, quelli che il club gli ha davvero dato, invece dei default;
il **calendario** dei propri gruppi; il pulsante **annulla allenamento** che
non dà errore; le **convocazioni** che si salvano; l'**appello** su allenamento
e gara; le **risposte delle famiglie** accanto ai nomi; la
**programmazione settimanale** con dentro qualcosa; i **propri documenti** e le
proprie scadenze; la **bacheca** del club; e, se il club non gliel'ha
concesso, **nessun dato clinico** — né sullo schermo né nella risposta.

---

## 15 — Impatto Club

Il club è il ruolo che oggi funziona meglio, ed è quello che la Wave 5 cambia
di meno in superficie e di più in fondo.

| Area | Oggi | Dopo la Wave 5 |
|---|---|---|
| **Calendario** | Due pagine, due calendari, nessuna vista d'insieme | Una pagina calendario con entrambi i tipi, filtrabile per sede, categoria, gruppo e stagione |
| **Allenamenti e gare** | Array JSON riscritti per intero: due segretarie che salvano insieme si sovrascrivono | Righe con chiave, versione e vincoli. La seconda scrittura fallisce invece di vincere |
| **Convocazioni** | Un campo dentro il payload della gara | Un fatto con permesso, notifica e traccia |
| **Comunicazioni** | Si scrive per categoria o per gruppo | Si scrive **ai convocati** o **a chi non ha risposto** |
| **Segreteria: appuntamenti** | Una lista in cui le richieste delle famiglie arrivano, non si possono confermare, e prima o poi spariscono | Una **coda di lavoro**: in attesa, confermati, rifiutati, con slot e disponibilità |
| **Documenti dell'atleta** | Quattro collezioni affiancate in una scheda, su due archivi | Un **fascicolo**: cosa è stato chiesto, cosa è arrivato, cosa è stato accettato, da chi e quando |
| **Richieste alla famiglia** | Esistono ma non scadono e non lasciano traccia | Scadono, sollecitano e lasciano traccia |
| **Iscrizioni** | La segreteria vede la coda; la famiglia non vede niente | Invariato per la segreteria; la famiglia smette di telefonare per sapere a che punto è |
| **Permessi** | Tre generazioni di permessi, una delle quali vive solo nel browser | Un catalogo unico con chiavi ed etichette, e il dato clinico protetto dal server |
| **Multi-sede** | La gara non ha sede; l'appuntamento non ha sede; gli orari sono uno solo per club | Sede su evento e appuntamento, orari e slot per sede |
| **Audit** | Approvare o rifiutare un documento non lascia traccia; ogni caricamento della dashboard trainer ne lascia sette inutili | Le decisioni lasciano traccia; il rumore sparisce |

**Ciò che il club perde**, e va detto: un allenatore smetterà di vedere
allergie, farmaci e gruppo sanguigno degli atleti, a meno che il club non sia
owner o club_manager. Finché non esiste il meccanismo di concessione per
singolo operatore (Wave 6), non c'è un modo di restituirglielo. È una scelta
deliberata: **il default su un dato sanitario di un minore è negato**, e un
default sbagliato non si compensa con una casella di spunta nel browser.

---

## 16 — Iscrizione online

Il brief la dichiara **capability essenziale prima della produzione**, con due
requisiti: semplice per la famiglia, semplice da configurare e gestire per il
club.

### Cosa esiste davvero, e cosa no

Esiste un motore di moduli online **corretto e ben costruito**: pagina pubblica
senza sessione, limite di frequenza per indirizzo, errori collassati a 404,
versione del modulo immutabile citata dalla compilazione, controllo duplicati,
e — punto decisivo — **l'anagrafica nasce solo all'approvazione umana**
(ADR-0040). `prisma.athlete.create` non esiste in tutto `src/`: non c'è nessuna
strada pubblica che crei un atleta. All'approvazione nascono l'atleta,
l'appartenenza a categoria, i tutori, gli allegati, i consensi e il documento.

**Quindi l'iscrizione online esiste per il club e non esiste per la famiglia.**
Il gap non è il motore: è che **la famiglia invia e poi non sa più niente**.
Nessun riscontro, nessuno stato, nessun modo di aggiungere un allegato
mancante, nessun modo di sapere che è stata approvata.

### Cosa fa la Wave 5

1. **Ricevuta di invio.** L'invio restituisce un riferimento opaco. Con quello
   la famiglia legge lo **stato** della propria domanda — inviata, in
   lavorazione, approvata, respinta con motivo — da una lettura pubblica che
   non espone nient'altro.
2. **La domanda entra nell'area genitore.** Per chi ha già un account, la
   domanda compare fra le proprie pratiche con lo stesso stato.
3. **Integrazione documentale.** Se all'approvazione manca un documento, la
   segreteria non respinge: emette una **richiesta documentale** (§17). È il
   punto in cui l'iscrizione e il workflow documenti si saldano, e la ragione
   per cui 5D precede 5G nel DAG.
4. **Rinnovo.** Il rinnovo è un modulo di iscrizione **precompilato** dai dati
   esistenti, che cita la stagione di destinazione. Non è un secondo motore:
   è un modulo con un contesto. La famiglia conferma o corregge; la segreteria
   approva; il riporto stagionale resta gestionale e non cambia.
5. **Configurazione per il club.** Nessuna schermata nuova: il modulo di
   iscrizione e quello di rinnovo si costruiscono con il builder che esiste,
   e sede e categoria continuano a metterle il server quando il modulo si apre
   (ADR-0043).

### Cosa la Wave 5 **non** fa

- Non incassa. **Nessun pagamento contestuale** (G-37): la domanda produce una
  pratica, non un movimento. Chi vuole far pagare all'iscrizione usa il link di
  pagamento dopo l'approvazione.
- Non calcola sconti automatici né riconosce i fratelli (G-36, G-61).
- Non consente l'iscrizione **senza account** con seguito: la ricevuta è
  anonima e in sola lettura. Un canale pubblico di scrittura ricorrente va
  progettato a parte (`W2-09`).
- Non tocca la regola d'oro: **solo un operatore crea un'anagrafica**. Il
  duplicato si mostra e non si risolve da solo (ADR-0040).

---

## 17 — Workflow documenti Club ↔ Parent

### La scoperta che cambia il lavoro

Il workflow chiesto dal brief — il club vede che manca il certificato, chiede,
la famiglia carica, il club verifica, accetta o rifiuta, e solo dopo il
documento entra nel fascicolo — **esiste già per intero**.

`src/lib/shared-documents.ts` implementa gli stati
`required → uploaded / under_review → approved / rejected` con motivo di
rifiuto; la rotta del club sa `require`, `approve`, `reject`, `remind` (con
throttling a sei ore) e archiviazione logica; la rotta della famiglia carica e
mette in `under_review`; entrambe notificano. **Anche il verso spontaneo
funziona.**

Il problema non è il workflow. È **dove vive**:

- i byte stanno nella tabella `Asset` come base64, che **non ha
  `organization_id`**: il confine multi-tenant è il prefisso di una stringa;
- il fatto sta in `athletes.data.sharedDocuments`, un array JSON dentro
  l'anagrafica, scritto con `prisma.athlete.update` diretto che aggira
  `resources.ts`;
- **nessuna delle due rotte chiama `recordAuditEvent`**: accettare o rifiutare
  il documento di un minore non lascia traccia;
- `src/lib/shared-documents.ts` **non ha un solo test di dominio**;
- e accanto vive Attachment Core, che è il posto giusto, con driver di storage,
  permessi ereditati, limiti, validità e scadenze (ADR-0034).

Questo è `AU-5` / `D-H`. Il §22 del [37](37-wave-4-planning.md) lo chiamava *«il
prerequisito nascosto: costruire il ciclo di firma su due archivi paralleli li
renderebbe tre. Va fatto per primo»*, come lane `3B` della Wave 3. **Quella lane
non è mai stata eseguita**, e la sigla `W3-B` è stata riassegnata al risolutore
dei segnaposto. G-42 è stato dichiarato parziale sopra un prerequisito non
fatto.

**La Wave 5 tocca esattamente quel fascicolo. Se non unifica ora, gli archivi
diventano tre.**

### Il modello

Due tabelle per il **fatto**, zero tabelle per il **file**.

**`document_requests`** — la richiesta come riga:
`organization_id`, `subject_kind` (`athlete | member | person`), `subject_id`,
`document_kind`, `title`, `description`, `required`, `due_date`, `season_id`,
`status` (`open | fulfilled | cancelled`), `created_by`, timestamp.
Indici su `(organization_id, subject_kind, subject_id)` e
`(organization_id, status, due_date)`.

**`document_submissions`** — il deposito e la sua decisione, **append-only**:
`organization_id`, `request_id` (nullo quando il deposito è **spontaneo**),
`attachment_id` verso Attachment Core, `submitted_by`, `submitted_at`,
`source` (`parent | club | public_form`), `status`
(`under_review | approved | rejected`), `decided_by`, `decided_at`,
`decision_note`.

**Lo stato corrente della richiesta si deriva** dall'ultimo deposito, non si
scrive. È la stessa regola di `ConsentRecord`, delle rate e delle scadenze del
lavoro sportivo: uno stato che si ricava non si scrive (ADR-0058).

**I byte non generano niente di nuovo**: `createAttachment` esiste, e il file
resta di proprietà del soggetto — è `document_submissions.attachment_id` a
fare il collegamento. Nessun `owner_type` nuovo.

### I due versi, entrambi coperti

**Verso richiesto.** La segreteria vede che manca il certificato → crea una
`document_request` → la famiglia la trova nella propria dashboard con la
scadenza → carica → nasce una `document_submission` in `under_review` e un
`Attachment` → il club la trova nella coda «da verificare» → un operatore con
`documents.review` accetta o rifiuta con motivo → all'accettazione il documento
entra nel fascicolo, e se è un certificato medico **promuove** una riga in
`medical_certificates`.

**Verso spontaneo.** La famiglia carica senza che nessuno abbia chiesto → nasce
una `document_submission` con `request_id` nullo → stessa coda, stessa
decisione, stesso esito.

### Ciò che si riusa, e non si riscrive

| Serve | Si usa |
|---|---|
| Archiviare il file | `src/lib/server/attachments.ts` (ADR-0034) |
| Avvisare la famiglia e il club | `club-notifications.ts`, una riga per destinatario |
| Sollecitare | il giro notturno delle automazioni, con **un trigger nuovo** nel catalogo chiuso (ADR-0083) |
| Non sollecitare due volte | `CommunicationDelivery` e il suo indice di deduplicazione (ADR-0084) |
| Registrare la decisione | `recordAuditEvent`, con due azioni nuove nel catalogo |
| Scadere | la query gemella di `listExpiringAttachments`, **non un motore nuovo** |
| Consensi | `consents.ts`, invariato |

### La migrazione

Travaso una tantum da `athletes.data.sharedDocuments` e dagli `Asset` dei
bucket `shared-documents` e `parent-documents` verso `attachments`,
`document_requests` e `document_submissions`. `Asset` **sopravvive** per il
logo del club e per gli allegati dei moduli V1: non è questa Wave a chiuderlo,
ed è la ragione per cui W5-41 resta `EXTEND` e non `DONE`.

Le due rotte legacy restano in **sola lettura** per una release, poi spariscono.
`src/lib/shared-documents.ts` viene rimosso in 5J.

---

## 18 — Appuntamenti

Il brief è esplicito: **esiste già, non va rifatto, va analizzato ed esteso.**
L'analisi c'è stata, e il verdetto è che è mezzo prodotto: c'è la domanda,
manca la risposta.

### Cosa c'è, precisamente

- La famiglia chiede, modifica e annulla, con **validazione server** contro gli
  orari di apertura del club — e se gli orari non sono configurati la richiesta
  **fallisce**, che è la regola giusta.
- La segreteria ha un calendario mensile, un form di inserimento, la lista del
  giorno e un dettaglio in **sola lettura**.
- Le notifiche verso il club esistono e sono indirizzate (correzione della
  Wave 4, commit `221ee35`).

### Cosa manca, precisamente

- **Nessun codice scrive `confirmed`.** Né `rejected`. Le etichette esistono
  solo nel formatter generico. Una richiesta resta in attesa per sempre, e
  l'unica risposta possibile della segreteria è cancellarla — senza avvisare
  nessuno.
- **Le richieste si cancellano da sole** (D-1).
- **Nessun proprietario**: la logica sta in un route handler e in una pagina
  client, e i due scrittori usano due forme diverse dello stesso oggetto —
  quello della segreteria non ha nemmeno uno stato né un `athlete_id`.
- **Nessuna disponibilità**: c'è l'orario di apertura, non lo slot. Due
  famiglie possono chiedere lo stesso orario.
- **Nessuna notifica alla famiglia. Zero email.**
- **Nessuna sede.** Gli orari di apertura sono uno solo per club.
- **Il trainer non esiste** in questo dominio: non può nemmeno leggere.
- **Nessun audit**, identificativi generati dall'orologio, data e ora come due
  stringhe separate interpretate nel fuso del server, nessuna protezione dal
  doppio clic.
- **Nessun test di dominio.**

### L'estensione

Promuovere a **dominio con proprietario e tabella propria**, come è stato fatto
per gli incassi e per il lavoro sportivo. Lo stato non si legge da un campo
libero: si deriva dalla storia delle transizioni.

**`appointments`** — `organization_id`, `site_id`, `season_id`, `starts_at` e
`ends_at` come **istante assoluto** con fuso dichiarato, `status`
(`requested | confirmed | rejected | rescheduled | cancelled_by_family |
cancelled_by_club | completed | no_show`), `athlete_id` con chiave esterna
vera, `requested_by_user_id`, `assigned_to_user_id`, `reason`, `notes`,
`internal_notes` (mai visibili alla famiglia), `slot_id`,
`parent_appointment_id` per la riprogrammazione, `idempotency_key`, `version`.

**`appointment_slots`** — la disponibilità come **dato**: sede, operatore,
giorno della settimana oppure data specifica per le eccezioni, orario, durata,
capienza, validità. Quando un club non configura slot, si ricade sugli orari di
apertura: la funzione esistente resta, come fallback.

**I presidi che oggi non ci sono**, e che sono la ragione della tabella:

- indice **unico parziale** su (club, operatore, inizio) per gli stati vivi: la
  doppia prenotazione la impedisce il database;
- `idempotency_key` unica per club: il doppio clic non produce due
  appuntamenti;
- `version` per il controllo ottimistico: due operatori che confermano insieme
  non si sovrascrivono;
- la **riprogrammazione crea una riga nuova** e chiude la vecchia. La data non
  si muta in luogo, così l'audit resta leggibile.

### Il ciclo di vita, e chi lo muove

| Transizione | Chi | Notifica |
|---|---|---|
| Richiesta | Famiglia (`appointments.request`), o segreteria dal desk | Al club |
| Conferma | Segreteria, o l'operatore assegnato (`appointments.manage`) | Alla famiglia, **in-app ed email** |
| Rifiuto, con motivo | Segreteria o assegnato | Alla famiglia, **in-app ed email** |
| Riprogrammazione | Entrambi i lati; la famiglia solo finché è in richiesta | All'altra parte |
| Cancellazione | Entrambi i lati, con l'autore registrato nello stato | All'altra parte |
| Completato / assente | Segreteria o assegnato | Nessuna |
| Promemoria a 24 ore | Il giro notturno esistente | Alla famiglia |

### Le tre dashboard

- **Club**: la scheda «Appuntamenti» della segreteria diventa una **coda di
  lavoro** — filtro per stato, azioni conferma / rifiuta / riprogramma /
  segna assente, filtro sede se il club è multi-sede. La logica degli slot esce
  dalla pagina.
- **Parent**: si sceglie uno **slot libero**, non una data qualunque; si vede
  lo stato vero e il motivo di un rifiuto; si può proporre una
  riprogrammazione.
- **Trainer**: una pagina con i **soli appuntamenti assegnati** — il colloquio
  con la famiglia di un atleta del proprio gruppo — con conferma e
  riprogrammazione. È il caso d'uso che oggi non esiste affatto.

### Il confine

`isParentAppointment` oggi accetta la riga se l'atleta corrisponde **oppure**
se l'utente richiedente corrisponde. È un OR permissivo: dal contesto del
figlio A si può toccare una richiesta nata per il figlio B. Diventa una
congiunzione, e il club non arriva mai dal client — si deriva dal legame, come
già fa.

---

## 19 — Multi-tenant e multi-sede

### Multi-tenant: la regola non cambia, si applica alle tabelle nuove

Il confine è **uno solo**: `src/lib/auth/active-club-boundary.ts`, che
confronta con `activeOrganizationId` e **mai** con `allowedOrganizationIds`. La
Wave 4 ha corretto quindici moduli che sbagliavano quel confronto, e ADR-0094
ha reso la dichiarazione del confine **obbligatoria**: `resources.ts` non si
carica se una risorsa non lo dichiara.

Le cinque tabelle nuove della Wave 5 — `club_events`,
`club_event_participants`, `document_requests`, `document_submissions`,
`appointments`, `appointment_slots` — dichiarano il confine `club` e portano
tutte `organization_id`. Nessuna eccezione.

**Due punti deboli ereditati, e cosa ne facciamo:**

1. **`Asset` non ha `organization_id`.** Il confine dei documenti della
   famiglia è oggi il prefisso della stringa `path`. Nella rotta della famiglia
   quel prefisso è composto con identificativi **risolti dal server**, quindi lì
   tiene; il problema è strutturale, non una falla aperta. Cinque lettori, e
   ognuno ricostruisce il confine a modo suo — uno di essi confronta ancora con
   `allowedOrganizationIds`, cioè proprio il confronto che ADR-0094 ha bandito.
   La Wave 5 **sposta i documenti della famiglia fuori da `Asset`**; ciò che
   resta (logo del club, allegati dei moduli V1) va a un WP successivo.
2. **Il perimetro dell'allenatore non era un confine.** Lo diventa in 5A e 5B.

### Multi-sede: dove la sede manca, e dove non deve diventare un confine

Il modello sede è corretto e recente (ADR-0038, ADR-0055): sede e categoria
sono concetti separati, il gruppo operativo è la loro coppia, un club con una
sola sede non vede alcun filtro, e **una riga senza sede appartiene a tutte le
sedi**. Quest'ultima regola va tenuta ferma: è ciò che impedisce a un filtro di
far sparire un dato preesistente.

| Entità | Sede oggi | Dopo la Wave 5 |
|---|---|---|
| Appartenenza a categoria | Sì, colonna vera | Invariata |
| Struttura | Sì | Invariata, più la **capienza** |
| Gruppo operativo | Sì, è la sua definizione | Invariato |
| Conti, movimenti, moduli, bandi, RSVP, pubblico | Sì | Invariati |
| **Allenamento** | Solo **derivata** dalla struttura: se la struttura non ha sede, l'evento resta visibile con qualunque filtro | Colonna propria, con la derivazione come valore predefinito alla migrazione |
| **Gara** | **Nessuna**, e nessun filtro nella pagina | Colonna propria e filtro |
| **Appuntamento** | **Nessuna** | Colonna propria |
| **Orari di apertura** | **Uno solo per club** | Slot per sede; gli orari di club restano come fallback |

**La sede resta un filtro, non un confine di sicurezza** — con una sola
eccezione, dichiarata: dove il dato è personale e il perimetro dell'operatore è
il gruppo operativo (atleti, presenze, documenti dell'atleta), il perimetro
diventa vincolante lato server (5B). Altrove la sede continua a servire a
lavorare, non a proteggere. Confondere le due cose produrrebbe esattamente il
difetto che il modello sede evita per costruzione: un dato senza sede che
sparisce.

### Cosa la UAT deve provare, e il §22 lo prova

Due club veri, con dati veri in entrambi; un club con due sedi; un genitore con
figli in categorie diverse; un allenatore con più gruppi; e undici tentativi di
attraversamento del confine, sulla falsariga della prova IDOR del Blocco E e
della sonda `x-active-club-id` della Wave 4.

---

## 20 — Rischi privacy e legali

La regola del brief è la stessa che la Wave 3 e la Wave 4 hanno già applicato:
**separare il motore software dal contenuto legale ed editoriale**, e non
inventare testi o requisiti normativi non validati. Qui la si applica alla
lettera.

### La distinzione, dichiarata prima del codice

| Classe | Significato | Chi decide |
|---|---|---|
| **A — motore** | Meccanismi che valgono qualunque sia la regola: chi può leggere cosa, cosa lascia traccia, quanto dura un dato, come si prova un'accettazione | Noi, in questa Wave |
| **B — rappresentazione** | Modellare un fatto senza deciderne il contenuto: che un consenso ha una versione, un testo e una revoca | Noi, senza contenuto |
| **C — contenuto** | Il testo dell'informativa, la base giuridica, la durata di conservazione, chi è titolare e chi responsabile | **Non noi.** Serve una firma professionale |
| **D — fuori Wave** | Trattamenti che oggi non facciamo | — |

**La Wave 5 implementa A e B. Non scrive una riga di C.** Dove serve un testo,
il prodotto mostra un campo vuoto e un avviso, non un testo inventato — la
stessa regola di ADR-0092 sul catalogo dei modelli.

### I rischi concreti, censiti

| # | Rischio | Stato a HEAD | Cosa fa la Wave 5 | Classe |
|---|---|---|---|---|
| P-1 | **Dati sanitari di minori visibili a chi non deve** | La maschera è nel browser e nasce aperta (D-4) | Permesso server-side, default negato sul contenuto clinico | A |
| P-2 | **Nessuna traccia di chi ha letto il dato di un minore** | Zero audit sulle letture della famiglia e sugli allegati | Audit sulle letture di certificati e documenti del minore | A |
| P-3 | **L'evidenza di un consenso non porta IP né user-agent** | `recordConsentDecision` non riceve la richiesta | Li registra | A |
| P-4 | **Il consenso lo dichiara sempre un operatore, mai la famiglia** | `decided_by` è l'operatore anche quando la spunta l'ha messa il genitore | Decisore «soggetto»: il tutore decide per sé e per il minore | A + B |
| P-5 | **Revocare un consenso non cambia chi riceve una comunicazione** | Nessuno dei cinque percorsi di invio consulta il registro (`W4-R18`) | **Solo il presidio**: un motivo di esclusione «consenso revocato» nel risolutore unico, e il divieto di aggiungere un sesto percorso che lo aggiri. La politica è C | A (presidio) + C (politica) |
| P-6 | **Il documento di un minore viaggia in un archivio senza colonna di club** | Il confine è un prefisso di stringa | I documenti della famiglia escono da `Asset` | A |
| P-7 | **Un file caricato non è validato oltre il tipo dichiarato** | Nessun controllo dei magic byte, nessun antivirus | Fuori Wave, censito | D |
| P-8 | **Retention: nessun dato dichiara quanto vive** | ADR-0019 la dichiara bloccante; `WP-16` è parziale | Le tabelle nuove **dichiarano la finalità nel commento di schema**, come già fanno le tabelle della Wave 4. La politica di cancellazione resta C | B + C |
| P-9 | **Nessuna interfaccia per consultare l'audit** | Il registro è write-only: zero letture in `src/` | Fuori Wave (`WP-16`). Ma la Wave 5 **aumenta** ciò che scrive, quindi il debito cresce: va nominato | D |

### Le tre domande di classe C da porre prima della produzione

Non le rispondiamo, e non le lasciamo implicite:

1. **Quale consenso governa quale invio?** Una comunicazione di servizio (una
   convocazione, un promemoria di scadenza) e una comunicazione promozionale
   non hanno la stessa base giuridica. Finché la risposta non c'è, il
   presidio P-5 resta inerte per costruzione.
2. **Chi può accettare per un minore, e fino a quale età?** Il prodotto oggi
   assume il tutore. È ragionevole e non è validato.
3. **Quanto vive un documento rifiutato, e quanto un certificato scaduto?**
   Oggi vivono per sempre. Un archivio di dati sanitari che non scade è, di per
   sé, un rischio.

---

## 21 — I due residui della Wave 4: W4-R7 e W4-R18

Il brief chiede, per ciascuno, una collocazione fra tre: Wave 5, Wave 6 /
pre-produzione, oppure «richiede prima una decisione di prodotto o legale».
Ecco le due risposte, motivate.

### W4-R7 — Classificazione contabile di compensi sportivi e liquidazioni dei bandi

**Cos'è.** I due rami della vista prima nota proiettano una causale nulla e un
ambito «non specificato», scritti nel SQL: `recordCompensationPayout` e
`createFundingSettlement` **non hanno un campo per la causale**. Su una stagione
vera sono 7.000 euro su 7.210 del non classificato: il buco è quasi tutto
strutturale. La Wave 4 lo ha reso **misurabile** senza chiuderlo — il rendiconto
ora dichiara la quota in denaro invece che in righe.

**Verdetto: Wave 6, previa decisione di prodotto. Non Wave 5.**

Tre ragioni, in ordine di peso:

1. **È fuori tema, e il tema non è un'etichetta.** W4-R7 vive interamente nei
   due domini a scrittore unico del denaro in uscita —
   `sport-work-ledger.ts` e `funding.ts` — e nella vista prima nota. La Wave 5
   non tocca nessuno dei tre. Aprirli per una ragione estranea alla Wave
   significherebbe fare esattamente ciò che CLAUDE.md §3 vieta: refactoring
   opportunistico dentro un cambiamento coerente.
2. **Non è una correzione, è una funzione.** Lo dice la stessa motivazione del
   rinvio: una colonna nuova su due tabelle, due percorsi di scrittura e due
   schermate. Ha la taglia di una lane, e nella Wave 5 non c'è una lane
   contabile.
3. **Manca una decisione di prodotto.** La causale in **uscita** non esiste come
   tassonomia: quella che esiste è nata per le entrate. Decidere se un compenso
   sportivo, un rimborso spese e una liquidazione di bando condividono la stessa
   lista di causali, o se ne servono tre, è una scelta di prodotto con
   conseguenze sul rendiconto. **Va presa prima di pianificare la Wave 6**, non
   durante.

Non è invece bloccato da una decisione **legale**: la classificazione è
contabilità gestionale, non trattamento fiscale, e ADR-0093 tiene già distinte
le due cose.

### W4-R18 — Il registro dei consensi non è consultato da nessun percorso di invio

**Cos'è.** Il registro dei consensi esiste, è append-only e gestisce la revoca
(ADR-0090). I cinque percorsi che spediscono — pubblico, comunicazioni,
bacheca, automazioni, solleciti — **non lo interrogano mai**. Riverificato in
questa sessione: `grep consent` su ciascuno dei cinque file dà **zero**, e
l'unica occorrenza lessicale in `payment-reminders.ts` è la parola «consentiti»
in una allowlist. `AudienceExclusionReason` ha sei membri — nessun tutore,
nessuna email, nessun account, non attivo, duplicato, già inviato — e **nessuno
si chiama «revocato»**.

**Revocare un consenso, oggi, non cambia chi riceve una comunicazione.**

**Verdetto: richiede prima una decisione di prodotto e legale. La politica va
alla Wave 6. La Wave 5 prende solo il presidio che impedisce di peggiorarlo.**

Perché non è semplicemente «Wave 6»:

- **La Wave 5 aggiunge percorsi di invio.** Notifiche di convocazione, richieste
  documentali, solleciti sulle scadenze, conferme di appuntamento. Se il
  collegamento non è deciso, la Wave 5 **moltiplica** il numero di strade che
  ignorano il consenso: il residuo non resterebbe fermo, peggiorerebbe.
- **La decisione non è tecnica.** «Quale consenso governa quale invio» è una
  scelta con effetti legali, ed è di classe C secondo il §20. Nessuna riga di
  codice la può sostituire.

**Cosa fa la Wave 5, e cosa non fa:**

| Fa | Non fa |
|---|---|
| Aggiunge il motivo di esclusione `consent_revoked` a `AudienceExclusionReason`, con la sua etichetta | Non decide quale consenso governa quale invio |
| Predispone il punto di consultazione **dentro l'unico risolutore del pubblico** (ADR-0087), inerte finché nessun tipo di invio dichiara un consenso richiesto | Non attiva nessun filtro: il comportamento a HEAD non cambia |
| Impone che **ogni** invio nuovo della Wave 5 passi dal risolutore unico, mai da una strada propria | Non tocca i cinque percorsi esistenti |
| Registra nella KB le tre domande di classe C del §20 | Non scrive testi legali |

Il risultato: quando la decisione arriva, collegarla è **una configurazione, non
un rifacimento**. È il minimo che si possa fare senza invadere un terreno che
non ci compete, e il massimo che si possa fare senza la decisione.

---

## 22 — UAT definita prima del codice

Gli scenari sono decisi **adesso**, prima di scrivere una riga, per la stessa
ragione della Wave 4: una UAT scritta dopo collauda ciò che è stato costruito,
non ciò che serve.

E per una ragione in più, che questa Wave ha imparato dalla propria
ricognizione: **i tre difetti BLOCKER del §4 non sono visibili da nessuno dei
quattro gate.** 3.632 test verdi, typecheck pulito, build a 153 route, e tre
superfici che non funzionano. Ogni scenario qui sotto è quindi un'operazione
**eseguita davvero a runtime**, non un test.

### L'ambiente

Due club veri sullo stesso archivio. **Club A**: due sedi, quattro categorie,
120 atleti, tre allenatori, due stagioni. **Club B**: mono-sede, 40 atleti,
un allenatore. Un genitore con **tre figli** — due nel club A in categorie
diverse e sedi diverse, uno nel club B. Un allenatore del club A con **due
gruppi operativi** su due sedi.

### Gli scenari

#### U-01 — Due club

1. Con l'utente del club A, elencare atleti, eventi, documenti, appuntamenti.
   Ripetere con il club B. **Nessuna riga dell'uno compare nell'altro.**
2. Cambiare club attivo e ripetere: i contatori cambiano, e non si sommano.
3. Un genitore con figli in entrambi i club: passa da un figlio all'altro
   attraversando il confine di club, e **ogni volta vede solo il club giusto**.

#### U-02 — Più sedi

1. Nel club A, filtrare calendario, convocazioni, appuntamenti e documenti per
   sede: i conteggi tornano.
2. Creare un evento **senza sede**: resta visibile con qualunque filtro
   (ADR-0038). È la proprietà che protegge il dato preesistente.
3. Configurare slot di appuntamento **solo sulla sede 2**: la famiglia di un
   atleta della sede 1 non li vede.
4. Nel club B, mono-sede: **nessun filtro sede compare in nessuna schermata.**

#### U-03 — Più figli per lo stesso genitore

1. Accedere e vedere **tre** figli.
2. Passare dal figlio 1 al figlio 2 dello **stesso club**: si apre. *(Oggi
   rimbalza: è D-3.)*
3. Ricaricare la pagina con F5 sul figlio 2: **resta sul figlio 2**. *(Oggi
   porta a `/account`.)*
4. Passare al figlio del club B: si apre, e il club attivo cambia.
5. Un tutore legato **solo per email verificata**, senza collegamento diretto:
   accede lo stesso.

#### U-04 — Figli in categorie differenti

1. Il calendario del figlio 1 mostra gli eventi della sua categoria e non
   quelli del figlio 2.
2. Una comunicazione mandata a una sola categoria arriva nella bacheca del
   genitore **una volta**, e riferita al figlio giusto.
3. Una convocazione del figlio 2 non compare fra quelle del figlio 1.

#### U-05 — Allenatore con più gruppi

1. Vede gli eventi di **entrambi** i gruppi, e nessuno degli altri.
2. Vede gli atleti di entrambi i gruppi, e **nessun altro**.
3. Chiamare `GET /api/v1/simplified_athletes` **senza** parametri dalla sua
   sessione: la risposta contiene **solo** i suoi atleti. *(Oggi contiene
   tutto il club: è D-5.)*
4. I permessi che il club gli ha configurato in `/permissions` sono quelli che
   vede applicati. *(Oggi vede i default: è D-2.)*
5. Cambiare stagione con riporto: le sue assegnazioni **restano valide** e la
   dashboard non si svuota.

#### U-06 — Ruoli personalizzati

**Non eseguibile come scritto**: il motore non esiste (§12, W5-67). Al suo posto
si prova ciò che esiste, e si registra la sostituzione:

1. A un allenatore è negato `clinical.read`: apre la scheda di un proprio
   atleta e **non vede** allergie, farmaci, gruppo sanguigno.
2. Lo stesso allenatore chiama direttamente `GET /api/v1/athletes` e
   `GET /api/v1/medical_certificates`: **il dato clinico non è nella
   risposta.** *(È la differenza fra oggi e domani.)*
3. **Vede però** lo stato e la scadenza del certificato, perché
   `clinical.status_read` gli è concesso: può decidere se convocarlo.
4. Un collaboratore, che ha `clinical.read`, vede il contenuto. La differenza
   fra i due la fa il server, non lo schermo.

#### U-07 — Iscrizione di un nuovo atleta

1. Da anonimo, compilare il modulo pubblico di iscrizione con due allegati.
2. Ricevere il **riferimento** e consultare lo stato: «inviata».
3. In segreteria la domanda appare in coda con i duplicati **mostrati e non
   risolti**.
4. La segreteria emette una **richiesta documentale** per il certificato
   mancante invece di respingere.
5. All'approvazione nascono atleta, appartenenza, tutori, consensi e allegati —
   e gli allegati stanno in **Attachment Core**, non in `Asset`.
6. La famiglia consulta lo stato: «approvata».

#### U-08 — Rinnovo di un atleta esistente

1. Il genitore apre il rinnovo per la stagione nuova: il modulo è
   **precompilato**.
2. Corregge un dato, conferma, e la domanda entra in coda.
3. Approvata, l'atleta è iscritto alla stagione nuova **senza** che nessuno
   abbia riscritto l'anagrafica a mano.
4. Il riporto stagionale gestionale continua a funzionare come prima.

#### U-09 — Documento richiesto dal club

1. La segreteria vede il certificato mancante sulla scheda atleta e crea la
   richiesta con scadenza.
2. Il genitore la trova nella propria dashboard, con la scadenza.
3. Carica un PDF: la richiesta passa a «da verificare» e il club riceve la
   notifica.
4. Il file è un `Attachment` con il club sulla riga, e **non** un `Asset`.

#### U-10 — Documento spontaneo del genitore

1. Il genitore carica un documento **che nessuno ha chiesto**.
2. Finisce nella stessa coda «da verificare», con `request_id` nullo.
3. Stessa decisione, stesso esito.

#### U-11 — Accettazione e rifiuto

1. Un operatore con `documents.review` apre il documento e lo **accetta**:
   entra nel fascicolo ufficiale, il genitore riceve la notifica.
2. Un secondo documento viene **rifiutato con motivo**: il genitore vede il
   motivo e può ricaricare.
3. Un operatore **senza** `documents.review` tenta di accettare: `403`, e la
   risposta contiene `Accesso negato`.
4. **Entrambe le decisioni lasciano una riga di audit** con attore, esito e
   motivo. *(Oggi non ne lasciano nessuna.)*
5. Un genitore tenta di accedere al documento di un atleta di un altro club
   conoscendone l'identificativo: la riga risulta **inesistente**, non negata.

#### U-12 — Certificato scaduto

1. Un certificato con scadenza a ieri: l'atleta risulta scaduto in **tutte** le
   schermate — scheda, elenco, convocazioni, appello.
2. L'allenatore che lo convoca vede l'avviso. *(Il blocco resta un avviso, non
   un divieto: non lo cambiamo in questa Wave.)*
3. Il promemoria notturno parte una sola volta, e la seconda esecuzione **non
   ne manda un altro**.
4. Il genitore carica il rinnovo, il club accetta, e la riga **promuove** un
   `medical_certificate` nuovo: lo stato cambia ovunque **senza** che nessuno
   scriva `status` a mano.

#### U-13 — Appuntamenti

1. Il genitore vede gli **slot liberi** della sede del figlio e ne sceglie uno.
2. La segreteria vede la richiesta in coda, la **conferma**: il genitore
   riceve notifica in-app **e** email.
3. Una seconda richiesta viene **rifiutata con motivo**: il motivo arriva alla
   famiglia.
4. Una terza viene **riprogrammata** dalla segreteria: nasce una riga nuova, la
   vecchia si chiude, e l'audit racconta entrambe.
5. La famiglia **annulla** un appuntamento confermato: il club è avvisato.
6. Un allenatore vede **solo** gli appuntamenti a lui assegnati, e li conferma.
7. **La prova che oggi fallisce**: dopo che una famiglia ha inviato una
   richiesta, la segreteria opera un altro appuntamento dal CRUD generico. **La
   richiesta della famiglia è ancora lì.** *(Oggi sparisce: è D-1.)*

#### U-14 — Convocazione e RSVP

1. Creare una gara con «richiedi conferma» e una scadenza. *(Oggi la casella
   non esiste in nessuna schermata: è W5-05.)*
2. Convocare dodici atleti: i genitori ricevono la notifica.
3. Tre confermano, due rifiutano, sette non rispondono.
4. L'allenatore vede tre colonne, e **«senza risposta» conta sette**.
5. Mandare una comunicazione **ai soli non rispondenti**: ne partono sette.
6. Dopo la scadenza, la risposta non è più accettata.
7. Fare l'appello: due presenti che avevano detto no, e un assente che aveva
   detto sì. **La presenza non riscrive l'RSVP e l'RSVP non riscrive la
   presenza** (ADR-0086).
8. La misura per la rendicontazione dei bandi legge **le presenze**, non le
   promesse.

#### U-15 — Isolamento cross-tenant

Sulla falsariga della prova IDOR del Blocco E e della sonda della Wave 4,
**undici tentativi** dalle sessioni del club B verso righe del club A:

leggere un evento · elencare gli eventi dichiarando `organization_id` altrui ·
modificare un evento · cancellarlo · leggere una convocazione · registrare una
presenza · leggere una richiesta documentale · scaricare un allegato ·
confermare un appuntamento · leggere lo slot di disponibilità · le stesse
chiamate con l'header `x-active-club-id` del club A.

**Attesi: undici respinte su undici**, e per le letture la riga deve risultare
**inesistente**, non negata.

#### U-16 — Permessi negati

Per ognuna delle **17 chiavi nuove** del §12, dalla sessione di un ruolo che
non la possiede:

1. La chiamata risponde `403` con `Accesso negato`.
2. **La schermata non mostra il comando**, e nasconderlo non è l'unica difesa:
   la chiamata diretta fallisce comunque.
3. **Ogni diniego lascia una riga di audit** con il nome del permesso.
4. Prova al contrario, obbligatoria: **togliendo la guardia dal codice, il test
   deve fallire.** Un test che passa anche senza la guardia non prova niente.

#### U-17 — Doppio clic e concorrenza

1. **Doppio clic** su: conferma appuntamento, accettazione documento, salvataggio
   convocazioni, risposta RSVP, invio della domanda di iscrizione. Attesi: due
   richieste HTTP, **un solo effetto**.
2. **Due operatori insieme** modificano lo stesso evento: uno vince, l'altro
   riceve un conflitto esplicito. *(Oggi vince l'ultimo, in silenzio.)*
3. **Due famiglie insieme** chiedono lo stesso slot: una ottiene
   l'appuntamento, l'altra un rifiuto **dal vincolo del database**, non dal
   codice applicativo.
4. **Due allenatori insieme** fanno l'appello dello stesso allenamento: nessuna
   riga duplicata, la chiave unica regge.
5. **Il caso che oggi perde dati**: due segretarie salvano due allenamenti
   diversi nello stesso momento. Attesi: **due allenamenti**. *(Oggi ne
   sopravvive uno.)*

#### U-18 — Responsive

Ogni schermata toccata dalla Wave, a **375, 768, 1280 e 1440 px**:

1. Nessuno scorrimento orizzontale del corpo pagina.
2. **Ogni comando ha un nome accessibile** — è il difetto BE-5 del Blocco E,
   che si ripresenta a ogni elenco nuovo.
3. Le etichette delle schede **non spariscono** sotto 640 px (difetto BE-4).
4. A 375 px sono utilizzabili con una mano, in palestra: **appello**,
   **convocazioni**, **risposta RSVP**, **carica documento**.
5. Le pagine `trainer-dashboard` entrano nel test degli invarianti, da cui oggi
   sono **assenti** (W5-63).

### La regola che vale per tutti gli scenari

Uno scenario è superato quando **è stato eseguito**, non quando esiste un test
che lo somiglia. Dove la prova è un fatto — un file caricato davvero, una email
ricevuta davvero, due richieste concorrenti fatte davvero — il consuntivo
riporta il fatto, non il codice.

---

## 23 — Prestazioni

### Il dataset di misura

Lo stesso ordine di grandezza già usato dal Blocco E e dalla Wave 4, esteso
all'attività sportiva: **2 club**, **2 sedi**, **300 atleti**, **2 stagioni**,
**800 eventi** per stagione, **12.000 righe di partecipazione**, **1.200
allegati**, **400 appuntamenti**. Generato attraverso l'API, non con `INSERT`
diretti: è così che il Blocco E ha creato 220 atleti in 3,0 secondi e ha
scoperto che il checkout non partiva.

### Le soglie

| Operazione | Soglia | Perché quella |
|---|---|---|
| Calendario, prima pagina di una stagione | **< 300 ms** | È la pagina che si apre più spesso |
| Calendario, filtro per sede e gruppo | **< 300 ms** | Il filtro non deve costare più della lettura |
| Convocazioni di una gara, 40 atleti | **< 200 ms** | Si usa in piedi, prima di partire |
| Appello di un allenamento, 30 atleti | **< 200 ms** | Idem |
| Riepilogo RSVP di un evento | **< 150 ms** | |
| Fascicolo documenti di un atleta, 30 allegati | **< 250 ms**, e **nessun byte** letto | I metadati stanno su una tabella, i byte su un'altra: è la ragione per cui esistono separate |
| Disponibilità appuntamenti di un giorno | **< 150 ms** | |
| Coda appuntamenti in attesa | **< 250 ms** | |
| Dashboard genitore con tre figli | **< 500 ms** | Include tre calendari, tre fascicoli, i pagamenti |
| Dashboard allenatore con due gruppi | **< 500 ms** | Oggi fa **otto** richieste di cui sette falliscono |

### Cosa cercare, perché sappiamo già dove sta

1. **N+1 sulla partecipazione.** Un calendario che, per ogni evento, conta i
   convocati con una query propria. La misura è quella già collaudata dalla
   Wave 4: **letture per riga**, deterministica, non millisecondi. Soglia: **≤ 8
   letture per riga di partecipazione**.
2. **La paginazione che non è onesta.** `resources.ts` documenta già la
   trappola: stagione e perimetro allenatore filtrano **dopo** la query, quindi
   il totale può mentire. Gli eventi sono season-scoped **e** filtrati per
   gruppo: è esattamente il caso peggiore. La prima cosa da misurare.
3. **Il fascicolo che trascina i byte.** `Attachment` e `AttachmentBlob` sono
   separate proprio per questo. Un `include` distratto annulla la separazione.
4. **La dashboard genitore che moltiplica per il numero di figli.** Tre figli
   non devono costare tre volte: le letture comuni si fanno una volta sola.
5. **Le otto richieste della dashboard allenatore.** Dopo 5A devono essere
   meno, e nessuna deve fallire.

### La regola dichiarata

Come nella Wave 4: **un tetto di pagina non tronca in silenzio.** Se una lista
restituisce meno righe di quante esistono, lo dichiara nella risposta con
totale, limite e `hasMore`.

---

## 24 — Blocker pre-production

Sono le cose che, se non chiuse, impediscono di mettere EasyGame Web V1 in mano
a un club vero. Divise per chi le può chiudere.

### BLOCKER che la Wave 5 chiude

| # | Cosa | Dove |
|---|---|---|
| B-1 | Le richieste di appuntamento delle famiglie si cancellano | 5A, 5E |
| B-2 | La Dashboard Trainer è rotta per la parte configurabile | 5A, 5I |
| B-3 | Un genitore con più figli non raggiunge il secondo | 5A, 5H |
| B-4 | Il dato clinico dei minori è protetto solo dal browser | 5A, 5B |
| B-5 | Il perimetro atleti dell'allenatore lo decide il client | 5A, 5B |
| B-6 | Accettare o rifiutare il documento di un minore non lascia traccia | 5D |
| B-7 | Due archivi del fascicolo dell'atleta | 5D |
| B-8 | L'iscrizione online non dà nessun riscontro alla famiglia | 5G |

### BLOCKER che restano aperti dopo la Wave 5

| # | Cosa | Chi lo chiude | Nota |
|---|---|---|---|
| B-9 | **Nessun error tracking** (G-22, `WP-27`) | Wave 6 / produzione | Oggi un `500` in produzione non lo sa nessuno |
| B-10 | **Nessun ambiente di produzione** (G-02, blocker esterno `X-1`) | Fuori dal repository | |
| B-11 | **Retention: nessun dato dichiara quanto vive** (ADR-0019, `WP-16`) | Decisione + Wave 6 | Bloccante dichiarato dall'ADR stesso |
| B-12 | **Nessuna interfaccia per consultare l'audit** (`WP-16`) | Wave 6 | Il registro è write-only, e la Wave 5 ci scrive di più |
| B-13 | **La revoca di un consenso non cambia i destinatari** (`W4-R18`) | Decisione di prodotto e legale, poi Wave 6 | §21 |
| B-14 | **I ruoli personalizzati non esistono** | **Decisione di prodotto** | Se sono un requisito di produzione, è una lane `L` da pianificare. §12 |
| B-15 | **`/dashboard/access-management` è un mock dichiarato completo** (G-57) | Wave 6 | Va costruita o rimossa: dichiararla completa è la cosa peggiore delle due |
| B-16 | **`Asset` senza colonna di club** | Wave 6 | Dopo 5D non contiene più documenti di minori, ma resta |
| B-17 | **Un file caricato non è validato oltre il tipo dichiarato** | Wave 6 | Nessun magic byte, nessun antivirus, su una superficie aperta alle famiglie |

**B-14 va deciso prima della Wave 6, non durante.** È l'unica voce di questo
elenco che cambia la *dimensione* della Wave successiva a seconda della
risposta.

---

## 25 — Cosa resta alla Wave 6

### Dal registro dei gap: le otto voci `DEFER`

| # | Cosa | Taglia |
|---|---|---|
| W5-13 | Piani di lavoro tecnici, esercizi, carichi, valutazioni | `L` — dominio nuovo |
| W5-36 | Tabella `athlete_guardians`: il legame esce dal JSON | `M` |
| W5-67 | Ruoli personalizzati con permessi granulari e scope | `L` — **previa decisione B-14** |
| W5-68 | `/dashboard/access-management` reale (G-57) | `M` |
| W5-72 | Un registro API solo, che dichiari i permessi | `M` |
| W5-75 | `W4-R7` — classificazione di compensi e liquidazioni | `M` — **previa decisione di prodotto** |
| W5-76 | `W4-R18` — la politica dei consensi sugli invii | `S` in codice, **previa decisione legale** |
| W5-78 | Segnaposto federazione nei documenti (G-52) | `S` |

### Dai blocker: sei voci

`B-9` error tracking · `B-11` retention · `B-12` interfaccia dell'audit ·
`B-15` access management · `B-16` chiusura di `Asset` · `B-17` validazione dei
file caricati.

### Dai gap Golee, fuori dal perimetro di questa Wave

Tesseramento come entità con stato e scadenza (G-30) e i relativi avvisi
(G-53) · capienza con **lista d'attesa** (G-32) · campi personalizzati sulla
persona (G-24) · viste di elenco per compito (G-25) · modifica di massa di un
campo qualunque (G-27) · archivio delle anagrafiche (G-28) · sconti automatici
in iscrizione (G-36) · pagamento contestuale nel modulo (G-37) · nucleo
familiare e sconto fratelli (G-61) · modifica in linea delle scadenze dagli
elenchi (G-64) · ricerca globale (G-65) · azioni rapide (G-66) · controllo
duplicati alla creazione manuale (G-67) · creazione rapida in tre campi (G-68)
· unificazione dei due sistemi di toast (G-69, `WP-14` è pronto da tempo).

### La domanda che la Wave 6 dovrà porsi per prima

**Le due dashboard sono complete al 100%?** Dopo la Wave 5 la risposta è: sì
per Parent, con una sola eccezione dichiarata — il pagamento contestuale
all'iscrizione, che è una funzione e non un buco; sì per Trainer, con due
eccezioni — i piani di lavoro tecnici e la concessione granulare del dato
clinico a un singolo operatore, che dipende da B-14.

Tre voci, tutte e tre nominate, tutte e tre con un proprietario. È questo che
distingue «completo» da «finito».

---

## 26 — Riferimenti

**Documenti di questa Knowledge Base**

- [06 — Modello dati](06-data-model.md) · [08 — Ruoli e permessi](08-roles-and-permissions.md) · [09 — Convenzioni API](09-api-conventions.md) · [10 — UI/UX](10-ui-ux-conventions.md) · [11 — Capability](11-capabilities.md) · [14 — Sicurezza](14-security.md) · [16 — Debito tecnico](16-technical-debt.md) · [18 — Decision log](18-decision-log.md) · [20 — Work Package](20-work-packages.md) · [21 — Backlog](21-backlog.md)
- [23 — Matrice definitiva Web V1](23-v1-release-matrix.md) — nella quale, va detto, **non esiste un solo requisito per la dashboard Parent o Trainer**: il requisito «complete al 100%» è nuovo e senza baseline documentata
- [30 — Golee vs EasyGame: gap audit](30-golee-easygame-gap-audit.md) — fonte dei gap `G-xx`; §3 non aggiornato (`W4-D17`)
- [31](31-wave-1-planning.md)/[32](32-wave-1-implementation-uat.md) · [33](33-wave-2-planning.md)/[34](34-wave-2-implementation-uat.md) · [35](35-wave-3-planning.md)/[36](36-wave-3-implementation-uat.md) · [37](37-wave-4-planning.md)/[38](38-wave-4-implementation-uat.md)

**ADR che vincolano questa Wave**

ADR-0007 (nessun nuovo accoppiamento) · ADR-0019 (privacy, retention e audit
bloccanti) · ADR-0025 (mobile differita) · ADR-0030 e ADR-0038 e ADR-0055
(categoria, sede, gruppo operativo) · ADR-0034 (gli allegati passano da un
servizio con driver) · ADR-0039 e ADR-0088 (i domini escono dalle colonne JSON
del club — **il precedente diretto di questa Wave**) · ADR-0040 (una
compilazione non scrive in anagrafica) · ADR-0041 (numerazione delle migrazioni
in parallelo) · ADR-0043 (sede e categoria le mette il server) · ADR-0058 (la
guardia sta in ogni strada che porta al campo) · ADR-0077 (permessi propri,
default negato) · ADR-0081 (il modello si aprirà sul dato clinico) · ADR-0083
(le automazioni non sono un motore di eventi) · ADR-0084 (un solo registro
delle consegne) · ADR-0085 (il token opaco in archivio) · ADR-0086 (l'RSVP è
un'intenzione, la presenza è un fatto) · ADR-0087 (un solo risolutore del
pubblico) · ADR-0089 (un documento generato non è un allegato) · ADR-0090 (il
consenso è uno stato) · ADR-0091 (il tetto della firma) · ADR-0092 (ownership
redazionale) · ADR-0093 (una vista non è una tabella) · ADR-0094 e ADR-0097 (il
confine è una dichiarazione obbligatoria) · ADR-0096 (un dato che il registro
non sa mostrare non deve poter nascere)

**ADR che questa Wave produrrà**

- **ADR-0098** — L'evento sportivo è una riga, non un elemento di array: perché
  allenamento e gara sono la stessa entità con un tipo, e perché sette gap
  poggiavano su questo mattone.
- **ADR-0099** — La partecipazione a un evento è una riga sola: convocazione,
  risposta e presenza sono tre colonne dello stesso fatto. Estensione di
  ADR-0086 dall'allenamento all'evento.
- **ADR-0100** — La richiesta documentale e il suo deposito sono righe, i byte
  restano in Attachment Core: la chiusura di `AU-5`, e perché un terzo archivio
  non deve nascere.
- **ADR-0101** — L'appuntamento ha un proprietario, uno stato derivato e una
  disponibilità come dato.
- **ADR-0102** — Chi vede lo stato di un certificato non vede per ciò stesso il
  contenuto clinico: il taglio del dato sanitario, e perché il default è
  negato.

**File del codice più citati in questo piano**

`src/lib/server/resources.ts` · `src/lib/access-roles.ts` ·
`src/lib/server/auth.ts` · `src/lib/auth/active-club-boundary.ts` ·
`src/lib/simplified-db.ts` · `src/lib/server/parent-dashboard.ts` ·
`src/lib/server/rsvp.ts` · `src/lib/server/attachments.ts` ·
`src/lib/shared-documents.ts` · `src/lib/server/consents.ts` ·
`src/lib/audience/` · `src/lib/club-sites.ts` · `src/lib/club-seasons.ts` ·
`src/lib/trainer-dashboard-permissions.ts` ·
`src/components/trainer/trainer-dashboard-context.tsx` ·
`src/app/api/parent-dashboard/[athleteId]/appointments/route.ts` ·
`src/app/api/v1/[resource]/route.ts` · `prisma/schema.prisma`
