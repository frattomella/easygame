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

---

## §8 — Il riquadro che compare e non dice niente

I primi sette paragrafi hanno chiuso falle di **perimetro**: dati che uscivano
a chi non doveva vederli. Questo paragrafo e il verso opposto, e nasce dal
collaudo a schermo — quello che [CLAUDE.md §11](../../CLAUDE.md) chiama il
codice **irraggiungibile**, nella sua forma piu silenziosa. Nessun errore,
nessun elenco vuoto, nessun 403: una schermata che si apre, disegna il
contenitore e lascia dentro il vuoto.

Entrambi sono stati trovati aprendo le pagine con un club seminato, non
leggendo il sorgente. Non li avrebbe visti nessuna sonda sulle rotte: le rotte
rispondevano correttamente.

### 8.1 — La bacheca leggeva un campo che nessuno scrive

`TrainerBoardDashboardPage` disegna le note della segreteria che riguardano
l'allenatore, e prendeva il corpo della nota cosi:

```tsx
{String(reminder?.description || reminder?.note || reminder?.data?.description || "")}
```

Nessuna delle tre grafie e quella che il prodotto scrive. Chi compone una nota
e `/secretariat` (`src/app/secretariat/page.tsx`, ~riga 706), che salva
**`content`**, ed e la stessa chiave che rileggono la sua schermata e la
dashboard del club.

L'effetto e stato riprodotto a schermo: il vaglio dei destinatari funzionava —
la nota indirizzata all'allenatore e quella «a tutti gli allenatori» comparivano
entrambe, e il promemoria interno della direzione **no**, che e la correzione
di §1 vista dall'interfaccia — e ogni riquadro portava intestazione, scadenza e
destinatario. E nessun testo. La nota c'era, era arrivata alla persona giusta,
e non diceva niente.

`content` entra **in testa** alla catena e le grafie storiche restano dietro:
una colonna JSON conserva cio che ci e stato scritto in passato, e toglierle
svuoterebbe le note vecchie invece di riempire quelle nuove.

### 8.2 — «I miei compensi» stampava il gettone al posto della qualifica

`sport_work_relationships.role` porta un valore del vocabolario di
`src/lib/sport-work/model.ts` — `COACH`, `ATHLETIC_TRAINER`, `OTHER` — e la
scheda del rapporto lo stampava grezzo. All'allenatore compariva «COACH», e
«OTHER» quando il club non aveva saputo classificarlo. Lo **stato** accanto
passava gia da una tabella di etichette: delle due informazioni della stessa
riga, una era leggibile e l'altra no.

L'etichetta si prende da `SPORT_WORK_ROLE_LABELS`, cioe dal proprietario del
vocabolario, e non da una quarta copia locale: `model.ts` e un modulo puro e le
altre schermate del lavoro sportivo lo importano gia.

### 8.3 — Il collaudo che li ha fatti vedere

`scripts/pp-03-uat-seed.mjs` semina il club di collaudo, e non e un dettaglio
di comodo: **una tabella senza righe non trabocca mai**, e una pagina vuota non
mostra ne una larghezza sbagliata ne un campo letto con il nome sbagliato.

Il seed e cresciuto durante la verifica, e ogni aggiunta corrisponde a una
superficie che senza di essa restava non misurata:

| Cosa semina | Superficie che accende |
|---|---|
| Categorie e sedi **dal registro** (`replaceClubResourceCollections`) | ovunque serva un'etichetta: senza, a schermo compariva l'identificativo |
| `data.medicalCertExpiry` con la grafia canonica | la colonna «Certificato Medico» dell'elenco atleti e i certificati del gruppo |
| Tre note di segreteria, di cui una `club_dashboard` | la bacheca, **e il canarino del vaglio di §1** |
| Due appuntamenti assegnati, uno confermato e uno no | «Appuntamenti», che filtra su `assigned_to_user_id` |
| Persona, rapporto e piano di lavoro sportivo | «I miei compensi», e con essa l'unica tabella della dashboard allenatore che dichiara a mano un `min-w-[560px]` |

L'identificativo del club e **fisso**: con un `randomUUID()` ogni riesecuzione
del seed dava un club nuovo e la sessione aperta nel browser restava appesa a
quello vecchio, cioe la verifica di responsivita ricominciava da capo a ogni
ritocco.

### Verificato

`tests/ui/pp-03-bacheca-e-compensi-allenatore.test.mjs`, quattro prove. La
grafia del campo **non e scritta a mano** nel test: si ricava dal produttore
(`/secretariat`), cosi una rinomina futura fa fallire la prova chiedendo di
allineare il lettore, invece di restare verde su una costante che non
corrisponde piu a niente.

Verifica per mutazione: rimesse le due stesure precedenti, tre prove su quattro
tornano rosse. La quarta — «ogni qualifica del vocabolario ha un'etichetta» —
resta verde, ed e giusto: misura il vocabolario, non la schermata.

---

## §9 — Terzo round di revisione ostile

Mandato diverso dai primi due: i round 1 e 2 avevano battuto eventi, presenze,
perimetri e allegati, e questo e stato lanciato **su quello che era rimasto
fuori** — lavoro sportivo, comunicazioni, documenti, appuntamenti, bacheca,
notifiche, ruoli personalizzati — con l'aggiunta esplicita della domanda al
contrario: *dove si interrompe la catena `DB → dominio → rotta → proiezione →
componente`?*

156 asserzioni contro `easygame_dev_pp03` e le rotte vere. Due falle di
sicurezza, e altrettante incoerenze fra cio che un permesso promette e cio che
un ruolo puo davvero fare.

### 9.1 — La notifica di un altro, per identificativo (CRITICAL)

`applyRecipientScope` chiude l'**elenco**, e lo chiude bene: da
`GET /api/v1/notifications` escono la propria e quelle di tutti, e un
`?user_id=` altrui viene respinto. Ma la **riga singola** non passava di li.

`getResourceById`, `updateResource` e `deleteResource` chiamano
`assertRecordAccess`, che guardava soltanto il club. Con l'identificativo in
mano, un allenatore — o qualunque altro membro, perche il difetto non dipendeva
dal ruolo — otteneva:

```
GET    /api/v1/notifications/<id-del-genitore>      → 200  "INSOLUTO 480,00 EUR — famiglia …"
GET    /api/v1/simplified_notifications/<id>        → 200  (stessa cosa dall'alias)
PATCH  /api/v1/notifications/<id>  {"title":"…"}    → 200, titolo riscritto
DELETE /api/v1/notifications/<id>                   → 200, riga sparita dall'archivio
```

Il confine multi-tenant reggeva: la notifica di un **altro club** restava
negata. Quello che mancava era il confine fra due persone dello stesso club.

E la terza volta che questo file sbaglia nella stessa direzione — la correzione
va nell'elenco, la porta accanto resta aperta — e per questo la guardia sta in
`assertRecordAccess`, che e il punto comune dei tre verbi, e non in ciascuno di
essi. Il verso e lo stesso di `applyRecipientScope`, e non e una seconda regola:
`user_id` nullo vuol dire «di tutti», qualunque altro valore vuol dire «di
quella persona».

La cancellazione e la parte peggiore, ed e la ragione per cui la prova copre
tutti e tre i verbi: una lettura si ripara chiudendola, una riga cancellata non
torna.

### 9.2 — Il contenuto clinico dentro `data` (HIGH)

Misurato end-to-end sulle rotte vere: il proprietario registra un certificato
con `data: { diagnosi, referto, terapia, campoInventatoDaUnClub }`, e
l'allenatore — che ha soltanto `clinical.status_read` — se lo rilegge **intero**
dall'elenco e dalla riga.

