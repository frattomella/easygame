# 45 — PP-04: Athlete Production Ready

**Data:** 2026-09-04 · **Branch:** `feat/pp-04-athlete` · **Base:** `0d66921`
(tip di PP-01) · **DB di lane:** `easygame_dev_pp04` · **Ambito:** rendere
l'area atleta e l'accesso EasyGame di un atleta utilizzabili in produzione.

Questo documento registra cosa e stato riprodotto, quale era la causa, cosa e
stato cambiato e come e stato verificato. Non e un piano: e il verbale.

---

## 0. Le tre cose che PP-04 ha imparato, e che valgono oltre PP-04

**1. Chiudere una porta non basta se il campo ha due lettori — ne se la funzione ha due rami.**
[ADR-0114](18-decision-log.md#adr-0114--larea-di-un-atleta-si-apre-sulla-tessera-non-sul-legame-superstite)
aveva chiuso l'area atleta sul legame superstite, con la sua sonda verde e il
suo ADR. Ma `athletes.user_id` ha un **secondo** lettore,
`athleteBelongsToParent` in `parent-dashboard.ts`, che consegna strettamente di
piu — denaro, tutori, contenuto clinico, e delle scritture. La porta
d'ingresso era chiusa e quella di servizio dava su una stanza piu grande. La
regola che ne esce: **quando si stringe la lettura di una colonna, si cercano
tutti i suoi lettori.** Un `grep` sul nome costa un minuto.

E non basta nemmeno quello. Il secondo round ha trovato che la guardia nuova
stava su **un ramo solo** di `athleteBelongsToParent`, e che l'altro ramo lo si
raggiungeva con un dato che il prodotto produce da se: `guardians[].email`
uguale all'indirizzo dell'utenza dell'atleta, cioe il caso normale del minore
invitato sulla casella di famiglia. Il Critical non era stato chiuso, era stato
**spostato su una precondizione** (ADR-0122). La forma completa della regola e:
quando si stringe una lettura, si cercano tutti i lettori **e** tutti i rami
che portano al medesimo `return true`.

E un terzo giro ha aggiunto la coda: la guardia nuova era scritta sul campo che
la revoca **azzera**, quindi il gesto che toglieva l'accesso lo riapriva dal
ramo accanto (ADR-0123). Una guardia che poggia su una colonna che un'altra
operazione mette a `null` non e una guardia: e una coincidenza. Prima di
scrivere una condizione di accesso su un campo, si cerca **chi lo cancella**.

**2. Un elenco chiuso vale sulla proiezione, non sulla rotta.** Il commento di
`CAMPI_AREA_ATLETA` dice, correttamente, che denaro, tutori e contenuto clinico
restano fuori «non per dimenticanza». Era vero su una rotta sola: un atleta in
regola apriva `/api/parent-dashboard/<la propria scheda>` e riceveva il payload
intero. Una proiezione difende cio che passa da lei.

**3. Nessun test ha visto due UUID sotto il titolo «Le mie squadre».** Il
campo c'era, aveva un valore, e ogni controllo sui nomi dei campi passava. Lo
ha visto l'apertura della pagina con una sessione vera, a 375 px. E la forma di
[CLAUDE.md §11.8](../../CLAUDE.md) in cui il codice non manca: dice una cosa che
non serve a nessuno.

---

## 1. §1 — «Accesso EasyGame», il quarto stato e la revoca sull'identita

> Decisioni: [ADR-0114](18-decision-log.md#adr-0114--larea-di-un-atleta-si-apre-sulla-tessera-non-sul-legame-superstite),
> [ADR-0115](18-decision-log.md#adr-0115--un-accesso-revocato-non-e-un-accesso-mai-aperto),
> [ADR-0121](18-decision-log.md#adr-0121--revocato-lo-dice-lultimo-invito-non-un-invito-qualunque).

### Riprodotto

**L'area atleta si apriva sul solo legame**, senza chiedere che quella persona
fosse ancora un atleta di quel club. Due strade producono un legame superstite,
entrambe misurate contro PostgreSQL con l'area che rispondeva 200 —
allenamenti, gare, presenze, appuntamenti, documenti, notifiche, stato del
certificato, recapiti:

| Sonda | Strada | Cosa restava |
|---|---|---|
| P-45 | `assignClubRole` cancella le tessere sostituite (`replaced_by_new_role`) senza chiamare nessuno sweep | il legame, dopo un cambio di ruolo in «Collaboratore» |
| P-52 | `unlinkDirectAthleteProfile` riconosce lo **slug**, e da `{athlete, atleta, player}` mancano `giocatore` e `giocatrice` | il legame, dopo una revoca di tessera |

E il verso opposto: `revokeAthleteAccess` cancellava `organization_users` con
`role: "athlete"` **letterale**, quindi una tessera con lo slug italiano o di un
ruolo personalizzato sopravviveva alla revoca (P-53, P-54).

**«Accesso revocato» non era uno stato.** Un accesso tolto tornava `none`, cioe
la stessa scritta di un atleta mai invitato: i due fatti opposti su cui la
segreteria telefona.

### Cambiato

La domanda che apre l'area non e piu «questo legame esiste» ma «questa persona
e ancora un atleta di quel club?», e risponde `normalizeAccessRole` sul ruolo
**risolto** — non un terzo elenco di slug, che e il difetto stesso. Quarto
stato `revoked`, derivato, con `lastInviteEmail`, `lastInviteAt` e `revokedAt`.

Una revisione ostile ha poi trovato che la derivazione aveva un falso positivo:
`revoked_at` lo scrive anche `chiudiInvitoVivo`, cioe il **reinvio** e il
**cambio di indirizzo**. Un invito reinviato e poi scaduto faceva dichiarare al
pannello «questo atleta aveva un accesso e non ce l'ha piu» a chi non ne aveva
mai avuto uno. La domanda si fa ora all'**ultimo** invito (ADR-0121).

Il pannello mostra i quattro stati, l'email collegata, la data dell'ultimo
invito, il reinvio, il cambio di indirizzo, la revoca e la storia. **Nessun
ramo mostra una password**: non ne esiste una da mostrare (ADR-0104).

---

## 2. §2 — Athlete Dashboard V1: tre pagine che il prodotto prometteva

> Decisione: [ADR-0120](18-decision-log.md#adr-0120--delle-categorie-di-un-evento-escono-solo-le-sue).

### Riprodotto

I dati c'erano e nessuna schermata li teneva insieme:

- **le squadre** erano un riquadro decorativo sotto il saluto della home, e non
  c'era nessun posto in cui rispondere a «in quali squadre sono, dove si
  allenano, per quale stagione»;
- **gli allenamenti** erano divisi in due meta che nessuna pagina univa: i
  prossimi nel calendario, quelli svolti sotto le presenze;
- **lo storico** non esisteva.

E le righe degli eventi parlavano in inglese tecnico: `present`, `not_called`,
`unknown` stampati tali e quali su una schermata che spesso legge un ragazzino
— lo stesso difetto gia corretto sugli appuntamenti e sui documenti, rimasto
qui.

Sul **multi-categoria di PP-01** l'area sbagliava squadra: proiettava la sola
`categoryName`, cioe l'etichetta della **primaria**. Su un allenamento
congiunto — il caso in cui la domanda si pone — l'atleta della seconda
categoria leggeva il nome di una squadra che non e la sua.

### Cambiato

Tre rotte nuove sotto `/athlete-dashboard`: `squadre`, `allenamenti`,
`storico`. Cablate nelle **stesse** `ATHLETE_NAV_ITEMS` che alimentano sia la
sidebar del desktop sia il menu del telefono, e nei titoli del guscio.

L'evento proiettato porta ora `categories`, cioe gli identificativi di
`club_events.category_ids` (ADR-0111), **filtrati sulle sole squadre di quell'
atleta** (ADR-0120): la riga incrocia e stampa i nomi delle sue. Le etichette
di presenza e partecipazione escono in italiano, e `unknown` non si stampa —
non e uno stato, e l'assenza di una risposta.

Lo **storico** dichiara il proprio limite invece di lasciarlo credere: la
proiezione porta la stagione attiva e nient'altro, perche
`getParentDashboardData` legge gli eventi del club senza partizionarli per
stagione. Un selettore di stagioni che mostrasse sempre gli stessi numeri
direbbe una cosa falsa con piu convinzione.

**«Le mie squadre» stampava due UUID.**
`athlete_category_memberships.category_name` e nullable e spesso nullo: la
popola solo il rinnovo di stagione. Il nome si risolve ora dal catalogo del
club (`resolveCategoryLabel`), con l'identificativo come ultimo ripiego.

---

## 3. §3 — Privacy: la porta di servizio

> Decisioni: [ADR-0117](18-decision-log.md#adr-0117--la-stessa-domanda-per-i-due-lettori-dello-stesso-campo),
> [ADR-0118](18-decision-log.md#adr-0118--il-cruscotto-della-famiglia-lo-apre-un-tutore).

### Riprodotto (revisione ostile, contro PostgreSQL e le rotte vere)

Con **zero tessere** nel club:

```
GET /api/v1/athlete-accounts/me                 -> 403
GET /api/parent-dashboard/<la stessa scheda>    -> 200
PATCH /api/parent-dashboard/<...>/notifications -> 200, {"updated":1}
```

E con un atleta **perfettamente in regola**, sulla propria scheda:

```
area atleta:            niente denaro, niente clinico, niente tutori
parent-dashboard/<se>:  quote e ricevute, codice fiscale del tutore,
                        diagnosi, e il file_url del certificato medico
```

### Cambiato

La domanda «e ancora un atleta di questo club?» vive in **un modulo solo**,
`src/lib/server/athlete-membership.ts`, e i due lettori la chiamano. Copiarla
avrebbe rifatto il difetto di partenza — due elenchi che divergono — con un
nome nuovo.

Le cinque rotte del cruscotto di famiglia passano `allowSelfAthleteLink:
false`: il payload intero, i **byte** dei documenti, le strutture, il checkout
e i consensi li apre un **tutore**. Il predefinito resta permissivo perche
l'area atleta legge da questo stesso dominio e ne proietta l'elenco chiuso;
invertirlo la spegnerebbe.

Il ramo del tutore non e toccato: un tutore entra per
`guardians[].linkedUserId`, e continua a entrare.

### Il secondo round: la porta era stata spostata, non chiusa

> Decisione: [ADR-0122](18-decision-log.md#adr-0122--chi-e-latleta-non-e-anche-la-propria-famiglia).

Una **seconda** revisione ostile ha rimisurato le due correzioni qui sopra e ha
trovato che nessuna delle due veniva raggiunta.

`athleteBelongsToParent` prova prima il ramo diretto e **poi** quello del
tutore. Il secondo passa da `isGuardianLinkedToUser`, che accetta
`guardians[].email` come ripiego di `linkedUserEmail`. E quella coincidenza il
prodotto la **produce da se**: la segreteria scrive la casella dei genitori nel
tutore, e su quella stessa casella invita il ragazzo. Con l'indirizzo scritto
due volte, l'utenza dell'atleta usciva dal ramo del tutore — dove non esistono
ne `ancoraAtleta` ne `allowSelfAthleteLink` — e il cruscotto tornava a
consegnare tutto. **Anche a chi nel club non aveva piu nessuna tessera.**

Misurato con le sonde P-70…P-76, contro PostgreSQL e contro le rotte vere:
rimessa la guardia precedente, sei prove tornano rosse e i **sette** segreti
seminati riappaiono nel corpo della risposta.

La correzione e in due mosse, e la seconda conta piu della prima:

1. **il ramo diretto e esclusivo.** Chi porta `athletes.user_id` e quella
   scheda, non la sua famiglia: per lui vale il ramo diretto e solo quello. Il
   tutore vero — un'altra persona — non e toccato;
2. **il predefinito si inverte.** `allowSelfAthleteLink` vale `false` se non
   lo si chiede. La forma precedente — predefinito permissivo e deroghe
   negative sparse sulle rotte — vale finche ognuno si ricorda, e la rotta che
   se ne dimentica apre il payload della famiglia **senza dirlo a nessuno**.
   Adesso dimenticarsene chiude una porta invece di aprirla.

Lo dichiarano quattro chiamanti, e un test li conta uno per uno:
`readAthleteAreaOverview`, la bacheca, l'RSVP, e `GET /api/v1/auth/memberships`
— quest'ultimo non per il payload, che li non esce, ma per
`linked_athlete_ids` del ruolo `athlete`, senza cui il rientro nell'area atleta
finisce su `/account`.

**La decisione viaggia con la richiesta, non si fissa.** Dentro
`getParentDashboardData` il payload chiama `getFamilyDocumentAreas`, che chiama
`getDocumentDossier`, che si richiude con la propria guardia: il fascicolo non
si fida di chi lo chiama, ed e giusto cosi. Quella guardia ha ora lo stesso
predefinito restrittivo e **riceve** la risposta gia data da chi ha aperto il
cruscotto. Fissarla a «si» sarebbe stato il predefinito permissivo appena
tolto, spostato di un file: cioe il modo esatto in cui questo Critical si era
gia spostato una volta.

### Il terzo round: la guardia stava sul campo che la revoca cancella

> Decisione: [ADR-0123](18-decision-log.md#adr-0123--essere-una-scheda-non-e-un-campo-e-unidentita-che-la-revoca-non-cancella).

Un **terzo** reviewer indipendente ha rimisurato ADR-0122 e ha trovato che la
quinta strada non era un quinto chiamante: era un **quinto stato**.

La condizione «chi porta `athletes.user_id` e quella scheda» era scritta sul
campo che `unlinkAthleteAccount` e `revokeAthleteAccess` azzerano. Dopo il
gesto, la stessa persona ricadeva nel ramo del tutore, dove la coincidenza
della casella vale come legame:

```
scollegato l'account (la tessera di atleta resta viva):
  GET /api/v1/athlete-accounts/me              -> 403
  GET /api/parent-dashboard/<la stessa scheda> -> 200
      quote, ricevute, diagnosi, file_url del certificato, codice fiscale
      del tutore, allergie, note mediche

revocato l'accesso, con una tessera residua nel club:
  stessa coppia, stesso payload
```

**Il gesto con cui il club toglie l'accesso era il gesto che lo riapriva**, e
piu largo di prima: l'area atleta proietta un elenco chiuso, il cruscotto
della famiglia no.

La correzione sposta la domanda dall'essere un campo all'essere un'identita.
Il fatto durevole e `athlete_account_invites`: un invito **accettato** dice
«questa utenza e diventata l'account di questa scheda», e ne la revoca ne lo
scollegamento lo cancellano. E non e un ripiego:
`acceptAthleteAccountInvite` e **l'unico scrittore** di `athletes.user_id` in
tutto il repository — gli altri tre punti lo azzerano — quindi ogni legame
vivo ha la sua riga.

Si contano solo gli inviti **accettati**: un invito mandato per errore e mai
riscattato non deve togliere a nessun tutore l'area della propria famiglia.

Le sonde della lane hanno dovuto cambiare per poterlo misurare: seminavano il
legame con una `update` a mano, che e uno stato che il prodotto non produce.
Adesso passano dal **riscatto vero**.

#### Quello che resta aperto, e non e di PP-04

Lo stesso ramo del tutore ha la stessa debolezza sul **genitore revocato**, e
li PP-04 non arriva. `clearLinkedFields` (`profile-account-links.ts`, dominio
PP-03) riconosce il legame anche per email e poi ripulisce tutto **tranne**
`email`, che e il campo su cui `isGuardianLinkedToUser` ricade. Misurato: un
padre che e anche allenatore del club, revocato da Gestione Accessi,
continua a leggere del minore quote, diagnosi, `file_url` del certificato e
codice fiscale del tutore — **e a scrivere**.

Non e correggibile dal lato del lettore: un tutore revocato e un tutore mai
collegato hanno la **stessa** riga in archivio. Serve una scrittura, e quella
scrittura e una decisione del dominio che la possiede. Registrato come
**PP04-D8** e come dependency verso PP-02 e PP-03, con la riproduzione.
### Il quarto round: la stessa porta, guardata dall'altro lato

> Decisione: [ADR-0124](18-decision-log.md#adr-0124--unidentita-puo-portare-due-cappelli-e-il-ramo-esclusivo-deve-saperlo).

I tre round precedenti guardavano tutti nella stessa direzione: **chi non deve
entrare, entra**. Il quarto ha guardato nell'altra, e ha trovato che chi doveva
entrare non entrava piu.

Il flusso che ADR-0122 chiama normale — il minore invitato sulla casella di
famiglia — **non crea l'account del minore**. `risolviUtenza` non crea una
seconda utenza per un indirizzo che ne ha gia una: la trova. Quindi
`athletes.user_id` finisce a puntare all'utenza del genitore, `eLaPersonaStessa`
risponde di si, e il cortocircuito mandava il padre sul cancello dell'atleta:

```
il genitore apre il cruscotto del proprio figlio    -> 403
apre quello dell'altro figlio, non invitato         -> 200
dopo la REVOCA dell'accesso dell'atleta             -> 403
dopo lo SCOLLEGAMENTO                               -> 403
```

Le ultime due righe sono la parte che pesa: l'invito accettato su cui ADR-0123
poggia resta in archivio per costruzione, quindi **il gesto che avrebbe dovuto
rimediare non rimediava** e il figlio spariva per sempre.

La correzione e in due mosse, e la seconda vale piu della prima. Il ramo diretto
resta esclusivo verso chi e **soltanto** quella scheda: chi e anche un tutore
**provato** — `guardians[].linkedUserId`, una decisione registrata, non la
coincidenza di una casella — passa dal ramo del tutore come vi passerebbe se non
fosse mai stato invitato. E la domanda si smette di crearla:
`sendAthleteAccountInvite` rifiuta con **400** un indirizzo che e gia il
recapito di un tutore di quella scheda, perche cio che nascerebbe non e
l'accesso del ragazzo — la mail di riscatto e tutte le notifiche arrivano nella
casella del genitore, e il minore non riceve nessuna credenziale propria.

Misurato con P-80…P-87, contro PostgreSQL. Verifica per mutazione: rimessa la
condizione precedente, quattro prove della sonda e due test tornano rossi;
neutralizzata la guardia sull'invito, un terzo test diventa rosso.

#### E cio che il quarto round ha trovato fuori perimetro

Quattro **High preesistenti**, in file che nessuna delle tre lane possiede: il
perimetro di sede e categoria (ADR-0103) **non vale sui byte**. Un ruolo di
staff recintato su una categoria scarica i byte dell'archivio storico e del
**certificato medico** di un atleta fuori dal proprio recinto, e stampa la
ricevuta di quell'atleta. L'elenco dei documenti e chiuso correttamente — la
guardia c'e in `document-requests.ts` — le due rotte dei byte e della stampa non
la chiamano. Piu un quinto difetto minore: un diniego di perimetro esce come
**500** invece che come 403, contro CLAUDE.md §8.

Nessuna riga di PP-04 li causa o li aggrava: i file coinvolti sono byte-identici
alla base `0d66921`. Registrati come **PP04-D10** e **PP04-D11** e come
dependency, con la riproduzione e il contratto chiesto.

### Il token dell'invito

> Decisione: [ADR-0119](18-decision-log.md#adr-0119--il-token-dinvito-si-consuma-dentro-la-transazione-e-a-condizione).

Il replay **sequenziale** era gia respinto. La **concorrenza** no: la lettura
che decideva «questo invito e `sent`» stava fuori dalla transazione, e due
riscatti simultanei passavano entrambi — due 200, due righe di audit, e **due
`sendPasswordResetChallenge`**, cioe due token di reset validi da un gesto
solo. Un fake Prisma non l'avrebbe mai mostrato.

---

## 4. §4 — I minori: cinque domande che il repository non puo decidere

> Decisione: [ADR-0116](18-decision-log.md#adr-0116--un-accesso-a-nome-di-un-minore-si-dichiara-non-si-clicca).

### Riprodotto

`sendAthleteAccountInvite` non guardava la data di nascita. La segreteria
scriveva un indirizzo e un dodicenne aveva un accesso EasyGame a suo nome —
area propria, allenamenti, presenze, stato del certificato, recapiti
modificabili — senza che nulla registrasse che qualcuno lo avesse autorizzato.

Nel repository **non esiste** una policy che risponda: non c'e una definizione
di consenso per l'accesso digitale in `src/lib/consents/catalog.ts` (le quattro
standard sono privacy, marketing, immagini, terzi), e non c'era nessun
controllo sull'eta. Ma l'assenza di controllo non e l'assenza di policy: e la
policy «si puo sempre», presa da nessuno.

### Cambiato

Il codice **non decide**: pretende che la decisione sia presa da una persona e
registrata. `acknowledgeMinor === true` — non un truthy — sull'invito e sul
cambio di indirizzo; rifiuto **400** e non 403, perche il ruolo puo compiere
l'azione; audit con `minor` e `guardian_acknowledged`. E la stessa forma della
cancellazione di un minore (ADR-0105), che vive due pannelli piu sotto sulla
stessa scheda.

### **Richiede validazione umana**

| Domanda | Comportamento adottato | Perche |
|---|---|---|
| Un minore di N anni puo avere un accesso proprio? | **Si, se una persona lo dichiara autorizzato** dalla responsabilita genitoriale, e la dichiarazione resta nell'audit | Un divieto per eta sceglierebbe un N che nessuno ha scritto |
| Il tutore vede cosa scrive il minore nella propria area? | **No.** Nessuna schermata nuova, nessun dato nuovo verso il tutore | Il piu conservativo e non aggiungere una sorveglianza che nessuno ha chiesto |
| La revoca dell'accesso del tutore revoca anche quello dell'atleta? | **No.** I due accessi restano indipendenti | Un accesso tolto per sbaglio si rimette con un invito; uno lasciato per sbaglio si toglie con un clic. I due errori non costano uguale a chi li subisce |
| Un minore puo avere un accesso che vive nella **casella del tutore**? | **No, dal 2026-09-05** ([ADR-0124](18-decision-log.md#adr-0124--unidentita-puo-portare-due-cappelli-e-il-ramo-esclusivo-deve-saperlo)): l'invito su quell'indirizzo e rifiutato con 400, e il messaggio dice cosa fare | Non e un accesso del minore: la mail di riscatto e ogni notifica arrivano al tutore, e l'account nasce sulla **sua** utenza. Il gesto che ADR-0116 fa dichiarare non e il gesto che avveniva. Se la policy vera dira che va permesso, la riga da cambiare e la guardia di `sendAthleteAccountInvite`, e va cambiata **di proposito** |

| Due fratelli minorenni possono avere **la stessa casella** come accesso atleta? | **No, dal 2026-09-05** ([ADR-0125](18-decision-log.md)): il secondo invito e rifiutato con 400, e il riscatto rifiuta comunque | Un indirizzo e un'**identita**, e due persone non possono averne una sola: prima del rifiuto due schede portavano la stessa `user_id`, il prodotto ne sceglieva una e l'altro ragazzo restava senza accesso mentre il club leggeva «Accesso attivo». La strada per la famiglia con una casella sola resta il cruscotto del **tutore**, che e fatto per questo. Se la policy vera dira che due fratelli devono condividere una casella, serve un modello di account diverso — non una riga tolta |

Se la policy vera dira il contrario, i test che le presidiano stanno in
`tests/server/pp-04-minori.test.mjs` e in
`tests/server/pp-04-porta-di-servizio.test.mjs`: sono le righe che verranno
cambiate **di proposito** invece che per caso.

### Le due cose che una persona deve decidere, e che nessun codice puo

Il round conclusivo ne ha misurate due che **non** sono difetti da correggere
di iniziativa. Sono scelte, e vanno prese da chi risponde della societa.

**1. Il genitore che perde il figlio, e nessuno glielo dice.** La guardia di
ADR-0124 e **sequenziale**: guarda i tutori **al momento dell'invito**. Due
gesti di segreteria nell'ordine sbagliato la aggirano senza malizia — la
scheda del minore non ha ancora tutori, si invita l'accesso sulla casella di
famiglia (la guardia non vede nessun tutore e passa), il riscatto scrive
`athletes.user_id` = il genitore, e **piu tardi** la segreteria compila i
tutori con quella stessa casella. Da quel momento il ramo diretto e esclusivo e
il genitore riceve **403** sul cruscotto del proprio figlio, mentre il fratello
si apre 200. Ne la revoca ne lo scollegamento rimediano: l'invito accettato
resta per costruzione (ADR-0123).

Un rimedio **esiste e funziona** — il club conia un gettone di accesso genitore
per quella riga tutore, il genitore lo riscatta, il riscatto scrive
`guardians[].linkedUserId` e il cruscotto torna 200 (misurato: sonda di lane
P-84). Ma **nessuna riga del prodotto, del pannello o della KB collega il
sintomo al rimedio**, e chi lo subisce vede solo un figlio sparito con un 403
muto su una pagina di famiglia.

Le tre strade, in ordine di costo: (a) rendere la guardia **simmetrica**,
rifiutando anche la scrittura di un recapito tutore che coincide con l'identita
dell'account atleta **vivo** di quella scheda — sta in `resources.ts`, dove la
guardia sulle identita dei tutori gia esiste, ed e una superficie di segreteria
che cambia; (b) far cadere il ramo esclusivo quando la scheda e di un **minore**
e quella identita e l'unica famiglia rimasta — piu comodo e meno prudente, ed e
esattamente il Critical di ADR-0122 riaperto per una classe di casi;
(c) lasciare il comportamento e **scrivere il rimedio** dove il sintomo si
vede. Non e stata presa qui perche e una decisione di prodotto sui minori, non
una guardia mancante.

**2. `collaborator` e `staff` leggono il clinico di tutti.** Misurato:
`isManagementAccessRole` e `hasHealthPermission(…, "clinical.read")` valgono
**entrambe vero** per `collaborator` e `staff` (per `trainer` no). Cambiare a
una persona il ruolo in «Collaboratore» le concede quindi allergie, patologie,
farmaci e il file del certificato di **tutti** gli atleti del club, dentro il
proprio perimetro. Puo essere voluto — un collaboratore di segreteria che
gestisce le visite ne ha bisogno — e puo non esserlo. Il dominio proprietario e
`src/lib/health/permissions.ts`, e la matrice si cambia li, di proposito.

---

## 5. Verifica

### La sonda della lane

`scripts/pp-04-atleta-probe.mjs`, contro `easygame_dev_pp04` e contro i route
handler veri con una sessione in archivio: **123 prove su 123**. Percorre
`DB -> dominio -> rotta -> proiezione` e domanda **cosa riceve quella persona**.

Copre: l'invito e il token (nessuna password in nessun ramo, impronta a 64
esadecimali, doppio invito vivo rifiutato dall'indice, token inventato,
scaduto, revocato, replay); l'area e cio che non contiene (segreti clinici,
presenze e notifiche di un altro atleta, chiavi proibite); l'attacco di Aldo
verso tutto il resto (bacheca, profilo, RSVP, rotta generica degli atleti,
gestione dell'accesso altrui e proprio, scrittura di campi protetti); il
tutore, il fratello, la carta, l'avviso; le cinque forme della revoca; i
minori dalla rotta vera (P-60…P-66); il ramo del tutore e i suoi tre
aggiramenti (P-70…P-79); i due cappelli di una sola identita, e la porta che non si apre piu (P-80…P-87).

**Le sonde seminano ora il legame dal riscatto vero.** Seminarlo con una
`update` su `athletes.user_id` modellava uno stato che il prodotto non
produce — `acceptAthleteAccountInvite` e l'unico scrittore di quel campo — ed
e la ragione per cui il difetto di ADR-0123 non si vedeva da qui.

### I test

`npm test` **4.673** verdi. Nuovi in questa lane:

| File | Cosa presidia |
|---|---|
| `tests/server/pp-04-revoca-identita.test.mjs` | la revoca vale sull'identita, e quattro controlli sul **non** fare troppo |
| `tests/server/pp-04-minori.test.mjs` | il gate sui minori, con tre controlli sul non fare troppo |
| `tests/server/pp-04-porta-di-servizio.test.mjs` | i due lettori dello stesso campo, `allowSelfAthleteLink` e il suo verso, i quattro chiamanti che lo dichiarano, e l'identita che sopravvive alla revoca |
| in `tests/server/accesso-atleta.test.mjs` | ogni pagina dell'area e nel menu, e ogni voce di menu ha pagina e titolo |
| in `tests/server/area-atleta-campi-sorgente.test.mjs` | il nome della squadra, e le categorie che escono |

Corrette anche cinque **fixture** che modellavano il genitore dentro
`athletes.user_id` (PP04-D6): tre del fascicolo famiglia nel secondo commit,
piu `iscrizione-servizio` e `moduli-rinnovo-filtrato` nel terzo. Adesso il
genitore e un tutore con la sua tessera `parent`, che e lo stato che il
riscatto del token scrive davvero.

**Ogni correzione di sicurezza e stata verificata per mutazione**: rimossa la
guardia, la prova torna rossa. Per ADR-0122 e ADR-0123 la mutazione e stata
fatta due volte — sui test e sulla sonda contro PostgreSQL — e la seconda
mostra i **segreti seminati che riappaiono nel corpo della risposta**, che e
la sola forma in cui una prova di sicurezza dice qualcosa.

### I round di revisione ostile

Quattro reviewer indipendenti, ognuno con il mandato di **rompere**. Il ciclo
e stato `fix -> prova comportamentale -> verifica per mutazione -> nuovo
round`, ripetuto finche un round intero e uscito pulito.

| Round | Trovato | Esito |
|---|---|---|
| 1 | Critical: i due lettori di `athletes.user_id` (ADR-0117); High: l'elenco chiuso valeva sulla proiezione e non sulla rotta (ADR-0118); due Medium (ADR-0119, ADR-0121); un Low (ADR-0120) | chiusi |
| 2 | Il Critical del round 1 era stato **spostato**, non chiuso: il ramo del tutore si apriva con `guardians[].email` (ADR-0122) | chiuso |
| 3 | Critical: la guardia di ADR-0122 stava sul campo che la revoca cancella (ADR-0123). Piu un Critical e un Medium **preesistenti e fuori perimetro**: il genitore revocato (PP04-D8) e lo sweep per slug (PP04-D9) | il primo chiuso; gli altri due registrati come dependency e debito |
| 4 | Il verso opposto dei tre precedenti: il ramo esclusivo toglieva il figlio al **genitore**, e ne la revoca ne lo scollegamento glielo rendevano (ADR-0124). Piu quattro High **preesistenti e fuori perimetro**: il perimetro di sede e categoria non vale sui **byte** dei documenti ne sulla stampa delle ricevute (PP04-D10) | il primo chiuso; gli altri registrati come dependency e debito |
| **5 — conclusivo** | Tre High, tutti sulla superficie che i fix precedenti avevano appena creato: il **terzo lettore** di `athletes.user_id` (il fascicolo clinico per identificativo, che ADR-0117 non aveva contato); **due schede su una sola utenza** (la guardia dell'invito arrivava prima che il legame esistesse); lo **scollegamento che non scollegava** bacheca e RSVP, e la scheda **ceduta a un altro** che la vecchia utenza continuava a leggere. Piu un Medium e un Low registrati, e due decisioni di prodotto portate a una persona | i tre chiusi (ADR-0125), con verifica per mutazione su ognuna delle quattro guardie |

> **Il quinto round e stato eseguito in prima persona, non delegato**, dopo che
> due agenti si erano fermati ad attendere il verdetto di un reviewer. La sonda
> e `scripts/pp-04-round-conclusivo-probe.mjs`: **112 prove** contro
> PostgreSQL e le rotte vere.
>
> Due verdetti di reviewer indipendenti, arrivati **dopo** l'avvio di questo
> giro, sono stati trattati come **dato da verificare** e non come mandato:
> ogni tesi e stata rimisurata in proprio prima di toccare una riga. Le tre che
> reggevano sono qui sopra; quelle che non sono state corroborate non sono
> state recepite.
>
> **Due dei tre difetti sono nati dal rimedio a un altro difetto**, ed e la
> lezione che vale oltre PP-04: la superficie piu pericolosa di una lane non e
> quella vecchia, e quella che l'ultimo fix ha appena creato — e nessuno l'ha
> ancora battuta.

### A schermo

Dev server vero sul DB della lane, sessione di un atleta seminato, e le
**tredici** pagine dell'area percorse una per una a quattro larghezze,
misurando `scrollWidth > clientWidth` sull'elemento radice:

| Larghezza | Esito |
|---|---|
| 375 | nessun overflow su nessuna delle tredici pagine; il menu del telefono porta le stesse tredici voci |
| 768 | idem, sidebar montata, 13 voci |
| 1280 | idem, 13 voci |
| 1440 | idem, 13 voci |

Con dati veri sullo schermo: «Le mie squadre» stampa *Under 14 maschile* e
*Prima squadra* invece di due UUID; l'allenamento congiunto porta **le due
etichette dell'atleta** e l'evento della sola prima squadra non compare; il
certificato mostra stato e scadenza e nient'altro; «I miei dati» dichiara
quali campi tiene la societa.

Il pannello **«Accesso EasyGame»** del club, aperto dal presidente sulla
scheda dell'atleta, alle stesse quattro larghezze e senza overflow: mostra
*Accesso attivo* con l'indirizzo collegato, «Scollega account» e «Revoca
l'accesso»; dopo la revoca torna allo stato senza account, con la **casella
sulla responsabilita genitoriale** e «Invita l'atleta» **spento** finche non e
spuntata — che e ADR-0116 vista dal clic.

> Una nota sulla lettura di quella schermata: lo stato **«Accesso revocato»**
> si deriva dall'ultimo **invito** (ADR-0115/0121). Un account seminato a mano,
> senza riga d'invito, dopo la revoca torna percio a «Nessun account» invece
> che a «Accesso revocato». Non e un difetto della derivazione: e uno stato
> d'archivio che il prodotto non produce, perche `acceptAthleteAccountInvite`
> e l'unico scrittore di `athletes.user_id`. E la stessa constatazione che ha
> fatto correggere le fixture e le sonde.

### Gate

`npm test` **4.680/4.680** · `npm run typecheck` senza output · `eslint`
**0 errori** (34 warning preesistenti, invariati) · `npm run build` completa.
Misurati dopo l'ultimo commit della lane.

Le tre sonde, allo stesso commit:

| Sonda | Esito |
|---|---|
| `scripts/pp-04-atleta-probe.mjs` | **123/123** |
| `scripts/pp-04-round-conclusivo-probe.mjs` | **112/112** |
| `scripts/pp-04-perimetro-byte-probe.mjs` | **12/17, codice 1** — e la riproduzione di PP04-D10/D11, e resta rossa di proposito |

> **Nota sull'ambiente:** `npm run lint` (cioe `next lint`) esce 1 in questo
> worktree con «Plugin "@next/next" was conflitto fra .eslintrc.json e
> ..\..\..\.eslintrc.json»: e un artefatto del worktree annidato dentro il
> repository radice, che ha il proprio `.eslintrc.json` senza `"root": true`.
> Non dipende dal codice della lane. La misura equivalente e
> `npx eslint --no-eslintrc -c .eslintrc.json --resolve-plugins-relative-to . src`,
> che esce **0 errori**.

### Coverage gap dichiarati del round conclusivo

Un gap dichiarato vale piu di una copertura affermata. Questi sono i miei, e
non quelli di qualcun altro.

1. **La concorrenza sul riscatto non e misurata.** La guardia «una utenza, una
   scheda» sta dentro la transazione, ma e una **lettura seguita da una
   scrittura**: con l'isolamento predefinito di PostgreSQL due riscatti davvero
   simultanei, di due token diversi su due schede diverse per la stessa utenza,
   potrebbero vedere entrambi `altraScheda = null`. La finestra e di
   millisecondi e la sequenza realistica — quella della segreteria — e chiusa a
   monte dal rifiuto sull'invito. Chiuderla del tutto vuole un **indice unico
   parziale** su `athletes.user_id`, cioe una migrazione, che questa lane non
   ha. E il caso simmetrico di ADR-0119, dove la stessa domanda si e risolta
   con `updateMany` perche li la riga da difendere era gia quella scritta.
2. **Ruoli personalizzati: non sintetizzati.** Il perimetro e i dinieghi sono
   misurati con i ruoli **base** (`owner`, `club_manager`, `trainer`, `parent`,
   `athlete`). Non ho costruito una tessera con `custom_role_id` da mandare in
   `x-active-access-role` per verificare che le chiavi ristrette arrivino fino a
   `assertPuoGestireAccessi`.
3. **Perimetro: solo l'asse categoria.** Misurato `scope_kind: "category"`
   scritto su `club_access_scopes`. L'asse **sede** non e stato provato, ne il
   comportamento in AND fra i due assi.
4. **RSVP: misurato il cancello, non la scrittura.** So che una risposta per
   l'atleta sbagliato viene rifiutata; non ho verificato che una risposta
   legittima scriva la propria riga (il seme di un allenamento non e stato
   fatto passare da `events.ts`).
5. **Non attaccati in questo round:** il checkout oltre il cancello, i pagamenti
   online, la scrittura dei consensi oltre il cancello, gli appuntamenti in
   scrittura, `enrollment-requests`, `data-subject` (export e cancellazione), la
   risoluzione del pubblico delle comunicazioni, `form-submissions`. Alcuni sono
   dominio di PP-02 e PP-05.
6. **Byte dei documenti e stampa ricevute:** misurati solo dalla sonda
   preesistente (PP04-D10/D11), che resta rossa di proposito. Nessuna rotta
   nuova che consegni byte e stata introdotta da questo round.
7. **Nessuna pagina React aperta in questo round.** La verifica a schermo — le
   tredici pagine a 375 / 768 / 1280 / 1440 — e quella del round precedente, ed
   e ancora valida perche il round conclusivo **non tocca nessun file di
   interfaccia**: le tre correzioni stanno in due moduli di `src/lib/server/` e
   in una rotta API.
8. **La rotta corretta non ha consumatori client** (debito W6-D08): il fascicolo
   clinico per identificativo e stato misurato **per rotta**, con una sessione
   vera, e non da una schermata — perche oggi nessuna schermata lo chiama. Resta
   raggiungibile da chiunque abbia una sessione, ed e la ragione per cui la
   correzione serve comunque.
9. **Consegna di email e SMS: non misurata.** Le sonde guardano la riga in
   archivio e la risposta della rotta, non la casella.

---

## 6. Migrazioni

**Nessuna.** PP-04 non tocca `prisma/schema.prisma` e non aggiunge cartelle in
`prisma/migrations/`. Tutti gli stati nuovi si **derivano** da colonne che
esistono gia.

---

## 7. Debito aperto da PP-04

Vedi [16 — Debito tecnico](16-technical-debt.md), voci **PP04-D1…D11**.

**In evidenza, perche sono i due che nessuna lane possiede.** Il perimetro di
sede e categoria **non vale sui byte** dei documenti ne sulla stampa di una
ricevuta (**PP04-D10**, High): un ruolo di staff recintato scarica l'archivio
storico e il **certificato medico** di un atleta di un'altra categoria. E un
diniego di perimetro che funziona esce come **500** invece che 403
(**PP04-D11**, Low). Riproduzione:
`scripts/pp-04-perimetro-byte-probe.mjs`, che esce **12/17 e codice 1** per
questa ragione. Entrambi **preesistenti alla base `0d66921`** — i file sono
byte-identici — e riconfermati preesistenti dal round conclusivo. Le due
correzioni vanno **insieme**: la mappatura del `catch` serve proprio perche la
guardia nuova solleva «Accesso negato», e chiuderne una sola produce un file
che risponde 403 per una guardia che non c'e, piu un conflitto d'integrazione
su un file conteso. Il contratto richiesto e in `deps/PP-04-DEPENDENCIES.md`.

**Nuovo dal round conclusivo, e ancora di PP-03:** il legame superstite di
PP04-D1/D9 continua a **indirizzare le notifiche**. `resolveFamilyRecipients`
(`document-requests.ts`) e `resolveGuardianRecipientIds`
(`medical-certificate-reminders.ts`) mettono `athletes.user_id` fra i
destinatari senza chiedere la tessera: un ex membro continua a ricevere
richieste documentali e promemoria di scadenza certificato, con il nome
dell'atleta. **Low**, letto nel codice e non misurato end-to-end. La causa e la
stessa — lo sweep che riconosce lo slug — e la correzione e la stessa.

In dominio **PP-03**: lo sweep dei legami di profilo riconosce lo slug invece
del ruolo risolto (D1), e la sua forma misurata — il pannello «Accesso
EasyGame» che dichiara `active` una scheda senza piu nessuna tessera, e la
manda in vicolo cieco (D9); `assignClubRole` non chiama nessuno sweep (D2);
`athlete` non e clonabile come ruolo personalizzato (D4).

In dominio **PP-02 / PP-03**: il **genitore revocato** continua a leggere e a
scrivere finche gli resta una tessera qualunque nel club, perche
`clearLinkedFields` non azzera `guardians[].email` (D8). E **Critical**, e
**preesistente a PP-04**: nessuna riga di questa lane lo causa o lo aggrava, e
non e correggibile dal lato del lettore — un tutore revocato e uno mai
collegato hanno la stessa riga in archivio. La riproduzione e in
`deps/PP-04-DEPENDENCIES.md`.

Di prodotto: non esiste una policy di club su cosa l'atleta vede (D3); un
atleta **maggiorenne** non ha una strada per gestire da se quote e consensi
(D5); `athletes.user_id` aveva due letture e PP-04 ne sceglie una (D6); un
tutore **senza nessuna tessera** nel club non vede niente, malgrado tre
commenti del dominio dichiarino il contrario (D7).

---

## 8. Conflitti previsti in integrazione

| File | Con chi | Perche |
|---|---|---|
| `src/lib/server/parent-dashboard.ts` | **PP-02** (area famiglia, nella radice) | PP-04 vi cambia **cinque** cose: il ramo diretto diventa esclusivo e poggia sull'identita (ADR-0122/0123), il predefinito del ramo diretto si inverte, l'opzione viaggia fino al fascicolo, il tutore **provato** non e piu escluso dal proprio ramo (ADR-0124), e l'esclusione durevole si separa dall'ammissione viva (ADR-0125). Tutte in `athleteBelongsToParent` e nella firma delle opzioni: un merge a tre vie non dovrebbe avere niente da scegliere |
| `src/app/api/v1/auth/athlete-profile/[athleteId]/route.ts` | **PP-05** (perimetro `api/v1/auth/**`) | Sconfinamento consapevole del round conclusivo, **una riga piu il commento**: `directAthleteAccess` chiama `clubsWhereStillAthlete`. Non e una dependency Auth — non c'e nessun flusso di sessione, e la funzione appartiene all'invariante di ADR-0117, che e di PP-04. Registrato in `deps/PP-04-DEPENDENCIES.md` |
| `src/app/api/parent-dashboard/**` | **PP-02** | sei rotte: cinque perdono l'argomento esplicito (adesso e il predefinito), la bacheca lo acquista |
| `src/lib/server/document-requests.ts` | nessuno dei tre, conteso | `assertSubjectAccess` e `getDocumentDossier` ricevono il legame da chi chiama invece di fissarlo |
| `src/lib/server/rsvp.ts` | **PP-03** | una riga di opzione, registrata in `deps/PP-04-DEPENDENCIES.md` |
| `src/app/api/v1/auth/memberships/route.ts` | **PP-05** | una riga di opzione, registrata; senza, l'atleta rientra su `/account` |
| cinque file di fixture | **PP-02** | il genitore vi e ora modellato come tutore con la sua tessera, invece che dentro `athletes.user_id` |
| `docs/knowledge-base/18-decision-log.md` | tutte e tre le lane | ognuna aggiunge ADR in coda |
