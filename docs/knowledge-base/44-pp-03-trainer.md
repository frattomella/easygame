# 44 — PP-03: Trainer production ready

> Verbale della lane **PP-03**, base `0d66921` (tip di PP-01), branch
> `feat/pp-03-trainer`. Stile di [42 — PP-01](42-pp-01-club-atleti-allenamenti.md):
> cosa e stato riprodotto, la causa, cosa e cambiato, come e stato verificato.
>
> Le prove che questo verbale cita vivono in due posti e non sono
> intercambiabili:
>
> - `tests/**/*.test.mjs` — entrano in `npm test`, girano su un doppio di
>   Prisma, e sono la rete che impedisce il ritorno del difetto;
> - `scripts/pp-03-*.mjs` — girano contro **PostgreSQL vero**
>   (`easygame_dev_pp03`) e, dove possibile, contro i **route handler veri**.
>   Sono la misura: un doppio di Prisma diverge dal database su array,
>   `hasSome`, unicita e transazioni, e un test di dominio verde non dice
>   niente sulla rotta.

---

## §1 — L'evento ammesso non ammette le persone dell'evento

**Riprodotto.** Un club, due sedi, tre categorie, due allenatori di una
categoria ciascuno. Un allenamento **congiunto** su due categorie (A e B).

[ADR-0111](18-decision-log.md) fa passare un evento se **almeno una** delle sue
categorie sta nel perimetro di chi guarda: la scelta e giusta, e un allenamento
congiunto appartiene a entrambi gli allenatori. Da li discendeva pero un caso
che nessuno guardava: dall'evento ammesso usciva **tutto il resto**.

**La causa, una sola per quattro difetti.** `assertAtletiDentroIlPerimetro` si
accendeva unicamente se `buildAthleteAccessScopeConditions(scope)` trovava
qualcosa, cioe se l'operatore aveva righe in `club_access_scopes`. **Un
allenatore ordinario non ne ha nessuna**: il suo recinto vive nella scheda
dentro `clubs.trainers`, non in quella tabella. Per quella guardia il suo
perimetro era assente, e «assente» vale «tutto il club»
([ADR-0103](18-decision-log.md)). La guardia c'era e su di lui non si accendeva
mai.

Misurato dalle rotte vere:

- `GET /events/:id/participants` e `GET /events/:id` restituivano **tutti** i
  partecipanti, cioe i minori della categoria A che il suo stesso elenco atleti
  non gli mostra;
- `POST action:"attendance"` su un minore della categoria A rispondeva **200**;
- `POST action:"convoke"` con un elenco **vuoto** cancellava la convocazione di
  quei minori: la ripulitura agisce su cio che l'elenco *non* nomina, quindi non
  passava dal vaglio, e `notIn: []` in SQL non esclude niente.

Inoltre `GET /secretariat_notes` serviva all'allenatore **tutte** le note del
club, compresa quella interna della segreteria e quella indirizzata per nome a
un altro allenatore. Il vaglio esisteva e viveva **solo nel browser**: un filtro
che sta dopo la rete non e un confine, il dato e gia uscito.

**Cosa e cambiato.**

- `src/lib/server/resources.ts` esporta `athleteIdsWithinTrainerPerimeter`, che
  risponde passando le righe vere per lo **stesso** filtro che compone l'elenco
  atleti — una seconda implementazione della stessa regola sarebbe la prossima
  divergenza. Torna `null` per chi non e allenatore: «nessun recinto» non e
  «recinto vuoto».
- `src/lib/server/events.ts`: i due recinti si sommano in
  `assertAtletiDentroIlPerimetro`; `listEventParticipants` **filtra le righe**
  invece di negare l'evento, come fa gia `listClubEvents`; la ripulitura delle
  convocazioni si limita alle persone che chi agisce potrebbe convocare.
- `secretariat_notes` entra in `TRAINER_DASHBOARD_FILTERED_RESOURCES` e il
  vaglio riusa `isReminderVisibleToTrainer`, la stessa funzione pura del
  browser, applicata dove decide.

**Conseguenza dichiarata.** L'allenatore non registra piu da solo la presenza di
un atleta fuori dal proprio perimetro. La convocazione fuori categoria resta
possibile a chi vede tutto il club.