La causa e strutturale, non un nome dimenticato: il taglio era un elenco di
**campi vietati** applicato a una colonna JSON **libera**. Sono passati tutti i
nomi italiani (`diagnosi`, `referto`, `patologia`, `terapia`, `farmaci`,
`anamnesi`, `esenzione`, `limitazioni`, `gruppoSanguigno`) e ogni nome che un
club o un'importazione inventera domani.

Dentro `data` si dichiara adesso **cosa passa**: [ADR-0125](18-decision-log.md).
Oggi l'elenco degli ammessi contiene una chiave sola, `source`. Il primo livello
del certificato resta su un elenco di vietati, e non e un'incoerenza — li lo
schema e fisso e l'insieme e chiuso.

Onesta sull'esposizione: non e dimostrato che il prodotto scriva **oggi** quei
nomi da solo — `promoteMedicalCertificate` scrive `{source, submissionId,
requestId, attachmentId}`, tutti gia coperti. La porta era pero aperta a
chiunque abbia `clinical.manage`, alla rotta generica e a qualunque
importazione.

### 9.3 — Cosa il round ha misurato **chiuso**

Vale quanto le due falle, perche dice dove la difesa regge: nessun IDOR sui
compensi (`person_id`, `personId`, `worker_id` in query non spostano la persona;
dodici rotte di direzione del lavoro sportivo tutte negate); bacheca e
comunicazioni in scrittura negate; anagrafica dei colleghi — IBAN, telefono,
note sul rapporto — non esce ne da `/trainers` ne da `/staff_members`;
appuntamenti in scrittura e slot negati; nove porte documentali chiuse o vuote;
atleti e certificati di un'altra squadra negati per elenco **e** per
identificativo, anche fra club diversi; tredici scritture di dominio fuori
perimetro tutte negate; e la falsificazione del gettone di ruolo — `owner`,
`club_manager`, `custom:owner:…`, `custom:club_manager:…` — che non allarga
niente, perche `resolveOrganizationScopeForUser` ricostruisce il gettone
dall'archivio.

### 9.4 — Le incoerenze non chiuse qui, e perche

| Cosa | Perche non qui |
|---|---|
| Il riquadro «Avvisi del club» della bacheca non puo riempirsi per un allenatore: i dieci criteri di `resolveAudience` selezionano **atleti**, e nessuno nomina lo staff | Audience e Communication Core sono di **PP-05**: dependency registrata, debito `PP03-D3` |
| `PATCH /api/v1/[resource]/[id]` scarta il corpo quando la risorsa ha una colonna `data`: risponde 200 e non scrive niente | La rotta generica e la porta di ogni risorsa e di ogni ruolo, con tre lane in parallelo sullo stesso ramo: debito `PP03-D4` |
| `meta.total` della paginazione conta il club e non il perimetro: a un allenatore con 3 atleti dichiara il totale del club | Corretto in §10 |
| `appointments.manage` promette «e configurare la disponibilita» e il server la nega | Corretto in §10 |
| `events.manage` e concesso all'allenatore, il server lo esegue, e nessuna schermata ha il pulsante | Vedi §11 |

### Verificato

`scripts/pp-03-notifiche-e-clinico-probe.mjs` 15/15 contro `easygame_dev_pp03`
e le rotte vere. Verifica per mutazione: rimesse le due stesure precedenti,
tornano rosse esattamente N-02..N-05 e C-01..C-02.

