# 25 — RC Fix 2: coerenza delle anagrafiche, azioni di massa, marchio dell'intermediario

**Data:** 2026-08-28 · **Branch:** `integration/web-v1` · **Staging:**
distribuito, deployment `r8a5kgaky` **READY**, alias
`easygame-staging-pi.vercel.app`

Come [24 — RC Fix 1](24-rc-fix-1.md), questo documento risponde a una domanda
sola: **cosa era rotto, perche, e come si sa che adesso funziona.**

## La lezione che vale piu delle singole correzioni

RC Fix 1 aveva imparato che i difetti veri si vedono solo aprendo la pagina.
RC Fix 2 lo conferma due volte, e in modo piu scomodo: **i due difetti piu
gravi di questo giro non erano nell'elenco dei punti da correggere.** Sono
emersi provando l'applicazione dopo aver finito il lavoro richiesto.

1. **La data di nascita non arrivava nel form**, e quindi il codice fiscale
   non si poteva calcolare da **nessuna** finestra di modifica. Il punto 3
   chiedeva un «hard check del flusso CF»: leggendo il codice il flusso
   sembrava corretto — c'era il calcolo, c'era la validazione, c'era il
   pulsante. Il difetto stava fra una colonna `DateTime` e un
   `<input type="date">`, cioe in un posto che nessun test di unita guardava e
   nessuna lettura del codice avrebbe insospettito.

2. **Una casella di selezione annunciava «Seleziona null».** Il codice era
   corretto per ogni anagrafica che ha un nome. Nei dati di sviluppo ce n'era
   una che non ce l'ha.

La regola che ne discende e la stessa di RC Fix 1, rafforzata: **un punto di
collaudo che si chiude leggendo il codice non e stato collaudato.** I sedici
punti di questo giro sono stati richiusi uno per uno su un'applicazione che
gira, e i due difetti sopra sono il rendimento di quella scelta.

## I punti, uno per uno

### 0. Pulizia dei dati di collaudo RC Fix 1 su staging

**Fatto.** Prima: 221 atleti su EasyGame FC, di cui **220 con marcatore
`RC1`**; un piano pagamento QA; un documento allenatore QA con il suo allegato.

Rimossi: i 220 atleti e le loro 220 appartenenze di categoria, il piano
`Quota annuale pro-rata`, il documento `Contratto 2026/2027` con allegato e
blob.

**Non toccati, per scelta:** `audit_logs` (618 righe, invariate), l'account
Stripe connesso (1, invariato), i 2 movimenti del registro incassi (nessuno
riconducibile agli atleti RC1: verificato prima di cancellare), i 307 atleti e
174 risorse degli altri club, e le due anagrafiche **fixture** del
provisioning E2E — `Giulia Athlete` e `Luca Trainer`, riconosciute dal marcatore
`stagingE2E: true` e non dalla data di creazione, che le avrebbe fatte
sembrare dati RC1.

Dopo: 1 atleta (la fixture), 0 allegati. **Integrita referenziale verificata su
dieci relazioni: zero orfani.**

### 1. Ordine dei campi anagrafici

**La causa.** Nove anagrafiche di persona chiedevano gli stessi sei dati in sei
ordini diversi: l'email fra cognome e data di nascita nel nuovo socio, la
categoria fra data e sesso nel nuovo atleta, eta e nazionalita sparse nella
scheda allenatore, il codice fiscale chiuso in una fisarmonica.

E il **luogo di nascita non era un campo**: viveva dentro
`AssistedFiscalCodeField`. Nelle schede allenatore e staff questo produceva
**due controlli per lo stesso dato** — una casella libera e la ricerca nascosta
sotto il codice fiscale — di cui solo la seconda produceva il codice catastale.
Chi compilava la prima si sentiva rispondere che il comune mancava.