**Verificato.** `scripts/pp-03-security-probe.mjs`, 36/36 contro
`easygame_dev_pp03` e le rotte vere. Verifica per mutazione: spenta la guardia
tornano rosse esattamente A-02, A-04, A-05, A-07; tolto `secretariat_notes`
dall'insieme, C-01 e C-02. In `npm test`:
`tests/server/pp-03-perimetro-persone.test.mjs`, e
`tests/server/perimetro-allenatore.test.mjs` corretto — il suo caso legittimo di
§6 usava un atleta di **un'altra** categoria e passava solo grazie alla falla.

---

## §2 — La lettura dell'allenatore filtra il club dopo, non nella query

**Riprodotto.** Due club, e nei due lo **stesso** identificativo logico di
allenatore. La direzione del primo club apre la propria scheda allenatore e
preme «Scollega account»: risposta «Accesso negato», su un allenatore proprio,
esistente e legittimo.

**La causa.** `caricaAllenatoreDelClubAttivo` — la lettura dietro
`DELETE /api/v1/trainer-accounts/:trainerId` — cercava la scheda in **tutto**
l'archivio e chiedeva il club solo dopo, ad `assertActiveClub`, su cio che aveva
gia trovato.

`payload.path=["id"]` **non e unico**: l'identificativo logico
(`trainer-<istante>-<casuale>`) puo ripetersi fra due club, e `findFirst` senza
filtro ne sceglie uno qualsiasi, nell'ordine dell'archivio. Quando sceglieva la
scheda dell'altro club, la funzione negava. Non una perdita di dato: una
funzione che smette di funzionare, in un modo che nessuno sa spiegare.

Il secondo verso e piu ordinario: la coppia di risposte «non trovato» /
«accesso negato» diceva a chi provava se un identificativo esiste in **qualche**
club. E l'oracolo di esistenza che [CLAUDE.md §8](../../CLAUDE.md) chiude
chiedendo il filtro `organization_id` in ogni query club-scoped. La regola non e
«controlla il club»: e «**filtra** il club».

**Cosa e cambiato.** Le due letture portano
`organization_id: scope.activeOrganizationId`, e l'assenza di un club attivo e
un errore prima della query. `assertActiveClub` resta dov'era: e la seconda
cintura, non la prima.

**Verificato.** `tests/server/pp-03-scollegamento-allenatore.test.mjs`, tre
prove: l'omonimo di un altro club messo **per primo** nell'archivio non nasconde
piu la scheda propria; un identificativo che vive solo altrove risponde «non
trovato» esattamente come uno inventato; la **forma** delle due `findFirst`
porta il filtro, perche altrimenti le prime due prove potrebbero restare verdi
per fortuna. Verifica per mutazione: rimossa la guardia, tutte e tre rosse.

---

## §3 — La revoca che non slega, quando il ruolo e personalizzato

Dependency registrata da **PP-04** verso PP-03 e chiusa qui.

**Riprodotto.** Un club concede a un allenatore una tessera di **ruolo
personalizzato** basato su `trainer` — `custom:trainer:preparatori`
([ADR-0102](18-decision-log.md)). Il proprietario poi la revoca dalla Gestione
Accessi. Dopo la revoca la persona non ha **nessuna** tessera nel club, e la sua
scheda continua a mostrare «Account collegato»: `clubs.trainers[].linkedUserId`
e `club_resource_items.payload.linkedUserId` puntano ancora a lei. Con
`athletes.user_id` succede lo stesso, e con `athletes.data.guardians[]` pure.

**La causa.** `revokeClubAccess` cancella la tessera e poi chiama i quattro
sweep di `src/lib/server/profile-account-links.ts`, perche nessun riferimento
all'utenza sopravviva nel club ([ADR-0110](18-decision-log.md)). I quattro
decidevano se toccare qualcosa confrontando `organization_users.role` con
insiemi di stringhe scritti nel file:

```ts
const TRAINER_ROLES = new Set(["trainer", "allenatore", "coach"]);
```

Quel confronto ignorava due cose.

1. **Un ruolo personalizzato porta uno slug.** In colonna c'e
   `custom:trainer:preparatori`, non `trainer`, e nessuno dei quattro insiemi lo
   conteneva. Per lo sweep quella tessera non era di nessun ruolo, quindi
   revocarla non slegava **niente**.