In `npm test`: `tests/server/pp-03-notifica-per-identificativo.test.mjs` (sei
prove, tre verbi piu il verso opposto) e
`tests/lib/pp-03-clinico-dentro-data.test.mjs` (cinque prove, di cui la prima
usa un nome **inventato sul momento** — un test che elencasse i nomi noti
verificherebbe l'elenco, cioe proprio la cosa che si e smesso di usare).
Verifica per mutazione: 7 prove su 11 rosse.

---

## §10 — Due incoerenze che il round ha misurato, e questa lane chiude

### 10.1 — La paginazione contava il club, il perimetro tagliava dopo

`hasPostQueryFilters` elencava i due parametri storici `trainer_scope` e
`trainer_id`. Era giusto quando il filtro dell'allenatore si **chiedeva**; da
quando e diventato implicito sul ruolo — D-5, «non c'e nessun parametro da
omettere per uscirne» — la domanda non e piu «e stato chiesto un filtro?» ma
«ne verra applicato uno?».

Finche guardava i parametri, `take/skip` e `count` giravano **prima** di
`filterTrainerDashboardRecords`:

```
GET /api/v1/athletes?club_id=…&limit=1&offset=0
  → meta = { total: 15, hasMore: true }      con 3 atleti nel perimetro
```

Non e una fuga di righe — le righe restavano tagliate, e percorrendo tutte le
pagine si ritrovano tutti e soli i propri atleti. E la **cardinalita** di un
insieme che non si puo vedere, piu un `hasMore` che offre pagine vuote:
l'interfaccia metteva per iscritto quanto e grande cio che nasconde.

La correzione dichiara il perimetro fra i filtri applicati dopo la query, con
la stessa condizione che `filterTrainerDashboardRecords` usa per accendersi:
una seconda formulazione della stessa domanda sarebbe la prossima divergenza.

### 10.2 — Un'etichetta di permesso che il server smentisce

`appointments.manage` diceva «Confermare, rifiutare, riprogrammare o annullare
un appuntamento, **e configurare la disponibilita**». La seconda meta e vera per
chi amministra il club; ma la chiave e concessa anche a `trainer`, e
`assertPuoConfigurareLaDisponibilita` gli nega gli slot con un 403 — giustamente,
perche gli orari in cui la societa riceve non sono la riga di nessuno.

Un club che spuntava quella casella per un ruolo personalizzato basato su
`trainer` leggeva una promessa che il prodotto non mantiene: la casella che non
fa cio che dice, vietata da [CLAUDE.md §11.5](../../CLAUDE.md). **La chiave non
cambia, ne cambia il suo elenco di ruoli**: cambia l'etichetta, che era la sola
cosa falsa — e dice adesso anche a chi tocca quella funzione, perche togliere
una promessa senza mettere una risposta lascia chi amministra a cercare la
casella giusta.

### Verificato

`tests/server/pp-03-paginazione-perimetro.test.mjs`, cinque prove: il totale, il
`hasMore`, il percorso completo delle pagine (che non deve perdere ne ripetere
righe), il caso senza paginazione, e il **verso opposto** — alla direzione il
conteggio resta quello del club, perche spegnere la paginazione sul database per
tutti era la strada facile e sbagliata. Verifica per mutazione: 2 prove su 5
rosse.

`tests/lib/pp-03-etichetta-appuntamenti.test.mjs`, due prove. Non controllano il
testo esatto — sarebbe un test sull'ortografia — ma la relazione: se la chiave e
concessa a un ruolo **non** gestionale, la sua etichetta non puo promettere di
configurare il club.

---

## §11 — La chiave che aveva il server e non aveva il pulsante

### 11.1 — `events.manage` era completa e irraggiungibile

Il terzo round ha misurato sulle rotte vere, come allenatore della sola
categoria `c1`:

```
POST  /api/v1/events            (categoria c1)            → 200, evento creato
PATCH /api/v1/events/<id>       {"time":"20:00"}          → 200, spostato
POST  /api/v1/events            (categoria c2)            → 403
PATCH /api/v1/events/<id>       {"categories":["c2"]}     → 403
```

Il perimetro regge — e la conferma indipendente della correzione di §7 — e la
chiave e concessa a `trainer` nel catalogo. Ma l'area allenatore offriva
soltanto **«Annulla»** e **«Ripristina»**: `AddTrainingForm` e `AddMatchForm`
sono montati in `/training` e `/matches`, che stanno in
`MANAGEMENT_PATH_PREFIXES`, e `canAccessPath("trainer", "/training")` e `false`.

Due dei tre verbi erano irraggiungibili per il ruolo che li possiede: un
allenatore non poteva spostare di mezz'ora un proprio allenamento. E l'errore
n. 8 di [CLAUDE.md §11](../../CLAUDE.md) nella sua forma canonica — la
capability e completa, e nessuna schermata sa accenderla.

**Cosa e stato aggiunto.** `TrainerEventEditorDialog`, montato dalle due pagine
del calendario dell'allenatore, con «Nuovo allenamento» / «Nuova gara»
nell'intestazione e «Modifica» su ogni evento in calendario.

Non e una seconda implementazione della creazione di un evento: la scrittura
resta l'unica che c'e — `createEvent` / `updateEvent`, cioe
`POST`/`PATCH /api/v1/events`, cioe `src/lib/server/events.ts` (ADR-0098).
Quello che cambia e il **modulo**, perche le due domande sono diverse:
`AddTrainingForm` e il modulo della segreteria — tutte le categorie del club,
ricorrenze, RSVP, allenatori, capienza — e un allenatore in palestra, sul
telefono, ne usa cinque campi e non ha il diritto di toccarne la meta.
Montarlo qui vorrebbe dire disegnare comandi spenti.

**Il gate e `manageTrainingStatus`**, la chiave che governava gia annullamento
e ripristino: e la stessa domanda — questo allenatore tocca il calendario? — e
non ne e stata aggiunta una nuova, che sarebbe stata la sesta casella che
promette un divieto e lo applica solo nel browser (W6-28). Il **nome** della
chiave non cambia perche vive dentro `clubs.settings`: rinominarlo azzererebbe
la scelta gia fatta da ogni club che l'ha spenta. Cambia la sua etichetta, che
adesso dice i quattro verbi invece di due.

Due limiti deliberati: la modifica non compare su un evento **annullato**
(prima si ripristina), e sulle gare non compare su una gara **gia giocata** —
spostare l'orario di cio che e successo non e una correzione del calendario, e
per quella c'e la strada della segreteria (ADR-0112).

### 11.2 — E il pulsante ha trovato subito un difetto della guardia di §7

La prima creazione fatta a schermo — categoria propria, unica, futura — e stata
**rifiutata**:

> Accesso negato: questo evento e condiviso con una squadra che non e tua

Su un evento con una categoria sola, la sua.

`eventWithinTrainerPerimeter` costruiva un elenco **piatto** di riferimenti —
identificativo primario, **nome** primario e tutte le categorie insieme — e §7
ci aveva messo sopra `every` per il modo `"scrittura"`. Il perimetro
dell'allenatore e pero fatto di **identificativi**: il nome della categoria non
ci sta dentro, quindi `every` falliva su **ogni** evento che portasse anche il
nome — cioe su ogni creazione fatta da un modulo che il nome lo manda.

In lettura non faceva danno, perche `some` su una grafia in piu resta `some`.
In scrittura rendeva `events.manage` inutilizzabile, e **falliva chiuso**:
nessun dato usciva, nessuna scrittura passava. Per questo non si e visto per
due Wave — non c'era un pulsante da premere.

**La forma giusta e a due livelli.** Una *categoria* dell'evento e dentro il
perimetro se **una qualunque** delle sue grafie ci sta: l'identificativo o il
nome sono la stessa cosa detta in due modi, ed e la ragione per cui il nome era
nell'elenco. Poi vale la regola dei modi: `lettura` chiede che almeno una
categoria sia dentro, `scrittura` che ci siano tutte.

Il verso opposto e intatto, e le due sonde di §7 lo dicono senza cambiare una
riga: `pp-03-scrittura-evento-condiviso-probe.mjs` resta **15/15** e
`pp-03-eventi-scope-ruoli-probe.mjs` **77/77**.

### 11.3 — E l'RSVP, che l'allenatore poteva leggere e non accendere

`rsvp.read` e dell'allenatore, il riquadro «Hanno risposto» esiste ed e montato
in `AttendanceSheet` — e `rsvpRequired` si scriveva soltanto da
`AddTrainingForm` e `AddMatchForm`, cioe da pagine che l'allenatore non apre.
Il riquadro era quindi **strutturalmente vuoto** salvo che la segreteria
spuntasse la casella al posto suo: la stessa forma di §11.1, spostata di un
passo.

Il modulo nuovo monta `EventRsvpFields`, che e il componente **gia esistente**
con le sue due regole di dominio — la scadenza senza la richiesta non si
scrive, la capienza e un numero e non una coda — e i suoi convertitori. Una
seconda copia sarebbe divergente entro una Wave.

Misurato a schermo e poi sulle rotte vere: l'allenatore ha creato «Amichevole
con RSVP», e in archivio la riga porta `rsvp_required: true`, `rsvp_deadline` e
`capacity: 14`, con il suo `created_by`.

La prova statica dice che il modulo **monta** il componente; non direbbe che il
valore arriva in colonna, perche fra la casella e la riga ci sono il
convertitore, il client, la rotta e `events.ts`.
`scripts/pp-03-rsvp-accensione-probe.mjs` percorre quel tratto — creazione,
rilettura del modulo su un evento esistente, modifica — e misura anche il verso
opposto: a casella spenta la scadenza **non** si scrive, che e la regola di
dominio del convertitore.

### Verificato

| Prova | Esito |
|---|---|
| `tests/server/pp-03-perimetro-scrittura-grafie.test.mjs` | 8/8; per mutazione, rimesso l'elenco piatto, 2 rosse |
| `tests/ui/pp-03-calendario-allenatore-raggiungibile.test.mjs` | 7/7 |
| `scripts/pp-03-scrittura-evento-condiviso-probe.mjs` | 15/15, invariato |
| `scripts/pp-03-eventi-scope-ruoli-probe.mjs` | 77/77, invariato |
| `scripts/pp-03-rsvp-accensione-probe.mjs` | 10/10 contro `easygame_dev_pp03` e le rotte vere |

A schermo, sul club di collaudo: l'allenatore ha creato l'allenamento del
12 settembre e in archivio la riga porta il suo `created_by`; sull'allenamento
**congiunto** la modifica riceve dal server il rifiuto di ADR-0112 — «questo
evento ha gia una storia… annullalo e creane uno nuovo» — e il modulo lo mostra
per intero, che e l'unica informazione utile a chi sta compilando.

---

## §12 — La verifica di responsivita, e cosa ha trovato

Fatta con un browser vero contro il dev server della lane, con la sessione
dell'allenatore del club di collaudo, a **375 / 768 / 1280 / 1440 px**. La
misura non e «sembra a posto»: per ogni pagina si legge
`documentElement.scrollWidth - clientWidth` e si elencano gli elementi il cui
bordo destro supera la larghezza del documento.

| Pagina | 375 | 768 | 1280 | 1440 |
|---|---|---|---|---|
| Home | 0 | 0 | 0 | 0 |
| Allenamenti | 0 | 0 | 0 | 0 |
| Gare | 0 | 0 | 0 | 0 |
| Atleti | 0 | 0 | 0 | 0 |
| Squadre | 0 | 0 | 0 | 0 |
| Bacheca | 0 | 0 | 0 | 0 |
| Documenti | 0 | 0 | 0 | 0 |
| Appuntamenti | 0 | 0 | 0 | 0 |
| Notifiche | 0 | 0 | 0 | 0 |
| I miei compensi | 0 | 0 | 0 | 0 |

Nessun traboccamento orizzontale del documento a nessuna delle quattro
larghezze. **Non e un risultato banale e non e un caso**: le due tabelle larghe
dell'area — l'elenco atleti e le rate dei compensi — dichiarano una larghezza
minima (`min-w-[560px]` sulle rate) e stanno dentro un contenitore
`overflow-x-auto`. A 375 px la tabella dei compensi misura 597 px e quella degli
atleti 459: scorrono **dentro il proprio riquadro**, e il documento resta fermo.
E la distinzione che conta su un telefono — si scorre la tabella, non la pagina.

Il modulo nuovo di §11 e stato misurato aperto: a 375 px occupa da 21 a 354 px
in larghezza e 690 px in altezza su 812 di viewport, quindi ci sta senza
scorrere, e dichiara comunque `max-h-[90dvh] overflow-y-auto` per il telefono
piu corto.

**Cosa la verifica ha trovato, e che nessuna sonda avrebbe trovato.** Le tre
correzioni di §8 e la §11.2 sono nate tutte qui: due riquadri che si aprivano
senza contenuto, una qualifica stampata come gettone, e la guardia di scrittura
che rifiutava l'evento proprio. Il mandato chiedeva di verificare la
responsivita; quello che ha prodotto e un elenco di cose che a schermo non
funzionavano e che dal sorgente sembravano a posto.

**Un'osservazione dichiarata e non corretta.** A esattamente 768 px la barra
laterale compare (`hidden md:block`) e occupa 264 px: al contenuto ne restano
504. Funziona — nessun traboccamento, l'elenco atleti mostra le sue dieci righe
— ed e stretto. La barra si puo richiudere a 80 px, e questa e la mitigazione
che esiste; allargare il punto di rottura a `lg` e una decisione di layout per
tutta l'applicazione, non per l'area allenatore, e non e stata presa qui.

### 12.1 — La misura era giusta e insufficiente: si taglia, non trabocca

La tabella qui sopra dice zero su quaranta caselle, ed e vero. **Non basta**, e
il round conclusivo lo ha dimostrato riaprendo le stesse pagine con una misura
diversa.

Il guscio dell'applicazione dichiara `overflow-x-hidden` sul `<main>`. Un
contenuto piu largo dello schermo quindi **non fa traboccare il documento**: lo
si ritaglia, e sparisce senza lasciare traccia nella misura che §12 usava. La
domanda giusta e la seconda — esiste un contenitore che ritaglia il cui
`scrollWidth` supera il proprio `clientWidth`?

Su `/trainer-dashboard/appointments`, a 375 px, la risposta era sì:

    main   375 / 671
    scheda appuntamento   634 px

Di ogni scheda sparivano lo **stato** dell'appuntamento e il **terzo pulsante**,
«Rifiuta». Non un dettaglio estetico: `transitions` — la macchina a stati del
dominio — dichiarava quella transizione ammessa, e la schermata la disegnava
fuori dallo schermo. Su un telefono l'allenatore poteva confermare e
riprogrammare, e non rifiutare. E ancora l'errore n. 8 di CLAUDE.md §11 in
un'altra forma: non codice mancante, codice **irraggiungibile** — questa volta
per una regola di CSS.

La causa e la larghezza minima automatica di una **casella di griglia**, che
vale `min-content`. Dentro la scheda c'e il titolo `truncate`, cioe
`white-space: nowrap`, e il suo `min-content` e l'intera riga di testo: la
colonna non poteva scendere sotto quella misura. Il `min-w-0` sul blocco di
testo **c'era gia** e non poteva bastare — quello lascia scendere il figlio
flex, non la casella della griglia. Serve su entrambi, ed e la stessa regola che
`responsive-invariants.test.mjs` difendeva gia due volte, applicata un livello
piu su.

Dopo: `main` 375/375, la scheda 301 px, il titolo tronca con i puntini, e i tre
pulsanti vanno a capo dentro la scheda.

**Le altre nove pagine sono state rimisurate con il criterio nuovo e sono
pulite.** Gli unici contenitori che ritagliano sono elementi `truncate`, cioe
esattamente cio che il troncamento e; le due tabelle larghe restano dentro il
proprio `overflow-x-auto` e scorrono, che e un'altra cosa.

| Pagina | 375, criterio «taglia» |
|---|---|
| Home, Allenamenti, Gare, Atleti, Squadre, Bacheca, Documenti, Notifiche, I miei compensi | nessun contenitore taglia |
| Appuntamenti | `main` 375/671 **prima**, 375/375 **dopo** |

Il modulo di §11 e stato rimisurato aperto alle quattro larghezze, con la casella
RSVP montata: a 375 px e largo 333 px su 375 e alto 1.022 px di contenuto in 694
visibili, quindi **adesso scorre dentro il proprio riquadro** — a differenza di
quanto §12 diceva prima della casella — e nessuno dei suoi elementi esce dal
modulo. A 768/1280/1440 px e 486 px su 760 di contenuto.

---

## §13 — Un menu intitolato «ALLENATORE» che vedeva un gestore

`mobile-header.tsx` sceglieva quale menu mostrare con
`pathname?.includes("trainer")`. Ci finiscono dentro `/trainers` e
`/trainers/<id>`, che sono schermate **gestionali**: su un telefono, chi apriva
la scheda di un allenatore dall'area di gestione si vedeva comparire un menu
intitolato «ALLENATORE».

Dentro c'erano quattro voci, e tre — `/training`, `/matches`, `/athletes` —
stanno in `MANAGEMENT_PATH_PREFIXES`: a un allenatore vero avrebbero promesso
pagine che `canAccessPath("trainer", …)` gli nega.

Non si vedevano quasi mai, perche `mobile-layout-wrapper` esclude
`/trainer-dashboard` da questa intestazione: erano codice inerte tenuto in vita
da un'esclusione altrove, e l'unica strada per cui uscivano era proprio il
difetto del prefisso.

**Le due meta si tengono.** Il confine si chiede per **prefisso d'area** — lo
stesso confronto che `mobile-layout-wrapper` fa tre file piu in la per decidere
se mostrare l'intestazione, e due modi di rispondere alla stessa domanda erano
gia la causa — e le voci del menu allenatore spariscono, con lo stesso
trattamento che W6-21 ha dato a quelle dell'area famiglia. L'area allenatore ha
il proprio guscio, con la propria navigazione mobile costruita dalle stesse
chiavi di permesso della barra laterale.

`tests/ui/pp-03-intestazione-mobile-aree.test.mjs`, tre prove. La terza e una
sentinella: se domani `/trainer-dashboard` uscisse dall'elenco delle esclusioni,
fallisce e chiede di **ricostruire** il menu con le chiavi giuste, invece di
lasciare l'area senza navigazione.

---

## §14 — Cosa PP-03 ha misurato e non ha chiuso

Oltre a `PP03-D1`..`PP03-D6` gia registrati, il terzo round ha lasciato due
righe in [16 — Debito tecnico](16-technical-debt.md):

- **`PP03-D7`** — `POST /api/v1/notifications` verso un altro membro del club
  risponde 200 a un allenatore, e fa partire un'email. Le tre guardie che
  contano ci sono (niente `user_id` nullo, niente chiave mancante, niente utente
  di un altro club) e sono state misurate; resta un canale uno-a-uno di testo
  libero da un ruolo senza `communications.send`, senza registro consegne e
  senza audit. La domanda — «una notifica indirizzata e una comunicazione?» — e
  del dominio comunicazioni, cioe di PP-05.
- **`PP03-D8`** — `GET /api/v1/appointment-slots` risponde 200 a un allenatore:
  esce la configurazione di ricevimento del club. Non e dato personale, ed e il
  contrario di cio che la guardia di scrittura dichiara. Stringerlo senza aver
  percorso il flusso di prenotazione della famiglia rischia di spegnerlo.

---

## §15 — Il quinto round: quattro HIGH, e nessuno era un ruolo

Round condotto da un revisore indipendente col mandato di **rompere**, con in
mano le nove sonde dei round 3 e 4 perche non rifacesse lavoro gia fatto.
Verdetto: **Critical 0 / High 4 / Medium 5 / Low 5**.

Lo zero sui CRITICAL non e un'assoluzione: i tre dei round precedenti —
appropriazione dell'evento condiviso, notifica altrui per identificativo,
contenuto clinico dentro `data` — sono stati **ribattuti da angolazioni nuove** e
hanno retto. Due dei quattro HIGH erano gia stati **misurati dal round 4 e mai
consegnati**, perche quel round e stato interrotto prima del verdetto: stavano in
una sonda non tracciata, che e la ragione per cui adesso le sonde si committano.

Nessuno dei quattro e un difetto di ruolo. Tutti e quattro sono la stessa forma:
**una regola giusta applicata a una fonte sbagliata**, oppure applicata a una
porta sola.

### 15.1 — La grafia della categoria la sceglieva chi chiama (HIGH)

§11.2 aveva introdotto il livello delle **grafie**: una categoria dell'evento e
dentro il perimetro se una qualunque delle sue grafie ci sta, identificativo o
nome, perche sono la stessa cosa detta in due modi. La forma era giusta e la
fonte no — `category_name` arriva **con la richiesta**.

    POST /api/v1/events {"categoryId":"cat-B","categoryName":"cat-A", …}
      -> 200, riga scritta con category_id = "cat-B"
    GET  /api/v1/events   (come allenatore di B)
      -> ["FORGIATO da Aldo nella categoria di Bruno"]

Bastava dichiarare come nome l'identificativo di una categoria propria per
scrivere sotto la categoria di un altro: l'evento finiva nel calendario di quella
squadra, con il proprio `created_by`, e `assertNoOverlap` girava su quella riga —
quindi si poteva anche occupare un campo e far rifiutare la prenotazione vera. E
§7.1 riaperta nel verso opposto: quella impediva di **portarsi via** l'evento
altrui, questa permetteva di **metterne dentro** uno.

Il contenimento misurato — ed e la ragione per cui non era CRITICAL: sull'evento
forgiato l'appello e la convocazione dei minori di B restavano **negati**, la
lettura non portava le sue persone, e nessun invito RSVP raggiungeva quelle
famiglie. Il secondo recinto, quello sulle persone di §1, ha retto.

**Cosa cambia.** Le grafie di una categoria le compone il **server**, una volta,
dal registro del club (`clubs.categories`), dentro `readTrainerEventPerimeter`:
ogni voce del perimetro si allarga a identificativo **e** nome della categoria
che le corrisponde, e viaggia in `categoryTokens`. Il confronto lato evento resta
sugli **identificativi**, cioe su cio che va in colonna. Il nome dell'evento
parla solo quando l'identificativo tace — un evento storico, di quando la colonna
non c'era — e li non c'e nessun identificativo da contraddire.

Un registro puo essere **ambiguo**, e il round lo ha provato: un club che chiama
una categoria con l'identificativo di un'altra. Un nome vale come grafia solo se
non e l'identificativo di un'altra categoria e non appartiene a due; altrimenti
la voce resta se stessa e fallisce chiuso, che davanti a un registro ambiguo e
l'unica risposta onesta.

### 15.2 — Il ramo dei gruppi usciva prima di guardare le categorie (HIGH)

Seconda porta sulla stessa scrittura, e una correzione sulle sole grafie non
l'avrebbe chiusa:

    POST /api/v1/events {"groupIds":["grp-proprio"],"categoryId":"cat-altrui"}
      -> 200, riga {"category_id":"cat-altrui","group_ids":["grp-proprio"]}

Se l'evento dichiarava gruppi e l'allenatore ne aveva, la funzione **ritornava**
sui soli gruppi: le categorie non venivano guardate affatto, in nessuno dei due
modi.

In **lettura** la scorciatoia resta, ed e ADR-0055: un club multi-sede distingue
i `Pulcini · Scauri` dai `Pulcini · Santi Cosma`, e il gruppo e la risposta piu
precisa; un calendario piu lungo non e un atto. In **scrittura** i due assi
stanno in **AND**, che e la stessa regola di ADR-0103. Un evento che dichiara
**solo** gruppi, tutti propri, resta scrivibile: li l'asse dichiarato e uno solo
ed e tutto dentro — e la riga che lo distingue da «un evento senza categoria e di
nessuno».

### 15.3 — La seconda porta sul registro, che il file aveva gia nominato (HIGH)

`secretariat_notes` non ha una tabella propria: e una riga di
`club_resource_items`. §1 aveva chiuso la porta **per nome**; quella per
**contenitore** arrivava al filtro col nome del contenitore, che in
`TRAINER_DASHBOARD_FILTERED_RESOURCES` non c'e.

    GET /secretariat_notes                                    1 riga
    GET /club_resource_items?resource_type=secretariat_notes  3 righe
    GET /club_resource_items/<id della nota interna>          200
    meta.total sulla seconda porta                            3 invece di 1

Uscivano il promemoria interno della direzione sulla morosita di una famiglia e
la nota nominale su un procedimento disciplinare verso un collega. E la **quarta**
volta che `resources.ts` sbaglia nella stessa direzione — la correzione va
nell'elenco, la porta accanto resta aperta — ed e la porta che il file aveva gia
**nominato per iscritto**: `serializeRecord` ci faceva passare la proiezione, e
non il perimetro.

Il vaglio non e stato riscritto: le righe si smistano per il tipo che portano con
se e si rimandano alla **stessa** funzione, che le giudica come se fossero state
chieste per nome.

**La trappola della correzione, e vale piu del difetto.** La riga grezza tiene i
propri campi dentro `payload`, e `isReminderVisibleToTrainer` e scritta sulla
forma **piatta**, quella che esce dalla rotta. La prima stesura filtrava la forma
sbagliata: zero righe fuori — e zero righe anche per la nota legittima. Non un
dato che esce, una nota che sparisce, e una prova che avesse guardato solo i
segreti avrebbe detto «chiuso». Le due porte appiattiscono ora con la stessa
funzione, `serializeClubResourceItem`, che e la proiezione vera.

### 15.4 — `athletes.data` era rimasta sull'elenco dei vietati (HIGH)

ADR-0125 ha invertito la regola dentro `medical_certificates.data`.
`athletes.data` e la stessa colonna libera, ed era rimasta dall'altra parte. Il
round l'ha vinta come si vince sempre, e da sette porte (`/athletes`,
`/athletes/:id`, `/simplified_athletes`, `?view=summary` e i loro alias), verso un
allenatore con il solo `clinical.status_read`:

    data.schedaSanitaria.allergies      contenitore dal nome nuovo, usciva intero
    data.anamnesi[].patologia           idem
    data.diagnosi / referto / terapia   campi semplici, nomi italiani
    data.source = { diagnosi: … }       sul certificato: nome ammesso, forma no