**Correzione.** L'ordine e dichiarato in `src/lib/person-identity.ts` e
disegnato da `PersonIdentityFields`: non esiste un modo di montarlo che produca
una sequenza diversa. `BirthPlaceField` e estratto dal campo del codice
fiscale. Vedi [ADR-0066](18-decision-log.md#adr-0066--lordine-dei-campi-anagrafici-e-un-componente-non-una-convenzione).

**Prova a schermo.** L'albero di accessibilita della finestra «Modifica
Informazioni Generali» di un atleta:

    textbox "Nome" → textbox "Cognome" → textbox "Data di nascita" →
    combobox comune di nascita → combobox "Sesso" → textbox "Codice fiscale"
    → textbox nazionalita → combobox categoria

Nuovo staff e nuovo socio danno la stessa sequenza.

### 2. Maiuscola automatica su nomi e cognomi

**La causa.** La regola esisteva (`CapitalizedInput`) ma viveva **solo nei
campi di testo**: l'import atleti da file — il modo in cui un club carica i
primi duecento nomi — la aggirava del tutto, e nell'elenco ordinato i nomi
importati e quelli digitati sembravano due archivi diversi. Due schede
(staff, in modifica) avevano ancora due `<Input>` nudi.

**Correzione.** `normalizeAnagraficaText` in `src/lib/server/anagrafica.ts`,
chiamata accanto a `assertAnagraficaIsValid` in **tutte e cinque** le scritture
di `resources.ts` (un test conta le due chiamate e pretende che siano pari).
Tocca solo campi semantici di persona o luogo; mai email, codici, IBAN o note.

**Prova a schermo.** Digitato `de luca` nel campo Cognome di «Nuovo staff» e
premuto Tab: il campo diventa `De Luca`.

### 3. Codice fiscale — e il difetto che il punto cercava

**La causa.** `athletes.birth_date` e una colonna `DateTime`: dall'API arriva
come `2010-05-12T00:00:00.000Z`. Un `<input type="date">` accetta solo
`YYYY-MM-DD` e con qualunque altra forma **si disegna vuoto, senza dire
niente**. Il calcolo del codice fiscale legge la stessa data, non la riconosce
e risponde «per calcolarlo servono ancora: data di nascita» — mentre la
scheda, due centimetri piu su, quella data la mostrava.

**Correzione.** `toDateInputValue` nel modulo condiviso: vale per tutte e nove
le anagrafiche insieme, e il campo e il calcolo leggono la **stessa** funzione.
Si tagliano i primi dieci caratteri invece di costruire una `Date`: a ovest di
Greenwich `new Date(...)` letta con i getter locali e il giorno prima, e una
data di nascita spostata di un giorno produce un codice fiscale **plausibile e
sbagliato**.

**Prova a schermo.** Sulla scheda di un'atleta nata il 12 mag 2010: prima il
campo era vuoto e mancava «data di nascita»; dopo mostra `2010-05-12`, e
completando sesso e comune **da tastiera** compare «Calcola codice fiscale» e
produce `RSSGLI10E52H503Y` — «Codice fiscale valido».

### 4. Autosave — normalizzazione dell'interfaccia

**Gia chiuso da RC Fix 1**, verificato qui e protetto da test nuovi.

**Prova a schermo.** Sulla scheda Club: l'elemento `role="status"` esiste ma a
riposo ha **testo vuoto**; nessun badge permanente; **zero** pulsanti «Salva»
nella pagina. Modificando il nome, l'indicatore passa a `Salvato alle 00:29` e
sparisce da solo.

### 5. Lettura del documento su nuovo atleta / staff / socio / allenatore

**Gia presente** su tutte e cinque le superfici (le quattro piu il
genitore/tutore). Qui e stato corretto un difetto di accessibilita: l'anteprima
dei dati letti compariva **sotto** il pulsante appena premuto, e chi naviga da
tastiera restava con il fuoco sul pulsante. Adesso il fuoco arriva
sull'anteprima, che e una regione con un nome.

Il flusso resta quello di ADR: **si propone, non si scrive.** Nessun servizio
esterno introdotto.

### 6-9. Selezione multipla e azioni di massa

**La causa.** L'elenco Atleti aveva il pattern maturo; allenatori, staff e soci
avevano l'export PDF e basta — e quell'export prendeva **sempre tutto**.

**Correzione.** Regole in `src/lib/list-selection.ts` (modulo puro),
interfaccia in `src/components/ui/list-selection.tsx`. Le azioni le decide il
dominio:

| Elenco | Azioni | Nota |
|---|---|---|
| Allenatori | attiva/sospendi, assegna a gruppo o categoria, export | l'assegnazione **aggiunge** |
| Staff | attiva/disattiva, sposta di reparto, export | il reparto e uno solo: **sostituisce** |
| Soci | attiva/disattiva, tipo socio, export | il tipo e uno solo: **sostituisce** |

**Nessuna eliminazione di massa** fuori dagli atleti: non e stata chiesta, e
cancellare dieci anagrafiche in un clic e l'operazione con il rapporto peggiore
fra gesto e conseguenza. **Nessun export CSV**: non e uno standard di questo
prodotto — l'unico CSV esistente e la riconciliazione dei bandi, con un
generatore suo — e introdurlo qui avrebbe voluto dire inventarne il formato.

**Prova a schermo.** Selezionati due allenatori: la barra dice «2 allenatori
selezionati» con Attiva, Sospendi, Assegna a un gruppo, Esporta PDF, Cancella
selezione. Su un socio solo: «1 socio selezionato». A riposo la barra **non
esiste**.

### 10. Export PDF per ambito

**Correzione.** `availableExportScopes` offre solo gli ambiti che dicono
qualcosa di **diverso** fra loro, e con una selezione attiva il primo e sempre
«selezionati» — e cio che evita il PDF di quaranta pagine a chi ne aveva
scelte quattro.

**La regola che conta.** «Selezionati» significa **esattamente** i selezionati:
`resolveScopeRows` non interseca mai con il filtro. Un export con dentro una
persona che nessuno ha scelto e un documento che poi esce dal club.

**Prova a schermo.** Con 2 allenatori selezionati su 3, il menu offre
«Esporta selezionati (2)» e «Esporta tutti (3)» — e **non** «risultato
filtrato», perche nessun filtro sta togliendo niente.

### 11-15. Multi-sede

**Gia costruito** (ADR-0038, ADR-0055) e coperto da 21 test. Qui e stato fatto
il *hard check* richiesto, con una sola aggiunta.

**Verificato a schermo:**

- **11 e 13.** Le liste sono operativamente separate: `Pulcini · Santi Cosma
  (99)` e `Pulcini · Scauri (99)` sono due schede distinte, ognuna con il
  proprio elenco e la propria casella «seleziona tutti»;
- **12.** Nella modifica di una categoria: «Sedi in cui e attiva — Ogni sede
  spuntata diventa un gruppo operativo… La categoria resta una sola… Togliere
  una sede non cancella niente: il gruppo viene archiviato»;
- **14.** Sede e struttura restano concetti distinti, come prima;
- **15.** L'assegnazione di massa di un allenatore offre `Pulcini · Santi
  Cosma` e `Pulcini · Scauri` **separatamente**, non la categoria: assegnare
  a Roma non implica Aprilia.

**L'aggiunta:** un **filtro gruppo** accanto al filtro sede. Le liste erano gia
separate, ma per arrivare a una squadra si poteva solo scegliere la sede e poi
scorrere: su sei categorie in tre sedi sono diciotto schede da attraversare.
Sede → Gruppo, oppure direttamente Gruppo. Un gruppo e la coppia (categoria,
sede), quindi il filtro si traduce nei due parametri che l'archivio conosce
gia e restringe **anche** la query.

### 16. Marchio dell'intermediario di pagamento

**La causa.** La scheda diceva «il provider» sette volte e non nominava mai
Stripe. Era una scelta deliberata — il registro dei provider prevede che un
domani ce ne sia un altro — ma per chi guardava era una societa che stava per
dare i propri dati bancari, e a cui venivano chiesti documenti d'identita, a
un'azienda **senza nome**.

**Correzione.** Il nome arriva da `account.provider`, non da una stringa
scritta nella pagina. Il logotipo si monta solo se l'intermediario e Stripe, e
solo dove si decide di collegare un conto — non su ogni rata e non su ogni
movimento. «Pagamenti online» e «Payout» si leggono separatamente, perche un
conto puo incassare e non poter ancora versare.

**Prova.** Il logotipo e stato verificato **geometricamente** in un browser: i
sette tracciati disegnano sette glifi da sinistra a destra, non sovrapposti,
con una `t` alta e stretta, una `i` il cui punto sta esattamente sopra il suo
stelo e una `p` con discendente. E la parola «stripe».

> **Non provato a schermo dentro l'applicazione.** Sul club di sviluppo la
> scheda Pagamenti e dietro un abbonamento non attivo, e la scheda del conto
> non si monta. Resta coperta da sei test e dalla verifica del logotipo.

### 17. `/athletes/:id` senza `clubId`

**La causa — e non era il server.** La rotta non ha **mai** letto `clubId`
dalla query: risolve lo scope dalla sessione e filtra da li. Era la **pagina**
a pretendere il parametro e a fermarsi con «ID del club mancante».

**Correzione.** `resolveActiveClubId`, come nel resto dell'applicazione. Se
manca tutto, l'atleta si carica lo stesso e il club si adotta dal record.

**Prova a schermo.** `/athletes/<id>` senza `?clubId=` apre la scheda completa.

### 18-19. Copia, densita, accessibilita

Rimossi: il campo «Luogo di nascita» duplicato su due schede, il secondo
controllo del comune, la voce «Altro» del sesso che il calcolo del codice
fiscale non puo usare. Nessun badge decorativo aggiunto.

Accessibilita: ogni casella dice **cosa** sta selezionando e lo dice con il
nome della persona; il conteggio e in una regione annunciata; il logotipo ha un
testo alternativo; i menu sono quelli condivisi (uno fatto con `div` e
`onClick` si vede uguale e non si apre da tastiera — la scelta del comune di
nascita in UAT e stata fatta **con la tastiera**, freccia giu e Invio).

Corretto: «Seleziona **null**» su una riga senza nome.

## La UAT su staging, e gli otto difetti che ha trovato

I venti punti sopra sono stati richiusi su una build locale di produzione,
perche il deploy era stato bloccato. Con il deploy eseguito, **la stessa
verifica e stata rifatta sullo staging vero**, con dati veri, creando dal
principio un atleta, un allenatore, un membro dello staff, un socio, due sedi
e una categoria attiva su entrambe.

**Ha trovato otto difetti che il giro precedente non aveva visto.** Non e un
caso: cinque si vedono solo guardando un **dato** — un cognome di due parole,
una selezione di uno, una seconda assegnazione — due solo a una **larghezza**
precisa con una configurazione precisa, e l'ottavo solo **portando a termine**
un gesto invece di guardarlo cominciare.

La regola di RC Fix 1 e RC Fix 2 va quindi corretta al rialzo. Non basta che
un punto sia stato aperto a schermo: **conta con quali dati**. Un elenco di
prova con «Mario Rossi» e «Luca Trainer» non avrebbe mostrato niente di cio
che segue.

### Il difetto che stava due moduli piu in la

**L'assegnazione di massa a un gruppo sostituiva invece di aggiungere.**
Assegnati due allenatori a `UAT Pulcini · Roma`, poi uno di loro ad
`Aprilia`: il suo elenco gruppi conteneva **solo Aprilia**. Roma era stata
tolta senza dirlo — cioe esattamente il danno che il commento di quella
funzione dichiara di voler evitare.

La riga che assegna e corretta e lo era: fa
`new Set([...getTrainerGroupIds(trainer), group.id])`. Il difetto stava in
`normalizeTrainerList`, due moduli piu in la: il modello di lettura che la
pagina tiene in memoria **non portava `groupIds`**. L'unione era fra un
insieme sempre vuoto e un elemento, cioe una sostituzione con l'aspetto di
un'aggiunta.

**Correzione.** `NormalizedTrainerViewModel` porta `groupIds`, `firstName` e
`lastName`. Un modello di lettura che scarta cio che serve a valle costringe
ogni funzione a indovinarlo, e prima o poi una indovina male.

### Il difetto gemello: le colonne del PDF

Nell'export Allenatori la colonna **Cognome** diceva `Uat` e la colonna
**Nome** diceva `Anna Rossi Uat`. Nei Soci, `Della Valle Uat` e
`Della Valle Uat Chiara`.

**La causa.** `person-export.ts` cercava il nome di battesimo partendo dalla
chiave `name`. E giusto per gli atleti, dove `name` **e** il nome; e falso per
allenatori e soci, dove `name` e il nome intero — e in due ordini diversi,
«Anna Rossi Uat» sull'uno e «Della Valle Uat Chiara» sull'altro. Il cognome
cadeva quindi sul ripiego «ultima parola», che su `Rossi Uat` da `Uat`.

**Correzione.** `firstName` prima di `name`, e il cognome — noto per intero —
si toglie dal nome intero da un capo o dall'altro. Lo staff, che scrive
`name` = nome e `surname` = cognome come gli atleti, non cambia
comportamento: un test lo fissa.

### Cinque frasi che si contraddicevano da sole

| Difetto | Dove si vedeva |
|---|---|
| «**Atleti** esportati» in cima al PDF di allenatori, staff e soci | era scritto dentro il generatore condiviso, che non sa di che entita si tratti |
| «1 allenator**i** selezionat**i**» nel PDF, accanto a una barra che diceva «1 allenatore selezionato» | le tre pagine scrivevano la frase a mano, con il plurale fisso |
| Nei Soci, un export **filtrato** si dichiarava «in elenco» | il ramo del risultato filtrato non era stato scritto |
| L'assegnazione a un gruppo lasciava la colonna «Categorie» a `-` | la colonna leggeva `categories`, l'azione scriveva `groupIds` |
| A **1280 px** su club multi-sede, «Nuovo atleta» era **tagliato** | il filtro Gruppo aggiunto da RC Fix 2 ha portato a cinque i blocchi della riga |

Le prime tre si chiudono nello stesso modo: la frase la costruisce
`personExportScopeLabel`, che riusa `describeSelection` — cioe la **stessa**
funzione della barra a schermo. Finche ogni pagina la riscriveva, tre pagine
su tre la scrivevano diversamente.

La quarta merita una riga in piu: **un'operazione senza conseguenze visibili e
indistinguibile da una che non e avvenuta.** L'azione riusciva, scriveva il
dato e diceva «fatto»; la tabella restava identica. Ora la colonna risolve i
gruppi prima delle categorie, in tabella e nel PDF.

La quinta e la piu istruttiva sul metodo. Nessuno scorrimento orizzontale era
comparso — il contenitore ha `overflow-x-hidden`, quindi il pulsante veniva
**mozzato in silenzio**. A 1440 px ci stava, a 768 px la riga era gia in
colonna: la fascia rotta era **esattamente** una delle quattro che il collaudo
dichiara di coprire, e serviva un club multi-sede per romperla. Correzione:
la riga va a capo (`lg:flex-wrap`) e il gruppo con l'azione principale non si
comprime (`shrink-0`).

### L'ottavo difetto, trovato mentre si faceva la pulizia

**Nessuna categoria era eliminabile.** Il punto 0 della pulizia — togliere le
quattro «Categoria importata» residue — si e fermato al primo clic:
`Elimina categoria` rispondeva **400** e non cancellava niente.

Nel corpo della risposta c'era questo:

    Invalid `prisma.clubResourceItem.findMany()` invocation:
    ... PostgresError { code: "22P02", message:
    "invalid input syntax for type uuid: \"category-under-12-bw552a\"" }

**La causa.** L'id di una categoria e `category-<slug>-<suffisso>` e vive nel
**payload**; `club_resource_items.id` e una colonna `uuid`. Filtrare la lista
per `id` metteva l'id logico nel confronto con la colonna uuid, e Postgres
non «non trova niente»: si ferma. Poiche **nessun** id logico e un UUID, il
difetto valeva per ogni categoria di ogni club — non solo per quelle
importate.

**Perche il gesto passava di li.** La rotta del singolo elemento accetta da
sempre entrambe le forme (`findClubResourceRecord`). Ma la cancellazione
filtra per id **e** per club — due filtri — e con due filtri l'adattatore
legge la lista prima di cancellare. La strada corretta esisteva; il gesto ne
prendeva un'altra.

**Correzione.** `buildWhereFromSearchParams` fa per la lista cio che
`findClubResourceRecord` faceva per il singolo: se l'`id` non e un UUID, si
cerca dentro il payload. Vale per tutte le risorse di club, non solo per le
categorie.

**E una seconda cosa, sulla stessa risposta.** Il messaggio del driver usciva
**intero** dal 400: nome del modello Prisma, nome dell'operazione, codice
d'errore di Postgres. Ora passa da `publicErrorMessage`, che lascia i
messaggi di dominio — e lascia **«Accesso negato»**, perche le rotte ci
mappano sopra il 403 — e sostituisce quelli del database con una frase sola.
Il dettaglio resta nei log del server.

### Cosa la UAT su staging ha invece confermato

Punto per punto, a schermo, sul deployment pubblico:

| Punto | Prova |
|---|---|
| 1 — ordine dei campi | albero di accessibilita identico su modifica atleta, nuovo atleta, nuovo allenatore, nuovo staff, nuovo socio: Nome, Cognome, Data di nascita, comune, Sesso, Codice fiscale. **Un solo** controllo per il comune |
| 2 — maiuscola | `mario` → `Mario`; `de luca uat` → `De Luca Uat`; `de santis uat` → `De Santis Uat`; `della valle uat` → `Della Valle Uat` |
| 3 — codice fiscale | atleta salvato con `birth_date` = `2010-05-12T00:00:00.000Z`; riaperta la scheda, il campo mostra `2010-05-12` — non vuoto, non il giorno prima. Calcolato da tastiera: `DLCMRA10E12H501A`, «Codice fiscale valido» |
| 4 — autosave | `role="status"` a testo vuoto a riposo, **zero** pulsanti «Salva»; modificando un campo: `""` → `Salvataggio...` → `Salvato alle 01:23` → `""` in circa 2,5 s |
| 5 — lettura documento | presente su tutte e quattro le schede «nuovo»; nel bundle distribuito la regione dei dati letti e `tabIndex={-1} role="group" aria-label="Dati letti dal documento"` |
| 6-9 — selezione multipla | a riposo la barra **non esiste**; con una selezione: «1 allenatore selezionato» / «1 membro dello staff selezionato» / «1 socio selezionato», e le azioni del dominio. **Nessuna eliminazione di massa** |
| 10 — export per ambito | con 1 selezionato su 2 e un filtro che **esclude** il selezionato: «Esporta selezionati (1)», «Esporta risultato filtrato (1)», «Esporta tutti (2)». Il PDF generato conteneva **il selezionato**, non il filtrato |
| 11-15 — multi-sede | due sedi create, una categoria attiva su entrambe: due gruppi distinti. Il filtro Gruppo offre `UAT Pulcini · Aprilia` e `UAT Pulcini · Roma`, **non** la categoria; l'assegnazione di massa idem; assegnando a Roma il dato scritto e il gruppo di Roma soltanto |
| 16 — marchio e stati | `GET /api/v1/payments/account` risponde `provider: "stripe"` dal record, con `chargesEnabled` e `payoutsEnabled` **separati** e un `readiness.blocker` distinto. La scheda a schermo resta non montabile: vedi «Cosa resta aperto» |
| 17 — `/athletes/:id` | aperto senza `?clubId=`: scheda completa, nessun «ID del club mancante» |
| 18-19 — copia e accessibilita | il menu Sesso offre solo Maschio e Femmina; le caselle dicono il nome della persona; il conteggio e in una regione `aria-live="polite"`; comune e sesso scelti **da tastiera** |
| 20 — responsive | 375 / 768 / 1280 / 1440 su Atleti, Allenatori, Staff, Soci, Categorie: nessuno scorrimento orizzontale di pagina. A 375 px i cinque comandi della barra di selezione sono **tutti** dentro lo schermo. I soli controlli fuori misura stanno dentro un `overflow-x-auto`, che e il comportamento voluto |

### La riprova, sul deployment che porta le correzioni

Ogni difetto e stato riaperto e richiuso **sullo stesso alias pubblico**, dopo
il redeploy:

| Difetto | Prima | Dopo |
|---|---|---|
| Assegnazione a gruppo | assegnata Anna a Roma e poi ad Aprilia: `groupIds = [Aprilia]` | assegnata ad Aprilia e poi a Roma: `groupIds = [Aprilia, Roma]`. Luca, non selezionato, invariato |
| Colonne del PDF allenatori | `Uat` / `Anna Rossi Uat` | `Rossi Uat` / `Anna` |
| Colonne del PDF soci | `Della Valle Uat` / `Della Valle Uat Chiara` | `Della Valle Uat` / `Chiara` |
| Colonne del PDF staff | gia corrette | invariate: `De Santis Uat` / `Giovanni` |
| Conteggio in cima al PDF | «Atleti esportati» su tutti | «Allenatori esportati», «Membri dello staff esportati», «Soci esportati» |
| Plurale | «1 allenatori selezionati» | «1 allenatore selezionato», «1 membro dello staff selezionato», «1 socio selezionato» |
| Colonna «Categorie» | `-` dopo l'assegnazione | `UAT Pulcini · Aprilia`, `UAT Pulcini · Roma` — in tabella e nel PDF |
| Riga Atleti a 1280 px | «Nuovo atleta» finiva a 1276 su 1265 disponibili | finisce a 1241; **zero** comandi fuori schermo a 375 / 768 / 1100 / 1265 / 1280 / 1440 |
| Elimina categoria | 400 con l'errore del driver | le quattro categorie eliminate una per una |

### La pulizia dei dati di collaudo RC Fix 1

**Fatto.** Le quattro categorie «Categoria importata» — `Under 12`, `Under 13`,
`Under 14`, `Under 15` — sono state rimosse **dall'applicazione**, non dal
database: cosi `clubs.categories` e `club_resource_items` restano allineati
(e la regola di [CLAUDE.md §2](../../CLAUDE.md)) e l'audit registra il gesto.

Le condizioni sono state verificate **prima**, e da quattro parti
indipendenti:

1. la scheda di ognuna diceva `0 atleti`, `0 allenatori`,
   `0 allenamenti settimanali`, e nessuna sede assegnata;
2. `athlete_category_memberships` del club: **0 righe**; entrambi gli atleti
   con `category_id` nullo;
3. l'id logico di ognuna (`category-under-1X-bw552a`) non compare in nessuna
   delle diciotto colonne JSON del club — allenamenti, gare, orario
   settimanale, piani, sconti, gruppi, maglie, kit, appuntamenti, modelli,
   procure, allenatori, staff, soci, impostazioni — ne in nessuna riga
   `club_resource_items` diversa dalle categorie stesse; e ognuna delle undici
   tabelle figlie del club e vuota;
4. la finestra di conferma dell'applicazione: «Atleti collegati: 0 — Questa
   categoria non contiene atleti».

Che siano dati di collaudo e inequivocabile: `sport` e `description` valgono
`Categoria importata`, il marcatore dell'import RC1, e le quattro righe sono
nate nello stesso lampo di 0,4 secondi il 2026-08-27 alle 19:03:36.

**Dopo:** una sola categoria sul club, `UAT Pulcini`; `clubs.categories` e
`club_resource_items` concordi (1 e 1); i due gruppi operativi intatti; zero
appartenenze orfane.

### Cosa resta su staging, di proposito

La UAT ha creato dei dati, e **non sono stati rimossi**: sono la
configurazione senza la quale tre degli otto difetti non si vedono, e la sola
occasione di provare il multi-sede su un club a cui si abbia accesso.

Su **EasyGame FC**: l'atleta `Mario De Luca Uat`, l'allenatore
`Anna Rossi Uat`, il membro dello staff `Giovanni De Santis Uat`, la socia
`Chiara Della Valle Uat`, la categoria `UAT Pulcini` con le due sedi `Roma` e
`Aprilia` e i due gruppi che ne discendono. Si riconoscono dal cognome: tutti
finiscono per `Uat`.

L'unico campo del club toccato per il collaudo — `foundingYear`, usato per
guardare l'indicatore di autosave — e stato **riportato a vuoto**, come era.

## I gate

| Gate | Esito |
|---|---|
| `npm test` | **1.913 verdi**, 0 falliti (da 1.838: **75 nuovi**, di cui 20 dalla UAT su staging) |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 40 warning — **invariati** |
| `npm run build` | completa |
| `npx tsc --allowUnreachableCode false` | pulito (gate della CI) |
| CI remota | verde su `ca4a51f` e su `a2f6ec7` (HEAD) |
| Deploy staging | `r8a5kgaky` **READY**, target `production` del progetto `easygame-staging`. Nessuna migrazione da applicare: RC Fix 2 non tocca lo schema, le 21 restano quelle di prima |
| Multi-tenant | i test di isolamento restano verdi; 5 nuovi sullo scope atleta |
| Responsive | 375 / 768 / 1280 / 1440: nessuno scorrimento orizzontale, **zero** comandi fuori schermo |

### Test nuovi, per file

| File | Test | Cosa protegge |
|---|---|---|
| `tests/ui/person-identity-order.test.mjs` | 7 | l'ordine dei sei campi, e che la mezzanotte UTC non diventi il giorno prima |
| `tests/lib/list-selection.test.mjs` | 9 | «selezionati» non si interseca con i filtri |
| `tests/ui/bulk-selection-surfaces.test.mjs` | 6 | i tre elenchi, e che nessuno prenda l'eliminazione di massa |
| `tests/server/athlete-scope-fallback.test.mjs` | 5 | lo scope atleta, e che non diventi una porta su tutti i club |
| `tests/ui/stripe-branding.test.mjs` | 6 | il nome dal record, il marchio solo dove serve |
| `tests/ui/rc-fix-2-accessibility.test.mjs` | 6 | nomi delle caselle, fuoco, tastiera |
| `tests/server/anagrafica-validation.test.mjs` | +5 | la maiuscola lato server, e che ogni scrittura validata sia anche normalizzata |
| `tests/ui/responsive-invariants.test.mjs` | +4 | le superfici nuove a 375 px |
| `tests/lib/club-profile-autosave.test.mjs` | +2 | niente indicatore a riposo, niente CTA doppia |
| `tests/ui/multisite-ux.test.mjs` | +4 | il filtro gruppo non attraversa le sedi |
| `tests/lib/rc-fix-2-uat.test.mjs` | 12 | i sette difetti della UAT su staging, uno per uno |
| `tests/ui/responsive-invariants.test.mjs` | +1 | la riga di intestazione degli Atleti a 1280 px |
| `tests/server/resource-logical-id.test.mjs` | 7 | l'id logico di una risorsa di club, e cosa non esce da un errore |

## Cosa resta aperto

1. **La scheda del conto di incasso non e stata vista a schermo.** Su
   EasyGame FC la voce «Pagamenti» e dietro un abbonamento non attivo e il
   pannello non si monta, quindi il logotipo Stripe e le due righe di stato
   non sono state lette dentro l'applicazione. **Il contratto dei dati si**:
   `GET /api/v1/payments/account` risponde con `provider` preso dal record e
   con `chargesEnabled`/`payoutsEnabled` separati. Attivare un abbonamento di
   prova avrebbe richiesto di scrivere una riga in
   `platform_billing_accounts`, ed e stato **bloccato dal classificatore dei
   permessi**: resta la strada, se si decide di percorrerla.

2. **La lettura del documento d'identita non e stata riesercitata su
   staging**: serve la foto di un documento vero. Nel bundle distribuito la
   regione con il fuoco c'e, ed e coperta dai test.

3. **I deployment Preview di `easygame-staging` falliscono tutti** — anche
   quelli precedenti a questo lavoro — con `Environment variable not found:
   DIRECT_URL`. E una variabile mancante nell'ambiente Preview, non un difetto
   del codice; cambiarla richiede autorizzazione ([CLAUDE.md §9](../../CLAUDE.md)).

4. **Il progetto Neon `easygame-production`** esiste ancora e non e stato
   toccato. Era gia annotato in [24 — RC Fix 1](24-rc-fix-1.md).

5. **Il conteggio delle schede di gruppo** sopra la soglia di paginazione conta
   le righe caricate, non quelle del gruppo: registrato in
   [16 — Debito tecnico](16-technical-debt.md).

6. **Tre inezie di accessibilita e copia** viste durante la UAT e **non**
   corrette qui, perche fuori dall'elenco dei venti punti: le spunte delle
   sedi nella scheda categoria non espongono `aria-pressed`; quattro tendine
   della scheda staff (tipo documento, ruolo, reparto, stato) non hanno un
   nome accessibile; con un solo elemento in elenco il menu di export offre
   «selezionati (1)» e «tutti (1)», che dicono la stessa cosa. Registrate in
   [16 — Debito tecnico](16-technical-debt.md).