2. **Gli alias canonici vivono in un elenco solo**, `src/lib/access-roles.ts`.
   Le copie locali ne avevano perse per strada — `allenatrice`, `tutor`,
   `giocatore`, `amministratore`, `segreteria`, `membro` — e ne avevano una
   (`socio`) che il dizionario canonico non riconosce affatto. Ogni alias
   mancante e una revoca che lascia un riferimento vivo; l'alias di troppo e
   una stringa che apre lo sweep senza corrispondere a nessun ruolo.

**Cosa e cambiato.** I quattro insiemi spariscono. Il ruolo di una tessera si
risolve con `normalizeAccessRole`, che e la sola funzione che conosce gli alias
e che, davanti a uno slug, ne estrae la **base**: la base sta nello slug per
costruzione (`buildCustomRoleValue`), e `club-roles.ts` scrive slug e
`custom_role_id` insieme, quindi risolvere dallo slug non chiede una seconda
lettura e da la stessa risposta di `club_roles.base_role`. La firma delle
quattro funzioni non cambia, e nessuno dei due chiamanti
(`revokeClubAccess`, `POST /api/v1/auth/memberships/delete`) ha dovuto adeguarsi.

**Una differenza voluta:** `owner` entra fra i ruoli gestionali. Non c'era, e
non per una ragione: un secondo proprietario si puo revocare — solo il
**fondatore** e protetto, e lo e per la sua `clubs.creator_id`, non per la
tessera — e la sua scheda in `staff_members` restava collegata come tutte le
altre.

**Verificato.**

- `scripts/pp-03-revoca-sweep-probe.mjs`, 9/9 contro `easygame_dev_pp03`
  passando dal dominio vero (`createClubRole`, `assignClubRole`,
  `revokeClubAccess`) e leggendo le colonne dopo. Verifica per mutazione:
  rimessi gli insiemi, 7 prove su 9 tornano rosse — restano verdi solo quella
  che descrive la tessera e quella che verifica che la scheda **dell'altro**
  allenatore non venga toccata.
- `tests/server/pp-03-revoca-sweep-ruolo.test.mjs` in `npm test`, che misura i
  due versi: gli slug e gli alias slegano, e un ruolo estraneo al profilo — o
  sconosciuto al dizionario — **non** slega. Allargare il riconoscimento non
  deve trasformare lo sweep in una scopa che passa ovunque.

**Cosa resta.** Con §3 la produzione di **nuove** righe dangling si ferma. Le
righe gia dangling in archivio restano dove sono: ripulirle e una bonifica dei
dati, non una modifica di codice, ed e annotata come debito `PP03-D1` in
[16 — Debito tecnico](16-technical-debt.md). PP-04 ha registrato lo stesso
difetto dal proprio lato (debito `PP04-D1` nel suo worktree) e lo ha chiuso a
valle: `findAthleteProfileForUser` onora il legame solo finche la persona
appartiene ancora al club, quindi l'area atleta era gia al sicuro a prescindere
da questo sweep.

---

## §4 — Due funzioni sorelle che rispondevano diversamente

**Riprodotto.** Un club crea un ruolo personalizzato basato su `collaborator` e
**non** gli concede `clinical.read`. `hasHealthPermission(gettone,
"clinical.read")` risponde `false` — giusto. `listHealthPermissions(gettone)`
elenca `clinical.read` fra le sue — sbagliato.

**La causa.** Le due funzioni vivono nello stesso file, a tre righe di
distanza, e passavano il ruolo a `roleHasPermission` in due modi diversi:

```ts
const normalized = normalizeAccessRole(role);   // ← "collaborator"
return HEALTH_PERMISSIONS.filter((p) => roleHasPermission(normalized, p));
```

Il ruolo attivo di una tessera personalizzata e il **gettone**
(`custom:collaborator:segreteria#events.read`), e `normalizeAccessRole` ne
estrae la sola **base**: le chiavi concesse sparivano per strada, e l'elenco
rispondeva per il ruolo base. `roleHasPermission` sa gia leggere il gettone e
applica per conto proprio il tetto del ruolo base — normalizzare prima non
aggiungeva una guardia, ne toglieva una.

E la stessa classe che il mandato PP-03 nomina per `narrowDomainPermission`: un
dominio che decide sul ruolo **base** rende inerti le caselle di un ruolo
personalizzato. Qui non serviva `narrowDomainPermission`, perche questo modulo
la matrice propria non ce l'ha: bastava non buttare via il gettone.