Tre correzioni, tre livelli.

1. **I contenitori sono per elenco di ammessi, per chiunque.** Un valore composto
   esce solo se il suo nome e dichiarato: sono i contenitori che il prodotto
   scrive davvero, meno quelli gia tolti perche clinici o documentali. Un
   contenitore e il posto in cui il testo libero si nasconde.
2. **Chi vede lo stato e non il contenuto legge tutta `data` per elenco di
   ammessi.** Non e una forma nuova: e la stessa di
   `CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE`, che decide da due Wave cosa un
   allenatore vede della scheda di un **collega**. Il lettore e definito da un
   predicato e non da un nome di ruolo — `clinical.status_read` **e non**
   `clinical.read` — quindi vale anche per i ruoli di club che derivano da
   `trainer`. La **famiglia** non ha nessuna delle due chiavi e non ci rientra:
   legge la scheda del proprio figlio, e per lei non cambia niente.
3. **Dentro `medical_certificates.data` si dichiara anche la forma.** `source` e
   una provenienza, cioe una parola: passa un valore semplice. Un contenitore
   sotto un nome ammesso e l'elenco dei vietati che rientra dalla finestra.

Il prezzo e dichiarato ed e quello di ADR-0125: un campo nuovo che serve
all'allenatore va **aggiunto**, e finche non lo e non si vede. Si e gia pagato una
volta durante questa stessa correzione — `medicalCertificateExpiry`, una delle
cinque grafie con cui il prodotto ha scritto la stessa data, mancava dall'elenco,
e un test di `tests/auth/` l'ha fatto fallire. E il modo giusto in cui questo
errore si manifesta: rosso, subito, invece che silenzioso per mesi.

### Verificato

| Prova | Esito |
|---|---|
| `scripts/pp-03-round4-perimetro-eventi-probe.mjs` | **19/19** (era 12/19) |
| `scripts/pp-03-round5-registro-secondaporta-probe.mjs` | **14/14** (era 10/14) |
| `scripts/pp-03-round4-destinatario-clinico-conteggio-probe.mjs` | **48/48** (era 41/48) |
| `scripts/pp-03-round3-proiezioni-probe.mjs` | 35/36; il rosso e `L-04` = `PP03-D7` |
| `tests/server/pp-03-perimetro-scrittura-grafie.test.mjs` | 12/12 |
| `tests/server/pp-03-registro-seconda-porta.test.mjs` | 6/6; per mutazione, 3 rosse |
| `tests/lib/pp-03-anagrafica-per-elenco-di-ammessi.test.mjs` | 6/6; per mutazione, 3 rosse |
| Regressione invariata | `security` 36/36, `eventi-scope-ruoli` 77/77, `scrittura-evento-condiviso` 15/15, `rsvp-perimetro` 5/5, `allegati-perimetro` 4/4, `revoca-sweep` 9/9, `notifiche-e-clinico` 15/15, `rsvp-accensione` 10/10 |
| `npm test` | 4.717/4.717 |