**Cosa e cambiato.** `listHealthPermissions` normalizza ancora, ma **solo per
sapere se il ruolo esiste**; la domanda sul permesso riceve il ruolo intero.

**Portata dichiarata.** Nessun chiamante di produzione era esposto: la funzione
oggi la chiama solo un test. Era una trappola armata per il prossimo chiamante,
disarmata prima che qualcuno ci passasse sopra.

**Verificato.**
`tests/lib/pp-03-permessi-sanitari-ruolo-personalizzato.test.mjs`: l'elenco
porta le chiavi concesse e non quelle della base; le due funzioni sorelle danno
la **stessa** risposta su undici ruoli diversi, canonici e personalizzati; e un
ruolo su `trainer` non guadagna il contenuto clinico che la base non ha.
Verifica per mutazione: rimessa la normalizzazione, due prove su tre rosse — la
terza resta verde, perche il tetto lo fa `roleHasPermission` e regge in
entrambe le stesure.

---

## §5 — Cio che PP-03 ha trovato e non ha corretto

**Il gettone non arriva al browser** (debito `PP03-D2`, dependency registrata
verso PP-05). `GET /api/v1/auth/memberships` e
`POST /api/v1/auth/memberships/activate` restituiscono `membership.role`
**grezzo**, cioe lo slug. Il browser lo salva in `activeClub.role` e chiede
`roleHasPermission(activeClub.role, chiave)`: uno slug senza `#` porta
`permissions: []`, quindi ogni ruolo personalizzato riceve `false` su ogni
chiave **lato interfaccia**. La coda di verifica documenti, la sezione account
dell'atleta, l'export e la cancellazione dei dati, il registro attivita: tutte
invisibili a un ruolo personalizzato che le ha concesse.

Due ragioni per cui non e stato chiuso qui.

1. **Ownership.** `src/app/api/v1/auth/**` e di PP-05 nel contratto delle lane
   parallele. La correzione e una riga — emettere `selectedMembership.token`
   invece di `membership.role` — ma non e di PP-03 scriverla.
2. **Non si chiude a valle.** Far accettare a `roleHasPermission` uno slug nudo
   avrebbe reso quello slug il **ruolo base intero**: la scalata esatta che
   ADR-0102 esiste per impedire. Il difetto **fallisce chiuso** — il server
   decide con `scope.activeRole`, che il gettone ce l'ha — quindi nessun dato
   esce e nessuna scrittura passa. Cio che manca e la superficie, non la
   difesa.

---

## §6 — Le altre due porte sullo stesso dato

Trovate da due revisori ostili indipendenti, lanciati con il mandato di
rompere e non di approvare. Sono **la stessa causa di §1**, su due porte che
§1 non aveva percorso: il perimetro delle persone di un allenatore ordinario
vive nella **scheda** dentro `clubs.trainers`, non in `club_access_scopes`, e
chi guardava solo la seconda vedeva un perimetro **assente** — cioe tutto il
club (ADR-0103).

### 6.1 — Il riepilogo RSVP (HIGH)

**Riprodotto.** Allenamento congiunto A+B. L'allenatore della sola B apre
`GET /api/v1/rsvp?training_id=<congiunto>`: riceve **200**, e dentro nomi,
stato di risposta e la **nota libera della famiglia** dei minori della
categoria A. Nella riproduzione la nota diceva «arriva in ritardo, allergia
arachidi»: e testo che il genitore scrive a mano, e ci finisce quello che gli
pare.

**La causa.** `readEventRsvpSummary` (`src/lib/server/rsvp.ts`) chiama
`assertTrainerCanSeeEvent`, che giudica l'**evento** — e dopo ADR-0111 il
congiunto e legittimamente suo. Poi pero compone l'elenco degli attesi con
`resolveExpectedAthletes`, che filtra sulle categorie **dell'evento**. La
stessa falla che §1 ha chiuso su `GET /events/:id/participants`, sulla porta
accanto.

Un dettaglio ha reso la correzione meno ovvia di quanto sembrasse:
`summarizeRsvp` costruisce il proprio universo come `attesi ∪ chi ha
risposto`. Filtrare i soli attesi avrebbe lasciato passare dalla porta di
servizio esattamente le persone piu interessanti — quelle che hanno gia
risposto, e la cui riga porta la nota. Le due liste si tagliano insieme.