Le prove nuove non elencano i nomi noti — sarebbe verificare l'elenco, cioe la
cosa che si e smesso di usare. Usano nomi **inventati nel test**, che e l'unico
modo di misurare un default. E ognuna misura il verso opposto: la nota legittima
arriva ancora da entrambe le porte, la famiglia legge il proprio figlio come
prima, l'allenatore continua a vedere la scadenza del certificato.

---

## §16 — Il sesto round riapre §15.4 da due lati

Mandato: «riattacca le quattro correzioni del quinto round». Tre sonde nuove
contro `easygame_dev_pp03` e le rotte vere. Verdetto sul dato clinico:
**Critical 0 / High 2**, ed entrambi erano `PP03-D5` riaperto — non da una
svista, ma dalla **stessa forma** del difetto originale un livello piu sotto.

### §16.1 — Togliere una casella dava piu dato

§15.4 aveva scritto il lettore di `athletes.data` come `readerSeesStatusOnly`:

```ts
hasHealthPermission(role, "clinical.status_read") &&
  !hasHealthPermission(role, "clinical.read")
```

La congiunzione sembra innocua e apre il verso opposto. Un ruolo di club
derivato da `trainer` a cui la societa **toglie anche** la chiave dello stato
non ha nessuna delle due, quindi non e «questo lettore», quindi legge `data`
**intera** — piu dell'allenatore canonico.

Un **privilegio invertito**: la casella che dovrebbe togliere dava. E la terza
volta in due round che questa lane trova una regola giusta applicata a una
fonte sbagliata, e la prima in cui la fonte sbagliata e il **predicato stesso**.

La domanda giusta ha un solo termine — *hai titolo al contenuto clinico?* — e
chi non ce l'ha legge per elenco di ammessi, qualunque sia la ragione per cui
non ce l'ha. `readerReadsDeclaredAthleteFieldsOnly` fallisce **chiuso** anche
su un ruolo assente, nullo o vuoto.

`readerSeesStatusOnly` resta e non decide piu la proiezione: dice una cosa vera
e **diversa** — «questa persona vede lo stato» — che e la domanda a cui
rispondono le schede sanitarie.

### §16.2 — Un contenitore ammesso non e un lasciapassare

§15.4 ammetteva `guardians`, `clothingSizes`, `categories` e `payments` **per
nome** e li lasciava passare **interi**. Il round ci ha scritto dentro quattro
referti e li ha letti tutti da un allenatore canonico:

```
data.guardians[].note        = "nota: …, terapia in corso"
data.clothingSizes.referto   = "esito visita: …"
data.categories[].anamnesi   = …
data.payments[].note         = …
```

Un contenitore ammesso per nome era di nuovo il posto in cui il testo libero si
nasconde, cioe **la ragione stessa** per cui i contenitori erano stati messi su
un elenco di ammessi. La regola vale adesso un livello piu sotto: di una voce
escono i campi dichiarati, e **solo se semplici**. Un valore composto dentro un
contenitore non esce mai — e il secondo posto in cui nascondere un referto, ed
e la stessa forma di `medical_certificates.data.source`.

**La trappola della correzione, e vale piu del difetto.** La prima stesura
dell'elenco per `categories` non aveva `site_id`. `filterTrainerDashboardRecords`
gira sulla riga **gia proiettata** e per il ramo dei gruppi ricade su
`record.category_memberships`: il mister dei «Pulcini · Scauri» ha smesso di
vedere **i propri** atleti, perche la proiezione gli aveva tolto di mano il
campo con cui il suo stesso recinto lo riconosce. Non un dato che esce, un
atleta che sparisce — e una prova che guardasse solo i segreti avrebbe detto
«chiuso».

---

## §17 — Il giro conclusivo: tre HIGH, un Medium, e cosa resta fuori

Le stesse tre sonde, lette fino in fondo, hanno prodotto altri quattro rilievi
oltre ai due di §16. Tutti chiusi qui.

### §17.1 — Un perimetro senza gruppi non e un perimetro su tutti i gruppi (HIGH)

```
Carlo   categorie {alfa}, gruppi {}      (nessun gruppo assegnato)
Bruno   categorie {beta}, gruppi {beta}

POST /api/v1/events   come Carlo
  {"groupIds":["grp-beta"], "categoryId":"cat-alfa"}   -> 200
```

e la riga compare nel **calendario di Bruno**, con il `created_by` di Carlo.
Aldo, che i gruppi ce li ha, riceve **403** per lo stesso identico atto: la
difesa valeva contro chi era gia recintato su quell'asse, cioe contro tutti
tranne chi non lo era affatto.

E Bruno non se la toglie di mezzo: in scrittura le categorie stanno in AND,
`cat-alfa` non e sua, quindi riceve 403 su modifica e annullamento. Un evento
che entra nel suo calendario, che lui non ha scritto e non puo togliere — e
`assertNoOverlap` gira su quella riga, quindi ci si occupa anche un campo.

La condizione era `!gruppiEvento.length || !perimetro.groupIds.length`: quando
**il perimetro** taceva, l'asse spariva e restavano le sole categorie.

**Perche «zero righe = tutto il club» non si applica qui.** Quella e la regola
di [ADR-0103](18-decision-log.md) per l'`access_scope`, dove una riga assente
significa «non ristretto». Questo perimetro non e quello: nasce da
`clubs.trainers[].data`, cioe da cio che l'allenatore ha **assegnato**, e un
elenco vuoto li vuol dire «nessun gruppo», non «tutti». E la stessa lettura che
`readTrainerEventPerimeter` fa gia sull'assenza di profilo, dove `null`
significa «nessun evento» e non «tutto il club».

In **lettura** non cambia niente ([ADR-0055](18-decision-log.md)); in
**scrittura** l'asse che l'evento dichiara e che il perimetro non copre
fallisce chiuso.

### §17.2 — La grafia che finisce in colonna la detta il registro (Medium)

```
PATCH /api/v1/events/<proprio>  {"categoryId":"", "categoryName":"Under 15"}
  -> 200, e la riga resta category_id = "cat-alfa"
     con category_name = "Under 15", che e il nome della squadra di un altro
```

§15.1 aveva tolto il `category_name` del client dal **giudizio** di perimetro.
Restava che quel testo, pur non decidendo piu niente, andava **in colonna** come
arrivava. Nessun perimetro attraversato — l'evento non entra nel calendario di
nessun altro, e la sonda lo misura — ma la riga adesso **mente**: ogni schermata
che stampa il nome mostra l'evento come se fosse dell'altra squadra, e le due
colonne della stessa riga si contraddicono.

Quando l'identificativo c'e ed e nel registro, il nome si **deriva**. Un
identificativo che il registro non conosce lascia passare il nome dichiarato:
togliere l'etichetta a un evento storico sarebbe una perdita di dato, non una
difesa. La riconciliazione gira sulle **tre** porte della stessa scrittura —
creazione, modifica e creazione in blocco — perche coprirne due era la forma di
difetto che questa lane ha gia trovato quattro volte.

### §17.3 — Il contenitore ha la sua riga singola (HIGH)

```
GET /api/v1/discounts/<id>              403
GET /api/v1/club_resource_items/<id>    200   (la stessa riga)
```

e lo stesso per `procure`, `sponsors`, `payment_plans`, `clothing_inventory` e
`opening_hours` — gli sconti concessi alle famiglie, le deleghe legali e i piani
di pagamento. `buildWhereFromSearchParams` toglieva gia dall'**elenco** i tipi
che il ruolo non puo leggere; la lettura **per identificativo** non passa di li.

E la **quinta** volta che `resources.ts` sbaglia nella stessa direzione: la
correzione va nell'elenco e la porta accanto resta aperta. Per questo la guardia
sta in `assertRecordAccess`, che e il punto comune dei tre verbi, e non dentro
ciascuno di essi. `read` e il **pavimento**: chi non puo leggere un tipo non puo
riscriverlo ne cancellarlo.

**E un elenco di negati non sa niente di cio che non conosce.** La sonda ha
scritto una nota di segreteria con il tipo al **singolare**:

```
GET /api/v1/club_resource_items?resource_type=secretariat_note
  -> 200, e l'allenatore legge il promemoria interno della direzione
```

`riservate` si costruisce filtrando `CLUB_RESOURCE_TYPES`, cioe i tipi
**dichiarati**: una grafia che quell'elenco non contiene non e fra i negati,
quindi passa. La forma giusta e quella che [ADR-0125](18-decision-log.md) e
§16.2 hanno gia imposto sul dato clinico — **si dichiara cosa passa**. Chi legge
un sottoinsieme dei tipi dichiarati legge solo quello; la direzione canonica,
che li legge tutti, tiene l'elenco dei negati, perche li un tipo sconosciuto e
una riga storica da non far sparire a chi ha titolo a vederla.

### §17.4 — La terza porta clinica, che il ruolo lo aveva in mano (HIGH)

`GET /api/v1/auth/athlete-profile/<id>` chiamava `stripClinicalAthleteFields`
**senza ruolo**, quindi applicava il solo elenco dei vietati. Misurato con un
ruolo di club a cui la societa aveva **tolto** `clinical.read`: nel corpo
`data.diagnosi`, `data.referto` e il testo libero dentro i quattro contenitori —
cioe cio che il registro generico nega alle stesse chiavi. Una permission che ha
effetto su una porta e non sull'altra non e una permission.

Il legame resta intatto e non passa di qui: l'atleta sul proprio fascicolo entra
da `directAthleteAccess`, dove non si taglia niente; la famiglia a questa rotta
non arriva affatto, perche `managementAccess` chiede un ruolo gestionale.

**Le altre due porte della stessa classe restano aperte e sono dichiarate**:
`data-subject.ts` e `form-submissions.ts` chiamano anch'esse senza ruolo, e li
la correzione non e «passare il ruolo» — quei due moduli servono anche la
famiglia, che arriva con `activeRole` `parent`. Sono `PP03-D17`. **Nessun
allenatore ci arriva**, misurato: `data_subject.export` non e fra le chiavi di
`trainer` ne di un ruolo che ne deriva.

### §17.5 — Un rosso che non era un difetto

`A-06 · GET /sport-work/scheduler negato` era rosso da tre round. Non e una
rotta d'attore: e la porta che invoca Vercel Cron, e dove `CRON_SECRET` non e
configurato risponde **503**, che e il piu chiuso dei dinieghi. La sonda
chiedeva un 403 o un 404. Contato come diniego, che e cio che era.

### Verificato

| Prova | Esito |
|---|---|
| `scripts/pp-03-round6-anagrafica-contenitori-probe.mjs` | **40/40** (era 38/42) |
| `scripts/pp-03-round6-contenitore-altri-tipi-probe.mjs` | **58/58** (era 49/58) |
| `scripts/pp-03-round6-grafie-e-assi-probe.mjs` | **33/33** (era 31/34) |
| `tests/lib/pp-03-lettore-ristretto-e-contenitori.test.mjs` | 7/7 |
| `tests/server/pp-03-assi-e-seconda-porta.test.mjs` | 7/7 |
| Regressione, sonde invariate | `security` 36/36, `eventi-scope-ruoli` 77/77, `scrittura-evento-condiviso` 15/15, `round4-perimetro-eventi` 19/19, `round4-destinatario-clinico-conteggio` 48/48, `round5-registro-secondaporta` 14/14, `rsvp-perimetro` 5/5, `rsvp-accensione` 10/10, `allegati-perimetro` 4/4, `revoca-sweep` 9/9, `notifiche-e-clinico` 15/15 |

**Verifica per mutazione**, una per correzione, tutte eseguite:

| Correzione rimossa | Cosa diventa rosso |
|---|---|
| §16.1, rimesso `readerSeesStatusOnly` | 1 prova su 7 |
| §16.2, disattivato il ramo dei contenitori | 2 prove su 7 |
| §17.1, l'asse dei gruppi torna a tacere | 1 prova su 7 |
| §17.2, la grafia torna quella della richiesta | `A-12` della sonda |
| §17.3, tolta la guardia sulla riga singola | **7 righe** della sonda |
| §17.3, l'elenco torna ai soli negati | `G-01` e `G` della sonda |
| §17.4, il ruolo non viene piu passato | `C-01` e `C-01b` della sonda |

---

## §18 — Il round 7: le due superfici che non sono una riga