**Effetto dichiarato.** Su un allenamento **precedente ai gruppi operativi**,
un allenatore con gruppi dichiarati vedeva tutti gli atleti della categoria e
adesso vede i propri. E coerente con il suo elenco atleti e con
`/events/:id/participants`; la direzione continua a vederli tutti.
`tests/server/rsvp-summary.test.mjs` e stato corretto, non aggirato: il suo
caso di §6 teneva insieme due domande diverse — «puo aprire questo
allenamento?» e «chi ci sta dentro?» — e la risposta piu larga vinceva.

**Verificato.** `scripts/pp-03-rsvp-perimetro-probe.mjs`, 5/5 contro
`easygame_dev_pp03` e le rotte vere (era 3/5).

### 6.2 — Gli allegati (HIGH)

**Riprodotto.** L'allenatore della categoria A chiede
`GET /api/v1/attachments?owner_type=athlete&owner_id=<minore di B>`: riceve
**200** con la riga, e con essa l'identificativo dell'allegato. Poi lo scarica:
**200**, `content-type: application/pdf`, ed e la **carta d'identita** di un
minore di un'altra squadra. Il contenuto clinico restava protetto da
`clinical.read`; tutto il resto no.

**La causa.** `listAttachments` e `assertAttachmentWithinAccessScope`
(`src/lib/server/attachments.ts`) chiedevano solo
`buildAthleteAccessScopeConditions`, cioe `club_access_scopes`. Con l'ironia
che una revisione ha misurato e vale la pena scrivere: un allenatore con ruolo
**personalizzato** e uno scope di categoria era protetto, quello **base** no.
La difesa c'era e si accendeva sulla persona sbagliata.

**Cosa e cambiato.** I due recinti si sommano, e ognuno torna `null` quando non
ha niente da dire — `null` non e l'insieme vuoto. `AttachmentAccessScope`
guadagna `activeRole`, che e cio che serve a sapere se il secondo recinto
esiste.

**Una nota di ownership.** `src/lib/server/attachments.ts` e dichiarato dal
contratto delle lane parallele come file di **nessuna** delle tre. E stato
modificato lo stesso, con il diff piu piccolo possibile, e la ragione e
scritta qui perche l'integrazione la veda: la regola esiste per evitare
conflitti fra lane, e nessuna delle altre due sta scrivendo quel file; il
difetto e la consegna dei byte del documento d'identita di un minore, e il
mandato PP-03 chiede un round di sicurezza con **High 0**. Registrarlo come
dependency lo avrebbe consegnato a nessuno.

**Verificato.** `scripts/pp-03-allegati-perimetro-probe.mjs`, 4/4 (era 3/4), e
`tests/server/pp-03-allegati-perimetro-allenatore.test.mjs` in `npm test`, che
misura anche il verso opposto: la direzione continua a vedere tutti gli
allegati. Verifica per mutazione: tolti i due recinti, due prove su tre rosse.

### 6.3 — Il legame che un proprietario riconosceva e l'altro no

Emerso mentre 6.1 rompeva due test che erano verdi da mesi, e vale piu della
sua riga di diff.

`findClubTrainerProfile` (`events.ts`) riconosce **tre** forme di legame fra
un'utenza e la scheda di un allenatore, e la terza — `entry.id` uguale
all'identificativo dell'utenza — porta gia scritto accanto perche esiste: «un
club che scrive la scheda usando l'identificativo dell'utenza come id del
profilo non veniva riconosciuto qui, mentre `rsvp.ts` lo riconosceva. Due
proprietari, due risposte opposte sullo stesso ingresso».

`isProfileLinkedToUser` (`resources.ts`), che decide la stessa cosa per
l'elenco atleti, quella terza forma non la conosceva. La divergenza falliva
**chiusa**, ed e per questo che non si era vista: quel club aveva un allenatore
con il **calendario pieno** e la **squadra vuota**, senza un errore da nessuna
parte. Si e vista quando il perimetro delle persone e arrivato anche al
riepilogo RSVP, cioe quando le due risposte hanno cominciato a toccarsi.

---

## §7 — La regola di lettura usata come guardia di scrittura

Secondo round di revisione ostile, con un mandato diverso dal primo: eventi,
presenze, perimetri di sede e categoria, ruoli personalizzati. Novantadue
prove contro `easygame_dev_pp03` e le rotte vere.

### 7.1 — L'allenatore che si appropria dell'evento condiviso (CRITICAL)

**Riprodotto.** Allenamento congiunto A+B, con l'appello **gia fatto**
dall'allenatore di A. L'allenatore della sola B manda

```
PATCH /api/v1/events/<congiunto>   {"categoryId":"cat-B","categories":["cat-B"]}
```

e riceve **200**. Da quel momento l'allenatore di A riceve `403` su
`GET /events/:id` e non trova piu l'allenamento in nessun elenco. La riga resta
in archivio con le sue presenze — il dato su cui si rendicontano i contributi
pubblici — e il suo allenatore non ci arriva piu da nessuna porta.

Tre varianti della stessa cosa, tutte misurate: si **sposta** la categoria
primaria su una squadra di cui non si e allenatori; si **aggiunge** all'evento
una categoria altrui, purche fra le altre ce ne sia una propria; si **crea** un
evento per la Prima squadra nominando anche la propria categoria. La creazione
della **sola** categoria altrui era correttamente respinta: la difesa reggeva
solo finche l'attaccante non nominava anche qualcosa di suo.

### 7.2 — E lo cancella, o lo annulla (CRITICAL)

Stessa causa. `DELETE /api/v1/events/<congiunto>` risponde 200 e la riga
sparisce — anche per la squadra A e per le sue famiglie.
`PATCH {"status":"cancelled"}` lo stesso, e passa perche
`assertEventoNonConsolidato` lascia deliberatamente annullare un evento con una
storia: annullare non e modificare.

**La causa, una sola per 7.1 e 7.2.** `eventWithinTrainerPerimeter` chiude con
`.some(...)`: basta **una** categoria dell'evento nel perimetro. E la regola di
[ADR-0111](18-decision-log.md), ed e giusta — per la **lettura**. Le chiamate
di scrittura riusavano il predicato scritto per il calendario. Il doppio
giudizio «la riga com'e + la riga come diventerebbe», che il codice gia faceva
ed e giusto, non salvava: entrambe le forme contengono la categoria
dell'attaccante.

**Cosa e cambiato.** `eventWithinTrainerPerimeter` e il suo gemello per il
perimetro di ruolo (`assertAccessScopeOnEvent`) prendono un modo: `"lettura"`
resta `.some`, `"scrittura"` pretende `.every`. Lo passano i quattro atti che
cambiano l'evento — creazione, modifica, cancellazione, creazione in blocco.
L'appello e la convocazione restano in **lettura**, perche li il confine sulle
persone lo fa un secondo recinto, piu stretto.

Un evento senza nessun riferimento di categoria continua a fallire **chiuso**
in entrambi i modi: `every` su un elenco vuoto risponderebbe vero, e la riga
che lo impedisce e scritta apposta.

Il messaggio del rifiuto distingue i due casi. «Non e di una tua categoria» su
un evento che l'allenatore ha davanti nel proprio calendario manderebbe a
cercare un difetto che non c'e: l'evento e anche suo, ed e proprio per questo
che non puo cambiarlo da solo.

### 7.3 — Appello e convocazione su un evento annullato (HIGH)

**Riprodotto.** Su un evento con `status = "cancelled"`,
`POST action:"attendance"` risponde 200 e in archivio resta `present`. Idem su
uno `archived`. Idem per la convocazione, che fa partire l'invito alla famiglia
per un allenamento gia annullato.

**La causa.** `assertEventTransition` esisteva e viveva **solo** in
`updateClubEvent`: `saveEventAttendance` e `saveEventConvocations` lo stato
dell'evento non lo guardavano affatto.

**Perche conta.** La presenza e la misura di
`src/lib/funding/attendance-measure.ts`: si poteva gonfiare la rendicontazione
dei contributi pubblici su allenamenti che non hanno avuto luogo, e la riga in
archivio diceva «presente» su un evento annullato senza che nessun controllo se
ne accorgesse.

`completed` resta aperto, ed e deliberato: un allenamento concluso e
esattamente quello di cui si fa l'appello, e correggerlo il giorno dopo e la
cosa normale.

### 7.4 — Il registro generico, due porte piu in la (HIGH)

`GET /api/v1/club_event_participants` serve le **stesse righe** che
`listEventParticipants` filtra, e il vaglio qui si fermava all'evento: su un
congiunto uscivano stato di presenza, stato di convocazione e la **nota in
testo libero** su un minore che l'elenco atleti dello stesso allenatore non gli
mostra.