Le altre sonde di questa lane misurano il perimetro sulle **righe**: chi compare
in un elenco, chi si raggiunge per identificativo, chi si scrive. Restavano due
cose che una riga non e — i **byte** di un documento e i **destinatari** di una
comunicazione — e il giro conclusivo non si poteva dichiarare chiuso senza
averle misurate direttamente.

`scripts/pp-03-round7-byte-e-destinatari-probe.mjs`, **16/16** su cio che
giudica, piu quattro righe di misura su cio che dichiara e non corregge.

### §18.1 — I byte: `PP04-D10` misurato, e piu preciso di come era scritto

Due attori, entrambi fuori dal recinto dell'atleta bersaglio (categoria `beta`,
sede «Santi Cosma»):

- **Aldo**, allenatore **base**, perimetro in `clubs.trainers[].categories = [alfa]`;
- **Rea**, ruolo di club su base `trainer` con due righe di `club_access_scopes`
  — categoria `alfa` **e** sede «Scauri», i due assi in AND di ADR-0103. Il suo
  profilo in `clubs.trainers` dichiara di proposito **entrambe** le categorie:
  se il perimetro reggesse solo grazie a quella colonna, la sonda non
  misurerebbe l'asse che vuole misurare.

```
GET /api/athletes/<atleta di beta>/documents/<assetId>/file

  Aldo · documento NON clinico     200, 31 byte      <-- esce
  Aldo · certificato medico        403               <-- fermato
  Rea  · documento NON clinico     200, 31 byte      <-- esce
  Rea  · certificato medico        403               <-- fermato
```

Il perimetro di sede e categoria **non vale sui byte** dell'archivio storico.
La rotta chiede il ruolo (`medical_certificates` in lettura), l'appartenenza al
club e — per un certificato — `clinical.read`, e non chiede mai se **questo**
atleta e dentro il recinto di **questo** allenatore.

**La misura corregge il registro di PP-04 in un punto che conta.** Li stava
scritto che un allenatore recintato scarica «l'archivio storico **e il
certificato medico**». Il certificato **non esce**: lo ferma la guardia clinica
di §6.2 di questa lane, che vale su entrambi i rami della rotta. Esce il
documento **non clinico**, ed e gia abbastanza — contratti, documenti
d'identita, moduli firmati di un minore di un'altra squadra.

**PP-03 non lo corregge**, ed e una scelta dichiarata: PP-04 e chiusa, il file
non e di nessuna lane viva, il mandato di questa fase lo assegna
all'integrazione, e la correzione — far scendere `athleteIdsWithinAccessScope`
anche sul ramo dell'archivio — tocca una rotta che serve anche la famiglia. Sta
nei coverage gap, con la misura di sopra invece della descrizione.

E il **complemento esatto** del vincolo che questa lane presidia: dove la lane
ha chiuso il contenuto clinico su sette porte, resta aperta la sola porta in cui
il confine non e clinico ma di perimetro.

### §18.2 — I destinatari: chiusi, e la porta che resta e gia scritta

```
POST /api/v1/announcements           {"audience":{"categoryIds":["beta"]}}   negato
POST /api/v1/communications          {"audience":{"kind":"all_families"}}    negato
POST /api/v1/communications/preview  {"audience":{"categoryIds":["beta"]}}   negato
```

Nessuna escalation di audience: un allenatore non compone un insieme di
destinatari, ne dentro ne fuori dal proprio recinto. La porta che **ha** — la
notifica uno-a-uno di `PP03-D7` — regge i due confini che le restano: un
destinatario fuori dal club e negato, e «a tutto il club» (`user_id` nullo) pure.

### §18.3 — Il riattacco a §17 tiene

- §17.1 dal verso opposto: chi ha **gruppi** e non ha **categorie** non scrive
  nella categoria di un altro, e il suo evento di soli gruppi resta scrivibile.
  La correzione non ha spostato il difetto sull'altro asse.
- §17.3 su una riga creata **dalla rotta** e non dal seed: uno sconto scritto
  dalla direzione resta negato all'allenatore da tutte e tre le grafie del
  percorso — per contenitore, per nome, e per contenitore con `?fields=`.
- §17.4: il fascicolo di un atleta di un'altra categoria resta chiuso, e il
  proprio si legge.

### §18.4 — Una porta che si rompe invece di rispondere

`GET /api/athletes/<id>/documents/<identificativo logico>/file` risponde **500**.
La rotta prova prima il ramo dei depositi documentali, che filtra su una colonna
`uuid`: un identificativo logico — `doc-r7-normale`, cioe la grafia che il
prodotto stesso scrive dentro `data.sharedDocuments` — fa fallire la query con
`invalid input syntax for type uuid` prima che si arrivi al ramo dell'archivio
storico.

Non e un perimetro e non e un ruolo: succede **anche alla direzione**, ed e la
stessa forma gia vista su `club_resource_items`, dove un id logico confrontato
con una colonna `uuid` non «non trova niente» ma fa fallire la query. Debito
`PP03-D19`.

---

## §19 — La verifica di responsivita completa, alle quattro larghezze

Rifatta per intero a fine lane, a schermo, sul club di collaudo `pp03-uat`
seminato da `scripts/pp-03-uat-seed.mjs` e servito da un `next dev` proprio di
questo worktree (porta 3011, per non disturbare le altre lane).

**Il criterio e quello di §12.1, e resta la cosa piu importante di questa
sezione.** `documentElement.scrollWidth - clientWidth` misura il traboccamento
del **documento**, e il guscio dichiara `overflow-x-hidden` sul `<main>`: un
contenuto piu largo dello schermo non fa traboccare niente, viene **ritagliato**
e sparisce senza lasciare traccia in quella misura. La domanda giusta e la
seconda — esiste un contenitore **che ritaglia** il cui `scrollWidth` supera il
proprio `clientWidth`? — con due esclusioni dichiarate: gli elementi che
troncano di proposito (`text-overflow: ellipsis` con `white-space: nowrap`) e
quelli che **scorrono** (`overflow-x: auto`), che e un'altra cosa dal ritaglio.

| Pagina | 375 | 768 | 1280 | 1440 |
|---|---|---|---|---|
| `/trainer-dashboard` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/athletes` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/categories` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/trainings` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/matches` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/board` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/appointments` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/documents` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/notifications` | 0 | 0 | 0 | 0 |
| `/trainer-dashboard/compensi` | 0 | 0 | 0 | 0 |

**Quaranta misure, zero contenitori che ritagliano**, e `documentElement`
`scrollWidth == clientWidth` a tutte e quattro le larghezze su tutte e dieci le
pagine.

### E due cose guardate, non misurate

La tabella qui sopra e una misura, e §12.1 ha insegnato a questa lane che una
misura sbagliata dice zero su quaranta caselle mentre un pulsante e fuori dallo
schermo. Le due correzioni che avevano prodotto quella lezione sono state
**riaperte a schermo**:

- **la scheda appuntamento a 375 px** (§12.1): il titolo tronca con i puntini,
  lo stato compare («Confermato», «In attesa di risposta»), la data compare, e i
  **tre** pulsanti ci sono — «Conferma», «Riprogramma» e **«Rifiuta»**, che vanno
  a capo dentro la scheda invece di finire fuori. E il pulsante che mancava: la
  macchina a stati del dominio dichiarava quella transizione ammessa e la
  schermata la disegnava oltre il bordo;
- **«I miei compensi» a 1440 px** (§8.2): la scheda del rapporto stampa
  «Attrezzista» e non `OTHER`, cioe l'etichetta dal vocabolario di
  `sport-work/model.ts` invece del gettone grezzo, e la tabella delle rate — la
  sola dell'area allenatore che dichiari a mano un `min-w-[560px]` — sta dentro
  il proprio contenitore che scorre.