`GET /api/v1/medical_certificates` non aveva **nessun** perimetro
dell'allenatore, in nessuna forma: le due risorse stavano in
`TRAINER_READ_RESOURCES` e non fra quelle filtrate. `clinical.status_read`
risponde a «puo scendere in campo?» — dei **propri** atleti — e da li usciva lo
stato sanitario di minori di un'altra squadra, con l'identificativo della riga.

Entrambe passano ora da `athleteIdsWithinTrainerPerimeter`, la stessa risposta
che compone l'elenco atleti.

Due difetti minori sono emersi scrivendo la prova, e sono chiusi con essa:

- il ramo dei partecipanti confrontava il nome **grezzo** della risorsa mentre
  la decisione di filtrare guarda quello **canonico**: `training_attendance` —
  l'alias storico della stessa tabella — rispondeva **zero righe** dove
  `club_event_participants` ne rispondeva cinque. Falliva chiuso, quindi non
  era una fuga: era la stessa schermata che, a seconda del nome usato, mostrava
  tutto o niente;
- `extractRecordCategoryTokens` non leggeva `category_ids`, cioe la colonna che
  PP-01 §A ha creato apposta perche un evento di tre categorie ne dichiarava
  una. Nel registro generico l'allenatore della **seconda** categoria di un
  congiunto non vedeva i partecipanti del proprio stesso allenamento.

### 7.5 — Lo stato di presenza era testo libero (MEDIUM)

`saveEventAttendance` scriveva
`asText(entry.status).toLowerCase() || "pending"`: qualunque testo. La
convocazione, tre metodi piu sopra, passava gia da
`normalizeConvocationStatus`. Due campi gemelli sulla stessa riga, uno con un
vocabolario e uno senza.

`isPresentAttendance` conta `present` e `presente`: un appello scritto in una
**terza** grafia si salvava senza errore e **non contava** per la
rendicontazione — il club dichiarava all'ente meno ore di quelle fatte, e
nessuno lo segnalava. La colonna accettava inoltre un payload arbitrario, senza
lunghezza massima.

`normalizeAttendanceStatus` (`src/lib/events/model.ts`) riconosce le grafie che
il prodotto ha davvero scritto e **rifiuta** cio che non riconosce. Non
indovina: un valore silenziosamente riscritto sarebbe un appello che dice una
cosa diversa da quella che l'allenatore ha segnato.

### 7.6 — L'errore del driver usciva dalla rete (MEDIUM)

Un `athleteId` che non e un UUID arrivava a `prisma.athlete.findMany` su una
colonna `@db.Uuid`, e il route handler della convocazione rimandava al client
`error.message`: usciva l'invocazione Prisma per intero, nome del modello, nome
del metodo, codice SQLSTATE. E cio che [CLAUDE.md §2](../../CLAUDE.md) assegna
a `observability.ts` per non farlo uscire; su un errore di vincolo lo stesso
canale porterebbe fuori il record che si stava scrivendo.

L'errore si riduce dove nasce. **Non** si filtrano gli identificativi per
forma: `athletes.id` non e un UUID ovunque nella storia di questo prodotto, e
scartare in silenzio direbbe «fuori perimetro» a un atleta che c'e.

### Verificato

| Sonda | Prima | Dopo |
|---|---|---|
| `scripts/pp-03-eventi-scope-ruoli-probe.mjs` | 64/77 | **77/77** |
| `scripts/pp-03-scrittura-evento-condiviso-probe.mjs` | 1/15 | **15/15** |
| `scripts/pp-03-security-probe.mjs` | 36/36 | **36/36** |

In `npm test`: `tests/server/pp-03-evento-condiviso.test.mjs` (verifica per
mutazione: 7 prove su 9 rosse senza le correzioni) e
`tests/server/pp-03-registro-generico-perimetro.test.mjs` (3 su 4 rosse).
Entrambi misurano anche il **verso opposto**: sul proprio evento l'allenatore
puo tutto quello che poteva, l'evento congiunto resta leggibile a entrambi, e
la direzione continua a vedere tutto.

`tests/server/pp-01-perimetro-multi-categoria.test.mjs` e stato corretto, non
aggirato: il suo caso «l'atto su un evento che tocca il proprio perimetro e
ammesso» misurava proprio l'attacco di 7.1, e adesso misura la distinzione fra
leggere e cambiare.
