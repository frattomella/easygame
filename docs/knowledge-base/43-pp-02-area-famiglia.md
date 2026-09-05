# 43 — PP-02: l'area famiglia e il rapporto con il club

**Data:** 2026-09-04 · **Branch:** `fix/pp-02-area-famiglia` · **Ambito:** il
percorso del genitore, prima del pilot reale di Fortitudo su `easygame-staging`.

Come [42](42-pp-01-club-atleti-allenamenti.md), questo non e un piano: e il
verbale. Dice cosa e stato riprodotto, quale era la causa, cosa e stato cambiato
e come e stato verificato.

---

## 0. La cosa piu importante che PP-02 ha trovato

**Il legame di un tutore veniva dedotto dalla sua tessera di club.**

`getParentLinkedAthletes` sceglieva i candidati fra «gli atleti di cui sono
l'utenza collegata, piu **tutti** gli atleti dei club in cui ho una tessera», e
applicava il vaglio vero — quello che legge `athletes.data.guardians` —
**dopo**, in memoria, su quell'insieme. Un vaglio che gira su un insieme non puo
trovare cio che l'insieme non contiene.

Effetto misurato: **un tutore collegato ma senza riga in `organization_users`
non trovava nessun figlio.** Non «vedeva meno cose»: vedeva la schermata
«Nessun figlio collegato».

E il difetto ha una forma che vale la pena riconoscere, perche e la stessa di
PP-01 e la stessa che CLAUDE.md §11 descrive: **la sonda che avrebbe dovuto
vederlo gli dava prima una tessera.** `U-06` della Wave 6 verifica che il legame
per indirizzo verificato funzioni — ed e vero — ma lo verifica su un genitore
che una tessera ce l'ha. Il presidio misurava il dominio, e il dominio era
giusto; cio che non era giusto era chi ci arrivava.

| Difetto | Dove il dominio era giusto | Dove la persona lo vedeva rotto |
|---|---|---|
| Il legame del tutore | `athleteBelongsToParent` risponde correttamente | l'insieme su cui girava era scelto dalle tessere |
| Il figlio di cui si parla | `canParentAccessAthlete` e esatto | `getParentDashboardData` ricadeva sul **primo** figlio |
| Il certificato senza data | il dominio sa dire «valido / in scadenza / scaduto» | un certificato **consegnato** senza scadenza si leggeva «mancante» |
| «Paga ora» | il checkout esiste ed e cablato | il motivo per cui a volte non funziona si conosceva **dopo** il clic |
| Le ricevute | il gate del legame e corretto | usciva la **riga intera**, con chi l'ha emessa e la classificazione contabile |

---

## 1. §A — Di quale figlio parliamo

> Decisione: [ADR-0114](18-decision-log.md#adr-0114--il-legame-di-un-tutore-non-e-la-sua-tessera-il-suo-indirizzo-non-e-un-legame-che-apre-da-solo).

### A.1 — Il legame senza tessera

**Riprodotto.** Un tutore con `linkedUserId` scritto sulla scheda del figlio e
nessuna riga in `organization_users`: `listParentChildren` risponde `[]`.

**Causa.** L'insieme dei candidati, sopra.

**Correzione.** `findClubsWhereUserIsGuardian` chiede al database in quali club
questa persona compare come tutore, e i club trovati si uniscono a quelli delle
tessere. La ricerca **allarga i candidati e non concede niente**: l'autorita
resta `athleteBelongsToParent`.

**Il confine, deliberato.** L'allargamento vale per le quattro grafie
dell'**identificativo dell'utenza** e non per le tre dell'**indirizzo**.
`linkedUserId` nasce dal riscatto di un gettone — un atto della persona; un
indirizzo lo scrive la segreteria a mano, e un refuso su un dominio diffuso e
l'indirizzo verificato di un'altra persona reale.

Questo confine e la proprieta che `tests/server/area-famiglia.test.mjs`
presidia per nome dalla Wave 5. **PP-02 l'ha incontrata e l'ha confermata invece
di allargarla**: la prima stesura della correzione la faceva cadere, e il
presidio e diventato rosso. Allargarla e una decisione di prodotto — sta in
[16](16-technical-debt.md), voce **PP02-D2** — non un effetto collaterale di una
correzione.

### A.2 — Il figlio chiesto, non il primo

**Riprodotto.** `/parent-view/pippo` apre il cruscotto del **primo** figlio, con
il suo nome scritto accanto, senza dire niente.

**Causa.** `getParentDashboardData` ricadeva su `linkedAthletes[0]` quando
l'identificativo non era uno UUID. Non usciva dal perimetro della famiglia — ed
e per questo che era sopravvissuto a due revisioni e stava in
[16](16-technical-debt.md) come STAG-01 — ma dentro il perimetro faceva la cosa
peggiore che quella schermata possa fare: rispondere del **figlio sbagliato
senza dirlo**, su pagine che parlano di importi e di certificati medici.

**Correzione.** Il ripiego e stato **tolto**, non corretto. Chi chiede un atleta
che non e nessuno dei propri riceve `null`, e il guscio offre «Scegli il
figlio» accanto a «Riprova» — perche da un segnalibro storto «riprova» ritenta
la stessa richiesta sbagliata all'infinito. Con il ripiego e sparito anche
l'ultimo uso del validatore UUID, che percio e stato tolto: STAG-01 si chiude
qui.

Resta la forma storica `/parent-view/<idClub>`, che e una risposta a una domanda
posta davvero.

### A.3 — Lo switcher non e piu una fascia sopra ogni pagina

W6-12 aveva risolto la domanda giusta — «di chi stiamo parlando» non veniva mai
fatta — mettendo la risposta **dentro il contenuto**: una fascia bianca a tutta
larghezza, in cima a tredici schermate su tredici. L'informazione era giusta, il
posto no: a 375 px quella fascia sta sopra la piega e spinge sotto cio per cui la
pagina e stata aperta.

Adesso l'identita del figlio sta nel **guscio**, dove sta gia quella del club:

- nella barra laterale, accanto alle due porte d'uscita — «Torna al mio account»
  e «Esci» — perche cambiare figlio e un gesto della stessa famiglia;
- in cima al menu mobile, come prima voce, con il nome nell'intestazione della
  sezione;
- e **solo** con piu di un figlio collegato: con uno solo porterebbe a una
  schermata che reindirizza subito indietro.

### A.4 — La schermata di scelta dice chi e ognuno

Prima: foto, nome, club, categoria **primaria**. Adesso anche l'**anno di
nascita** — due fratelli nella stessa categoria si distinguono per l'eta — e
**tutte** le categorie con la loro sede. E lo **stato**: un figlio non piu
iscritto va dichiarato prima di entrarci, non dopo.

L'elenco resta **chiuso** e un test lo enumera: un campo nuovo sulla riga
dell'atleta deve nascere invisibile a questa schermata.

---

## 2. §B — Un atleta ha le squadre che ha

`athlete.categories` esisteva dalla Wave 6 e portava gia tutte le appartenenze.
Mancavano due cose, e sono quelle che si vedono:

- **la sede era un identificativo.** Due categorie su due sedi diverse si
  leggevano come due righe con accanto due UUID. Adesso il nome della sede lo
  risolve il server, dal club che l'atleta gia porta con se — e non «dalle sedi
  del club attivo», che per un genitore con figli in due club avrebbe messo il
  nome sbagliato accanto alla categoria del secondo;
- **la schermata di scelta ne mostrava una sola.** Leggeva `category_name`, il
  campo piatto, cioe la primaria.

`siteName` resta `null` quando la riga non dichiara una sede: su un club
mono-sede nominarla sarebbe rumore.

---

## 3. §C — «Nessuna stagione attiva» su un club che ne ha una

**Causa radice: la targhetta leggeva una copia nel browser.**

Il payload della famiglia porta la stagione gia risolta da W6-09
(`normalizeActiveClubSeason`), e il dominio non e mai stato in dubbio. Ma la
barra superiore prende nome e stagione da `localStorage.activeClub`, che e una
**copia**: la scrive chi ha appena letto qualcosa dal server, e chi non ha
ancora letto niente legge cio che c'era prima.

Tre modi di vedere il difetto, tutti reali:

1. **alla prima pittura**, prima che la richiesta del cruscotto torni;
2. **su ogni pagina che non monta il contesto del genitore** — `/account`, la
   schermata di scelta del figlio;
3. **per sempre, per un tutore senza tessera**, che quella copia non l'ha mai
   vista scrivere da nessuno.

**Correzione.** `Header` accetta `clubIdentity`: quando il chiamante dichiara
l'identita del club, e lei l'autorita e il `localStorage` non viene nemmeno
consultato. Il guscio della famiglia la passa dal payload.

E `seasonHref: null`, perche la targhetta rimandava a
`/organization?tab=stagioni` — per un genitore, un rimbalzo.

---

## 4. §D — «Paga ora» non e una CTA morta, ma non diceva perche

**Il pulsante era vero**: chiama `POST /api/parent-dashboard/:id/checkout`, che
emette un link e lo apre, e il checkout e quello esistente — nessun secondo
sistema di pagamento. Cio che mancava era la **ragione**, e mancava in due modi
opposti:

- **senza rate aperte** si spegneva, con il motivo dentro un `title` del
  browser. Su un telefono un `title` non esiste: il pulsante era spento e basta;
- **con la societa che non ha configurato gli incassi online** restava
  **acceso**, e il motivo arrivava dopo il clic, come errore rosso. E il
  pulsante che promette e poi spiega di non funzionare.

**Correzione.** Il canale arriva dal server insieme al resto
(`payments.online`), e lo risolve lo **stesso** dominio che poi rifiuterebbe il
checkout (`resolveCheckoutReadiness`): non e un secondo sistema, e una risposta
che c'era e non usciva.

`src/lib/payments/family-checkout.ts` traduce i sei ostacoli del dominio in due
fatti che una famiglia puo usare:

| Ostacoli del dominio | Cosa legge la famiglia |
|---|---|
| `provider_not_configured`, `platform_disabled`, `subscription_inactive`, `no_account`, `club_disabled` | «Il pagamento online non e attivo per questa societa: la quota si salda in segreteria.» |
| `account_not_ready` | «Il pagamento online e momentaneamente non disponibile. Riprova piu tardi, oppure salda in segreteria.» |
| nessuna rata pagabile | «Non ci sono rate da saldare.» |

**Perche il messaggio del dominio non si mostra cosi com'e.** E scritto per chi
puo rimediare: «La societa non ha ancora completato il collegamento del proprio
conto di incasso», «L'abbonamento della societa non comprende i pagamenti
online». A una famiglia dice lo stato commerciale del club con EasyGame, che non
e affar suo. Un test lo presidia per nome.

**L'ordine non e indifferente**: se non c'e niente da saldare lo si dice per
primo, anche quando il canale sarebbe spento. «Hai pagato tutto» e una risposta
migliore di «questa societa non incassa online» per chi non deve niente.

**Un guasto nel leggere il canale non spegne il pulsante**: chi puo pagare
continua a poterlo fare, e il caso peggiore torna a essere quello di prima —
l'errore dopo il clic — invece di diventare «non si paga piu».

L'autorizzazione lato server non e stata toccata perche era **gia corretta**, e
vale la pena scriverlo: la rotta rilegge la rata dal database e verifica che
`athlete_id` sia quello del path, prima di emettere qualunque link.

---

## 5. §E — Le ricevute, e cosa non deve uscirne

> Decisione: [ADR-0115](18-decision-log.md#adr-0115--cio-che-la-famiglia-legge-di-un-documento-di-pagamento-e-un-elenco-chiuso).

**Il difetto non era una schermata mancante**: le ricevute si vedevano e si
scaricavano dalla Wave 6. Era che ne usciva **troppo**.

`receipts.map((receipt) => ({ ...receipt, … }))` mandava al browser di ogni
genitore la riga intera: `issued_by` e `cancelled_by`, `operation_type_code` e
`snapshot`, `transaction_id` e `invoice_id`, e `data` — un JSON libero in cui
nessuno ha promesso di non scrivere note interne. Nessuno di quei campi veniva
**disegnato**, ed e la ragione per cui nessuna revisione a schermo lo aveva
visto.

**Correzione.** `serializeFamilyFiscalDocument`: undici campi dichiarati, e
nient'altro. Un test li enumera in avanti (l'elenco ammesso) **e** all'indietro
(l'assenza nominale di quelli interni), cosi un ritorno allo `spread` si vede.

**La sezione.** Ricevute e fatture diventano un elenco solo, ordinato per data
decrescente, con data, numero, causale, importo, **figlio**, stato,
«Visualizza» e «Scarica». Erano due card con due liste identiche, e la seconda
compariva solo se c'era almeno una fattura: per una famiglia sono la stessa cosa
— la carta che dimostra di aver pagato — e quale delle due il club emetta dipende
dal suo regime fiscale, non da lei.

**Una ricevuta annullata si legge «Annullata», non sparisce.** Sparire sarebbe
la scelta comoda e la peggiore: chi ha in mano la copia cartacea di un documento
annullato deve poterlo capire dall'applicazione. Il **motivo** dell'annullamento
resta del club.

---

## 6. §F — Il certificato medico: lo stato **e** la sua data

Tre difetti distinti, e ognuno ha una prova in
`tests/lib/pp-02-certificato-famiglia.test.mjs`.

**1. Lo stato senza la data.** Il riquadro della Home diceva «Certificato
valido» e basta; la data viveva in un'altra card, trenta centimetri piu in
basso. Una famiglia che lo guarda non si chiede «va bene?» ma «fino a quando?».

Adesso e una riga sola, e la compone il dominio:

    Valido — Scade il 01/06/2027
    In scadenza — Scade il 20/09/2026
    Scaduto — Scaduto il 03/01/2026
    Data di scadenza non disponibile

**2. Il certificato consegnato senza scadenza si leggeva «mancante».** L'unico
dato guardato era la data: senza data lo stato era `missing`, cioe la stessa
parola con cui si dice a una famiglia che il certificato non lo ha mai portato.
Sono due cose che si rimediano in modo diverso — caricarlo, oppure chiedere alla
segreteria di completarlo. `MedicalCertificateFamilyState` aggiunge `undated`, e
vive **accanto** a `MedicalCertificateAvailability` e non dentro: quel tipo lo
leggono anche l'appello e le convocazioni, che ricevono una data sola e non
sanno se dietro ci sia un certificato.

**3. La data si spostava di un giorno.** `expiry_date` e una data senza ora, in
archivio la mezzanotte UTC. Resa con il fuso del lettore, in un fuso positivo
retrocede: un certificato che scade il primo giugno si leggeva «Scade il 31/05».
E la famiglia di AUD-02, e su un certificato medico un giorno e la differenza fra
poter giocare e no. La resa dichiara il fuso.

---

## 7. §L — Le strutture: il difetto non era quello segnalato

La segnalazione diceva «una struttura con `bookable=false` compare al Parent
come prenotabile a zero euro». **Non e riproducibile**, e le due meta sono gia
chiuse dalla Wave 6: `getVisibleBookableStructures` filtra
`isBookableByMembers` e toglie le tariffe a zero, la rotta rifiuta la
prenotazione su una struttura chiusa, e le sonde P-80..P-82 e P-85 lo misurano
contro un database vero.

**Quello che si e trovato cercandolo e peggio: la prenotazione non funzionava
mai.**

### L.1 — Il dominio del browser dentro un route handler

`POST /api/parent-dashboard/:id/structures` leggeva le strutture con
`getClubStructures` di `src/lib/simplified-db.ts`. Quel modulo e il dominio che
gira **nel browser**: passa da `apiRequest`, che fa
`fetch("/api/v1/clubs?…")` — un percorso **relativo**.

Dentro un route handler non c'e nessuna pagina da cui risolverlo. Node risponde
`Failed to parse URL from /api/v1/clubs`, e la funzione ha un `catch` che
restituisce `[]`.

Effetto misurato: **ogni** richiesta di prenotazione riceveva
`404 Struttura non prenotabile`, su qualunque struttura, di qualunque club.
Non per un divieto: perche il divieto veniva applicato a un elenco vuoto, e un
elenco vuoto supera qualunque vaglio.

E la ragione per cui nessun test lo vedeva: cio che era coperto — «questa
struttura e prenotabile?» — funziona; a non essere coperto era **da dove arriva
l'elenco**.

**Correzione.** Un modulo server con il suo proprietario,
`src/lib/server/structure-bookings.ts`: legge e scrive `clubs.structures` con
Prisma — le strutture non hanno un mirror in `club_resource_items`, non stanno
in `CLUB_RESOURCE_TYPES` — e aggiunge la prenotazione **rileggendo dentro la
transazione**, cosi la scrittura non parte da una fotografia vecchia.

Non e un controllo di concorrenza e non va scambiato per tale: le prenotazioni
vivono in un array JSON senza versione, e due famiglie che premono nello stesso
istante possono ancora sovrascriversi. La chiusura vera e una tabella con
l'indice unico parziale, come per eventi e appuntamenti: sta fra i residui
(PP02-D3).

**E un presidio sulla classe, non sul caso.** Nessun file sotto `src/app/api` o
`src/lib/server` puo importare `@/lib/simplified-db` o `@/lib/supabase`: era
l'unica occorrenza rimasta, e adesso un ritorno fa fallire un test.

### L.2 — La fascia dichiarata non valeva niente

Il divieto sulla **prenotabilita** era sulla rotta da W6-54; la
**disponibilita** no. La schermata mostrava le fasce del campo e poi lasciava
scegliere data e ora con due campi liberi: una famiglia poteva chiedere il campo
alle tre di notte, e la richiesta arrivava in segreteria — dove qualcuno avrebbe
dovuto rifiutare a mano una cosa che non doveva potersi chiedere.

Adesso `isWithinFieldAvailability` decide, e la stessa funzione la usano il
browser (per dirlo prima) e la rotta (perche e li che si decide). Il rifiuto
**nomina le fasce**: «fuori dagli orari» senza dire quali e un rifiuto che non si
puo correggere.

**Un campo che non dichiara nessuna fascia non e vincolato**, ed e deliberato:
e la lezione di W6-D03. Chi non ha mai compilato quel riquadro non ha espresso
una scelta, e trasformare il silenzio in «chiuso sempre» spegnerebbe le
prenotazioni di ogni club che non lo ha configurato. **Va detto ai club al
rilascio**: finche le fasce non ci sono, l'orario non e vincolato.

### L.3 — La richiesta non la vedeva nessuno

Era l'unica azione della famiglia senza audit e senza notifica: la prenotazione
finiva in un array JSON, e in segreteria nessuno lo sapeva a meno di aprire la
scheda della struttura. Adesso lascia una riga
(`structure_booking.requested`) e avvisa chi puo vederla. Nessuna delle due puo
far fallire la prenotazione, che a quel punto e gia scritta: un avviso mancato e
un difetto, una prenotazione persa dopo il salvataggio e un difetto peggiore.

---

## 8. §G — «Moduli online» diceva dove sono, non cosa manca

Le tre aree del fascicolo — Da fare, Documenti, Moduli online — esistono dalla
Wave 6 e la regola che le separa e giusta: una voce sta in **una** area sola, e
la domanda che decide e «la famiglia deve ancora fare qualcosa?».

La terza pero non era un'area: era **un rimando**. Una frase e un pulsante verso
la pagina Iscrizione. Il posto e giusto — i moduli vivono li, e ospitarne una
seconda copia sarebbe la seconda implementazione di un dominio che ne ha gia una
— ma la card non rispondeva alla domanda per cui esiste, che e la stessa delle
altre due: **cosa devo ancora fare**. Per saperlo bisognava aprire un'altra
pagina e leggerne due elenchi.

`listFamilyOnlineForms` non e un dominio nuovo: mette accanto due letture che gia
esistono — i moduli pubblicati dal club e le pratiche di **questo figlio** — e ne
ricava lo stato. `GET /api/v1/family/online-forms?athlete_id=…`.

| Stato | Quando |
|---|---|
| Da compilare | nessun invio, e il modulo e ancora aperto |
| Inviato | c'e un invio vivo, e il modulo si puo rimandare |
| Completato | c'e un invio vivo su un modulo che si compila **una volta sola** |
| Scaduto | nessun invio, e la data di chiusura e passata |

**«In compilazione» non c'e, e non e una dimenticanza.** Una bozza vive nel
deposito locale del browser che l'ha cominciata: il server non la conosce, e
dichiararla vorrebbe dire mostrare «in compilazione» a chi apre da un altro
telefono e non trova niente.

**«Completato» vince su «scaduto»**: chi lo ha gia mandato non deve leggere che e
in ritardo. E le pratiche contano **per figlio**, non per famiglia: dire
«completato» perche lo ha fatto il fratello e il modo piu diretto di far saltare
un'iscrizione.

**Nessun filtro sul tipo**, a differenza di `listFamilyRenewalForms`. Quella
risponde a «cosa puoi rinnovare» e un questionario non e un rinnovo; questa
risponde a «cosa ti chiede il club», e un questionario lo e.

---

## 9. §J — Il modulo che si compila una volta sola, e il catalogo che si vede

### J.1 — La regola non esisteva

La sola difesa contro un secondo invio era la **deduplicazione a finestra**:
dieci minuti, e con le **stesse** risposte. E una difesa vera e resta — protegge
dal doppio clic — ma protegge da una cosa diversa. Fuori da quella finestra, o
cambiando una virgola, la stessa iscrizione si poteva rimandare tre volte, e in
segreteria arrivavano tre pratiche da leggere per capire quale valesse.

`settings.singleSubmission` sta **dentro la versione pubblicata**, non in una
colonna del modulo: fa parte di cio che quella compilazione dichiarava di essere,
come le domande. Il presidio (`assertNonGiaCompilato`) gira **prima** di caricare
gli allegati — un modulo gia compilato non deve far depositare una seconda copia
di un certificato medico per poi rifiutare la pratica che lo citava.

Due confini, entrambi deliberati:

- **una pratica respinta non blocca**: e proprio il caso in cui la famiglia deve
  poter rimandare;
- **senza un soggetto risolvibile non si vincola niente**. Una compilazione
  pubblica di chi non e ancora in anagrafica non ha un atleta su cui contare, e
  inventare un conteggio per indirizzo email bloccherebbe due fratelli iscritti
  dallo stesso genitore. Il vincolo vale sul rinnovo di chi e gia in archivio, e
  va detto al club.

### J.2 — «Modelli consigliati» non diceva cosa chiedono

La distinzione fra **catalogo** e **modulo del club** era gia solida e non e
stata toccata: adottare una voce ne crea una copia (`buildFormFromCatalog`), la
chiave resta solo come provenienza, e da quel momento il catalogo non la tocca
piu. Un modello **non** compare mai alla famiglia: compare il modulo del club,
quando e pubblicato.

Cio che mancava era piu semplice: la scheda diceva titolo, descrizione, classe e
provenienza, e **non una parola su cosa chiede il modulo**. Per saperlo bisognava
adottarlo — creare una copia nel club — aprirla, e poi eventualmente cancellarla:
tre gesti per rispondere alla sola domanda che conta davanti a un catalogo.

Adesso ogni voce apre l'elenco dei propri campi, che e cio che distingue due
modelli dallo stesso titolo. E il pulsante dice cosa succede: «Usa modello», non
«Adotta».

---

## 10. §K — Come riceve il club

Il dominio degli appuntamenti e completo — slot, stati, transizioni, indice
unico, versione, audit, notifiche — e la sua configurazione rispondeva a cinque
delle sei domande che una segreteria si fa: chi riceve, dove, per quanto, quando,
e se la fascia e attiva. Le due che mancavano:

1. **se** le famiglie possono chiedere. Esisteva `active` sulla singola fascia,
   che e un'altra domanda: un club che voleva chiudere le richieste doveva
   spegnere le fasce a una a una, e riaprirle a una a una;
2. **per cosa**. Il motivo era testo libero, e in coda arrivavano «info»,
   «parlare col mister», «pagamento?»: chi riceveva doveva interpretare la
   richiesta prima di poterla assegnare.

`clubs.settings.appointments` porta un interruttore e un elenco corto di motivi,
ognuno con la propria durata e con un `bookable` che distingue cio che la
famiglia puo chiedere da cio che il club fissa dal desk — «Convocazione» e il
caso. E **configurazione e non una tabella** perche cambiarne una voce non deve
riscrivere gli appuntamenti gia presi, che portano il motivo con se.

Due ripieghi dichiarati, ed e la lezione di W6-D03:

- **un club che non ha configurato niente riceve comunque.** Chi non ha mai avuto
  un interruttore non puo aver espresso una scelta;
- **un club senza motivi non vincola il motivo**: la famiglia continua a
  scriverlo. I tipi restringono; la loro assenza non e un divieto.

La famiglia lo sa **prima di compilare**: il payload porta l'interruttore e i
soli motivi prenotabili, e con le richieste chiuse il modulo non compare affatto.
E la stessa regola di «Paga ora» in §D — la ragione si conosce prima del gesto.

La scrittura passa dallo stesso gate della disponibilita (`isManagementAccessRole`)
e riscrive **una chiave** di `settings`, non l'oggetto: sostituirlo con cio che
questa schermata conosce e il modo in cui una pagina cancella i dati di un'altra.

---

## 11. §H e §I — Una sola verita su tre schermate

La coda della segreteria esiste dalla Wave 6 (W6-39), ha i sei filtri che il
mandato elenca — Nuovi, Da integrare, Certificati, Identita, Scaduti, Approvati
— e la scheda atleta ha la sua vista sintetica con i cinque tipi canonici e la
CTA «Richiedi documento», che scrive davvero in `document_requests`. **Non c'e
stato niente da costruire.**

Cio che serviva era **provarlo**, e la prova non e leggere il codice: e fare il
giro. La segreteria chiede, la famiglia consegna, la segreteria rifiuta con il
motivo — e a ogni passo si guardano le **tre** superfici.

| Passo | Coda del club | Fascicolo della famiglia | Scheda dell'atleta |
|---|---|---|---|
| richiesta creata | «missing» | in «Da fare» | «Richiesto» |
| documento consegnato | «under_review» | **fuori** da «Da fare» | «In verifica» |
| rifiutato con motivo | «rejected» | di nuovo in «Da fare», **con il motivo** | «Da integrare» |

Se una delle tre divergesse, la duplicazione ci sarebbe **anche se il codice
sembrasse pulito**. Sono le prove P-110..P-118, piu quella che chiude il
cerchio: il motivo del rifiuto non finisce nel fascicolo di un'altra famiglia.

### La sola cosa cambiata: «Rifiuta» dice cosa succede

Il mandato elenca «Rifiuta» e «Richiedi integrazione» come due azioni. Nel
dominio sono **una transizione sola**, e non per pigrizia: cio che succede dopo e
identico — la richiesta si riapre, la famiglia ritrova la voce in «Da fare» con
il motivo scritto. Farne due stati vorrebbe dire due parole per lo stesso fatto
su tre schermate, che e esattamente la duplicazione che questa lane doveva
evitare.

Quello che mancava non era una seconda azione: era **dirlo**. Chi preme
«Rifiuta» non sta chiudendo una porta, sta chiedendo un altro file, e adesso il
pannello lo scrive prima di chiedere il motivo.

---

## 12. §M — L'audit ostile

La regola di questa sezione, e vale la pena scriverla: **ogni prova ha due
meta.** Che la propria famiglia arrivi dove deve, e che l'altra non ci arrivi.
Una prova sola delle due non dice niente — un perimetro che nega tutto passa la
seconda e rompe il prodotto; uno che concede tutto passa la prima.

Gli attori sono **due famiglie nello stesso club**: due club diversi si separano
gia da soli per `organization_id`, e misurare li vorrebbe dire misurare Prisma.

| Prova | Cosa misura |
|---|---|
| M-01 / M-02 | la ricevuta si scarica dalla propria famiglia, e l'altra riceve 403 |
| M-03 | il checkout su una rata di un'altra famiglia: 404 |
| M-04 | il cruscotto di un figlio altrui: 403 |
| M-05 | il fascicolo documentale di un figlio altrui: 403 |
| M-06 / M-07 / M-08 | modulo, pratiche e moduli online di un figlio altrui: rifiutati |
| M-09 / M-10 / M-11 | l'appuntamento di un'altra famiglia non si annulla ne si riprogramma, e il proprio si trova |
| M-12 / M-13 | un tutore scollegato perde l'accesso **alla richiesta successiva**, e non gli resta nemmeno l'elenco |
| M-14 | il ruolo `parent` non apre nessuna risorsa generica del club |

**Nessuna prova statica.** Ognuna passa dalla rotta vera o dal servizio vero,
contro il database di sviluppo.

### La verifica al contrario

Il mandato chiede di misurare che una prova diventi **rossa** reintroducendo il
difetto. Due mutazioni, applicate insieme e poi disfatte:

| Difetto reintrodotto | Prove diventate rosse |
|---|---|
| il ripiego `linkedAthletes[0]` su un identificativo sconosciuto | P-07, P-08, P-09 e **M-04** — cioe il cruscotto di un figlio di **un'altra famiglia** torna a rispondere 200 |
| la ricevuta spanata invece della proiezione chiusa | P-51, P-52, P-53, P-54 |

La riga che conta e M-04: il ripiego non usciva dal perimetro della famiglia
**finche l'identificativo era malformato**, ma con quello di un atleta reale di
un'altra famiglia apriva il suo cruscotto. Era una fuga di dati, non una
sciatteria.

---

## 13. §N — Cio che deve reggere a 375 px

Le superfici che PP-02 ha aggiunto o riscritto entrano nel presidio delle
invarianti di responsivita (`tests/ui/responsive-invariants.test.mjs`), che
misura la classe di difetti che si introduce **senza accorgersene**: una griglia
a due colonne senza punto di rottura, una tabella che allarga il documento invece
del proprio contenitore.

Cio che e stato cambiato per farle passare:

- i due orari della prenotazione di un campo erano una griglia a due colonne
  rigida. Adesso sono `flex-wrap` con una larghezza minima: **si impilano da
  soli** quando non ci stanno, invece di stringersi finche il controllo nativo
  dell'ora non si legge piu;
- la riga di una ricevuta e passata da tre blocchi a quattro — si sono aggiunti
  il figlio, il numero e lo stato — e da una riga sola a tre impilate. Dentro un
  contenitore con `overflow-hidden` cio che non ci sta non sporge: viene
  **tagliato**, e la ricevuta torna a non essere scaricabile;
- la fascia «Stai vedendo …» non occupa piu la prima riga di tredici pagine su
  tredici (§A.3).

**Cio che un test statico non dice**, e che resta da guardare a occhio, sta in
[43b — La UAT a schermo](43-pp-02-uat-a-schermo.md).


---

## 14. §O — I due residui di PP-01

### O.1 — «Rimuovi allenamenti in programma» falliva sempre

**Riprodotto.** Il pulsante della pagina Allenamenti rispondeva «Errore durante
la pulizia degli allenamenti con categorie non rilevate», sempre, su qualunque
club.

**Causa.** `cleanupOrphanScheduledTrainings` scriveva `clubs.trainings`
**direttamente dal browser**, con un `PATCH /api/v1/clubs` che portava l'array
intero. Da ADR-0098 quella colonna e una proiezione in sola lettura con un solo
scrittore, e `resources.ts` la rifiuta con un 403 — che arrivava alla persona
travestito da messaggio su un'altra cosa.

**Correzione.** Le due meta prendono due strade, perche sono due cose diverse:
il **programma settimanale** e configurazione del club e resta dov'era; gli
**allenamenti in programma** sono eventi e si cancellano dal loro dominio, uno
per uno, con `deleteEventIfEmpty` — che rifiuta di cancellare cio che ha
lasciato una traccia.

Il programma settimanale si scrive **per primo**: e la sorgente che rigenera gli
allenamenti, e toglierlo dopo vorrebbe dire che fra le due scritture il motore
delle automazioni puo ricreare cio che si sta cancellando.

**E l'esito dice la verita.** Contava cio che si voleva togliere, non cio che si
e tolto: adesso porta `keptWithHistory` e la schermata lo nomina — «N non si
possono cancellare perche hanno gia presenze o risposte: vanno annullati uno per
uno». Un conteggio silenziosamente diverso da quello promesso e il modo in cui
una pulizia sembra riuscita e non lo e.

La conferma e passata da `window.confirm` al dialogo dell'applicazione: e la
stessa finestra di sistema che PP-01 §C aveva gia tolto da questa pagina per la
sovrapposizione, ed era rimasta qui.

### O.2 — La modifica non mandava la versione

Il controllo ottimistico di ADR-0098 esiste dalla Wave 6 e da questa schermata
**non poteva mai fallire**: `updateEvent(id, data)` partiva senza terzo
argomento, il server ricadeva sulla versione corrente e scriveva sempre. Due
segretarie che salvavano insieme tornavano a «vince l'ultimo», in silenzio.

La versione c'era gia nella forma storica (`toEventLegacyShape`) e si perdeva
in `formatTrainingSession`. Adesso viaggia fino al salvataggio.

**E sul conflitto si ricarica.** Il server dice «ricarica la pagina e riprova»,
ed e la cosa giusta da dire; ma lasciarla come istruzione vuol dire che chi non
la esegue continua a salvare su una versione vecchia e a ricevere lo stesso
errore per sempre. La ricarica avviene **solo** sul conflitto: su un campo
congelato o su una sovrapposizione butterebbe via cio che la persona ha appena
scritto.

---

## 15. Verifica

### Gate

| Gate | Esito |
|---|---|
| `npm test` | **4.696 / 4.696** (baseline 4.617, + 79 controlli nuovi) |
| `npm run typecheck` | pulito |
| `npm run lint` | 0 errori, 34 warning (baseline invariata) |
| `npm run build` | completa |
| `npx prisma migrate status` | allineato, **54 migrazioni: PP-02 non ne aggiunge nessuna** |
| Working tree | pulito prima e dopo |

**Nessuna migrazione**, ed e una proprieta e non un caso: tutto cio che PP-02 ha
aggiunto vive su strutture che esistevano gia — una chiave in
`clubs.settings`, una in `settings` di un modulo, una colonna JSON del club —
oppure e una lettura. Il pilot Fortitudo non deve subire un cambio di schema per
un pacchetto che corregge il percorso della famiglia.

### Collaudo di dominio

`scripts/pp-02-uat.mjs` — **101 prove**, contro il database di sviluppo. Semina
**due famiglie nello stesso club** — che e la configurazione su cui un errore di
perimetro si vede, perche due club diversi si separano gia da soli per
`organization_id` — piu un tutore senza tessera e un club estraneo.

| Sezione | Prove | Cosa misura |
|---|---|---|
| §A | P-01…P-12 | la scelta del figlio, il legame senza tessera, il confine dell'indirizzo |
| §B | P-20…P-25 | tutte le categorie, con la sede per nome |
| §C | P-30…P-34 | la stagione, anche per chi non ha tessera |
| §D | P-40…P-43 | il canale di incasso, e che il motivo non nomini l'abbonamento |
| §E | P-50…P-55 | la proiezione chiusa della ricevuta |
| §G §J | P-60…P-76 | i moduli online e il vincolo «una volta sola» |
| §H §I | P-110…P-118 | le tre superfici dicono la stessa cosa |
| §L | P-80…P-87 | strutture, fasce, audit e notifica |
| §K | P-100…P-108 | come riceve il club |
| §O | P-90…P-97 | i due residui di PP-01 |
| §M | M-01…M-14 | l'audit ostile |
| §R | R-01…R-06 | cio che la revisione indipendente ha trovato |

Il club — e quello estraneo — vengono cancellati in `finally`, e la semina
comincia cancellando i residui di un'esecuzione interrotta.

### Presidi corretti nel modo di guardare

Come in PP-01, alcuni presidi guardavano la **grafia** invece della proprieta, e
la grafia si e spostata. Sono stati corretti, non rimossi:

| Presidio | Cosa guardava | Cosa guarda adesso |
|---|---|---|
| `area-famiglia-wave6.test.mjs` · W6-14 | `categories: asArray(athlete.category_memberships).map(` | che le appartenenze si mappino tutte e la primaria sia dichiarata, dovunque viva la funzione |
| `area-famiglia-wave6.test.mjs` · W6-16/17/18 | le tre frasi dentro la schermata | le tre frasi **nel dominio**, piu il fatto che la schermata le stampi |
| `area-famiglia-wave6.test.mjs` · W6-19 | `<CardTitle>Fatture</CardTitle>` | che una fattura entri nell'elenco unico e resti riconoscibile |
| `responsive-invariants.test.mjs` | la riga della ricevuta a tre blocchi | la riga a quattro, impilata, con i comandi che vanno a capo |

### Il doppio di Prisma ha imparato due cose

- **`include`** veniva ignorato: la riga tornava senza le relazioni, e
  `getParentDashboardData` non era collaudabile affatto — la sua copertura
  viveva solo nella sonda contro il database vero, che in integrazione continua
  non gira. Adesso c'e un elenco chiuso di relazioni risolte, e **una relazione
  seminata a mano vince su quella risolta**: i test che la scrivevano dentro la
  riga hanno dichiarato cosa deve tornare, e sovrascriverla ne ha fatti
  diventare rossi sette su codice non toccato.
- **La ricerca dei tutori**: risponderle `[]` sarebbe la risposta stretta — un
  test sul tutore senza tessera fallirebbe su codice corretto, che e lo stesso
  disservizio di `hasSome` al contrario.
---

## 16. La revisione indipendente, e cosa ha trovato

Il pacchetto si e dichiarato chiuso, e **poi** e passato a una revisione ostile
indipendente sul diff completo, con una consegna esplicita: **non fidarti dei
commenti, verifica il codice.**

Ha trovato **un High e otto Medium reali**. Tutti corretti, ognuno con la sua
prova.

| # | Gravita | Cosa | Perche contava |
|---|---|---|---|
| R1 | **High** | La riprogrammazione di un appuntamento **scartava il motivo scelto** | La schermata **obbliga** a sceglierlo, e la rotta `PATCH` non lo mandava: la scelta finiva nel nulla e l'appuntamento conservava il motivo vecchio, senza errore e senza avviso |
| S2 | Medium | `familyBookingEnabled` non valeva sulla riprogrammazione | Riprogrammare **crea una riga nuova** (ADR-0101), cioe e una richiesta: l'interruttore non chiudeva la porta, la socchiudeva |
| S1 | Medium | La rotta di configurazione faceva uscire l'**identificativo dell'operatore** a chiunque avesse una tessera | Chiuso togliendo il campo: vedi sotto |
| Q1 | Medium | `jsonb_array_elements` fuori dalla protezione del tipo | Una riga con `guardians` scritto come oggetto avrebbe fatto cadere l'intera ricerca nel `catch`: l'allargamento sarebbe sparito **per tutte le famiglie**, in silenzio |
| Q2 | Medium | Due scansioni di `athletes` per richiesta su `/api/v1/family/online-forms` | La seconda serviva **solo al nome dell'atleta**, che sta sulla riga |
| R2 | Medium | La riga del certificato **perdeva l'etichetta** senza data | «Mancante» spariva dal riquadro proprio per l'atleta che il certificato non lo ha portato: il caso per cui quel riquadro esiste |
| R3 | Medium | «Consegnato» e «Aggiorna il certificato» convivevano | La distinzione che §F ha introdotto arrivava nell'etichetta e **in nessuna delle decisioni che ne dipendono** |
| R4 | Medium | La fascia storica `{ days: [...] }` diventava vincolante con **orari inventati** | `normalizeAvailability` riempiva con `18:00`-`22:00`: innocuo finche nessuno confrontava, un divieto da quando la fascia vincola. La stessa lezione di W6-D03, mancata su questa forma |
| R5 | Medium | L'ora digitata era letta nel fuso **del dispositivo**, la fascia in quello del club | Un genitore su un altro fuso leggeva «Lun 18:00-22:00» e si sentiva rifiutare le 21:30; nel verso opposto le 17:30 passavano e il club si trovava in agenda le 18:30 |
| R9 | Medium | `take: 500` senza filtro sul soggetto | Il vincolo «una volta sola» cadeva in silenzio **proprio sui club grandi**. Gia corretto prima della revisione, con il filtro in SQL |
| R6, R8, R11, R12, config | Low | Mezzanotte come fine, slug che collidono, `400` su un guasto del server, salvataggi rapidi, `"false"` letto come acceso | Tutti corretti |

### Le due correzioni che hanno cambiato una decisione

**Il tipo di appuntamento e diventato un nome, e basta.** Portava anche durata,
sede e operatore: tre campi che **nessuno legge** — chi riceve, dove e per
quanto lo dice la fascia, che e dove sono gia onorati. Mostrarli al club voleva
dire far credere che decidessero qualcosa, ed e la forma piu comune di funzione
incompleta che questo repository conosce (CLAUDE.md §11): non il codice
mancante, ma il campo che **sembra** governare. Toglierli ha chiuso anche S1,
perche `assignedToUserId` era l'unico dato di persona che la rotta di lettura
faceva uscire.

**Gli orari storici non si inventano piu.** `normalizeAvailability` riempiva la
forma `{ days: [...] }` con `18:00`-`22:00`. PP-02 ha reso la fascia vincolante
citando W6-D03 — «il silenzio non e un divieto» — e non si era accorto che su
questa forma il silenzio era **gia stato riempito** da un valore plausibile.
Adesso senza orari la giornata resta senza fasce, cioe senza vincolo.

### Una prova che non diventa rossa, e va detto

`R-03` verifica che una riga con `guardians` malformato non faccia sparire i
figli di nessuno. **Rimettendo la forma fragile la prova resta verde**: su
questa query il pianificatore di Postgres valuta i congiunti nell'ordine
scritto. Il rischio e reale ma **latente** — lo standard non garantisce
quell'ordine, e un piano diverso lo cambierebbe senza avvisare — e la prova
misura cio che puo misurare: che la forma robusta non abbia rotto niente.

Dichiararlo vale piu che scrivere «verificato».

### Cosa la revisione ha **non** trovato

Nessuna via per cui un genitore raggiunga i dati di un figlio non suo. Nessuna
SQL injection nella query grezza — il parametro e legato dal tagged template,
non interpolato. Nessun hook chiamato condizionalmente. Nessuna regressione
dalla rimozione del ripiego `UUID_PATTERN`: i quattro chiamanti passano tutti
da un segmento di rotta dinamica o da un identificativo reale.

### Cio che ha segnalato e resta aperto

| Cosa | Perche resta |
|---|---|
| Il salvataggio delle strutture **lato club** puo ancora cancellare una prenotazione di famiglia arrivata nel frattempo | E il percorso del `PATCH` generico sul club, cioe il debito D2 (doppia rappresentazione). La transazione nuova protegge un verso solo, e adesso il commento lo dice. Chiuderlo e la tabella di PP02-D3 |
| `cleanupOrphanScheduledTrainings` guadagna logica in `simplified-db.ts`, che CLAUDE.md §2 dichiara «in riduzione» | La correzione e giusta nel merito e il posto e quello che la regola scoraggia. Spostarla vuol dire portare l'azione lato server, che e un'altra forma della stessa migrazione (WP-07) |
| Il diff mescola PP-02 con il debito PP-01 e superfici adiacenti | I commit sono separati per tema; il **pacchetto** e largo perche il mandato lo e |

---

## 17. Il secondo round, e la lezione che si e ripetuta

Il primo round si era chiuso. Il pacchetto e passato a una **seconda** revisione
ostile indipendente, con la stessa consegna, e ha trovato **un High e otto fra
Medium e Low**.

Il High conta piu del suo contenuto.

### Il difetto che era gia stato «chiuso»

Riprogrammando un appuntamento, la rotta `PATCH` **non leggeva `type_id`**. La
schermata obbliga a scegliere un motivo, il client lo mandava, il server lo
buttava via: l'appuntamento conservava il motivo vecchio, senza errore e senza
avviso.

Era gia stato trovato al primo round — come **R1**, come High — e dichiarato
chiuso con la sua prova. La prova era `R-01`, e chiamava
`rescheduleFamilyAppointment` **direttamente**, passandogli `typeId`. Il dominio
lo onorava. La rotta non glielo dava mai.

> **La prova misurava il vaglio, non la strada che ci arriva.**

E la terza volta che questo repository incontra la stessa forma, e le altre due
sono nel suo stesso registro: l'RSVP completo e testato che nessuna schermata
sapeva accendere, `board.read` che era un permesso senza pagina. Ogni volta il
codice di dominio era giusto, coperto, e **irraggiungibile** — e ogni volta la
copertura lo confermava, perche partiva da dentro.

Adesso `R-01` costruisce una `Request` con una sessione vera e passa dalla
rotta. Rimettendo il difetto **diventa rossa**: verificato, non dedotto.

### Cosa cambia nella regola, non solo nel codice

CLAUDE.md §11 dice gia: «prima di dichiarare `COMPLETE`, percorri il flusso dal
clic del ruolo interessato fino alla riga scritta». Il pacchetto lo aveva
applicato alle **funzioni** e non alle **prove**. La correzione e questa:

> Quando la proprieta riguarda una rotta, la prova passa dalla rotta. Chiamare
> il servizio e piu comodo e misura un'altra cosa.

### Gli altri otto

| # | Gravita | Cosa | Come si vedeva |
|---|---|---|---|
| F1 | **High** | `PATCH` appuntamenti perdeva `type_id` | Sopra |
| F7 | Medium | `assertNonGiaCompilato` non filtrava per tipo di soggetto | Il `recordId` di un tutore e un **indice posizionale** (`"0"`, `"1"`): la seconda famiglia che compilava un modulo one-shot si prendeva un 409 falso, «gia compilato», su un modulo che non aveva mai visto |
| F4 | Medium | Il confronto della fascia era sul **nome** del giorno | Una prenotazione di trenta ore che finiva a mezzanotte due giorni dopo veniva accettata. L'ha introdotta la mia stessa correzione di R6 |
| F8 | Medium | `bookable` non aveva uno **scrittore** | Il campo esisteva, il server lo onorava, e la schermata della segreteria non aveva la casella per metterlo: nessun club poteva rendere un motivo non prenotabile |
| F3 | Low | Il ripiego al testo libero guardava i soli tipi **prenotabili** | Un club con tutti i motivi da desk ricadeva sul testo libero invece di chiudere la porta |
| F5, F6 | Low | Fascia `00:00`-`00:00` letta come giornata intera; `describeInstantForAvailability` non rendeva la data | |
| F9 | Low | La riprogrammazione passava `siteId: null` invece di ometterlo | |
| F10 | Low | **L'ora che non esiste cadeva prima del salto**, nei fusi negativi | A New York le 02:30 del 14 marzo 2027 tornavano `01:30`; a Santiago le 00:30 del 5 settembre tornavano le 23:30 **del giorno prima**. Il fuso del club oggi e uno solo, quindi il difetto era latente — ma il **commento prometteva il contrario**, ed e la stessa forma di debito: la promessa scritta accanto al codice che nessuno ha misurato. Adesso e misurata su otto fusi |
| — | Low | `AppointmentSlot` prometteva quattro campi che il server non manda | `assignedToUserId`, `capacity`, `taken`, `remaining`. Nessuno li leggeva; un tipo che dichiara un campo assente e un invito a leggerlo. Adesso il tipo **e** la proiezione |

### Il terzo round

Il mandato chiede che un round completo torni pulito prima di `DONE`. Dopo le
correzioni il pacchetto e passato a una **terza** revisione indipendente, su due
assi separati — correttezza del percorso e sicurezza — condotta da chi non aveva
visto i due round precedenti.

---

## 18. Il terzo round: due revisioni in parallelo, e tre High

Il pacchetto si era dichiarato pulito **due volte**. Il terzo round e stato
condotto da due revisori indipendenti in parallelo, su assi separati — la
correttezza del percorso, e una lettura ostile della sicurezza — nessuno dei due
a conoscenza dei round precedenti.

### Cio che la sicurezza **non** ha trovato

Vale la pena scriverlo per primo, perche e il risultato piu importante:

> **Nessun Critical. Nessuna via per cui un genitore raggiunga i dati di un
> figlio che non e suo.**

Provata e tenuta da nove direzioni: IDOR su ricevute e fatture (la rotta rilegge
l'atleta della riga e lo confronta con il legame), checkout, appuntamenti,
documenti, depositi con `requestId` altrui, bacheca, consensi, notifiche.
Nessuna SQL injection nella query grezza. Nessuna query club-scoped senza
`organization_id`. Upload con allowlist chiusa, tetto, nome ripulito, `nosniff`.
`bookable=false` rifiutato **lato server**. Legame revocato riletto a ogni
richiesta, senza cache nel token.

### I tre High

| # | Cosa | Come si vedeva |
|---|---|---|
| **La versione che non tornava indietro** | La schermata degli allenamenti mandava la versione — la correzione di §O — e non riscriveva mai quella che il server rispondeva. La copia in memoria si ricomponeva campo per campo, e `version` non era fra i campi | Una segretaria modifica un allenamento, si accorge di un refuso, salva di nuovo: «modificato da qualcun altro», **con nessun altro che ha toccato niente**. Il modale non si chiude da solo, quindi riprovando riceveva lo stesso errore per sempre e perdeva le modifiche |
| **Un questionario che diventava un rinnovo** | L'elenco dei moduli online non filtra per tipo, ed e giusto. Ma la CTA mandava **tutti** al flusso di rinnovo, che invia con `kind: "renewal"` | Il club pubblica un «Questionario gradimento». La famiglia preme «Compila» e legge «Il rinnovo e lo stesso modulo dell'iscrizione». In segreteria arriva una **pratica di rinnovo**, da esaminare e approvare — e approvarla avrebbe scritto anagrafica da risposte che non sono un'iscrizione |
| **Un campo occupato per settant'anni** | La prenotazione aveva come solo vincolo `inizio < fine`. Un campo che non dichiara fasce non ha vincolo, ed e deliberato (W6-D03): cioe e lo stato normale di ogni club che quel riquadro non lo ha compilato | Bastava chiedere dal 2027 al 2099 — anche per un refuso sull'anno. La riga nasce `pending`, e `pending` blocca: il campo restava occupato per tutti. La sonda, con il difetto rimesso, lo mostra per intero: la prenotazione normale del giorno dopo risponde **409** |

### Il Medium multi-tenant

Il corpo della richiesta di prenotazione poteva **sovrascrivere il figlio**. Si
cercava `body.athleteId` fra i figli di chi chiede — che sono i figli in
**tutti** i club — e si verificava che fosse un proprio figlio, non che fosse
un figlio di **questo** club. Il club, invece, viene dal percorso.

Una madre con un figlio qui e una figlia in un'altra societa poteva far scrivere
dentro le strutture di questo club una prenotazione intestata alla figlia
dell'altra: con la sua riga di audit, e una notifica a tutta la dirigenza che
nomina **un minore che non e loro tesserato**.

La correzione non e un controllo in piu, e un controllo in **meno**: il contesto
del figlio e gia risolto e verificato dal segmento di rotta, e il client mandava
comunque lo stesso identificativo. Due fonti per lo stesso fatto sono una di
troppo, e la seconda non era vagliata.

### La lezione, per la terza volta

Il correttivo del secondo round — «quando la proprieta riguarda una rotta, la
prova passa dalla rotta» — era stato applicato **solo dove il difetto era stato
trovato**. Il revisore lo ha detto meglio di come lo avremmo scritto noi:

- P-94…P-97 (versione ottimistica) chiamavano `updateClubEvent`, mentre la
  proprieta di §O e «la **schermata** manda la versione giusta»;
- P-104…P-106 chiamavano il servizio degli appuntamenti, mai il modulo;
- P-70…P-76 chiamavano `submitRenewalForm`, e cosi **ratificavano** il difetto
  del questionario invece di contestarlo;
- P-54 verificava che `downloadPath` cominci con un prefisso, cioe una stringa;
- i 23 test di superficie sono `includes()` sul sorgente: dicono che una riga
  esiste, mai che il valore che ci passa e giusto.

Le dodici prove di §S partono tutte da fuori — dalla rotta o dalla proiezione,
mai dal servizio — e **rimettendo i difetti diventano rosse**, una per una.

### Cio che e stato corretto e cio che no

Tutti i reperti sono stati chiusi, con una sola eccezione dichiarata: `notes`
sulle presenze **resta** visibile alla famiglia. E la nota sull'appello di quel
ragazzo, e l'area atleta la dichiara fra i quattro campi che mostra a lui di se
stesso, leggendola proprio da qui. Toglierla avrebbe spento quella schermata di
rimbalzo — una decisione di prodotto presa altrove, che non si capovolge dentro
una lane di correzioni. Il test dell'area atleta lo ha detto subito, ed e
servito.

---

## 19. Il quarto e il quinto round, e la malattia di questo pacchetto

Il terzo round si era chiuso e il quarto doveva confermarlo. Non lo ha fatto:
ha trovato **quattro High**. Il quinto, che doveva coprire la superficie che il
quarto aveva dichiarato di non aver raggiunto, ne ha trovata **una**.

A questo punto vale piu di ogni singolo reperto scrivere la diagnosi.

### La malattia

> **Il dominio calcola la risposta giusta, e la superficie che ci arriva non
> gliela chiede.**

Si e manifestata sei volte in questo pacchetto, sempre diversa e sempre la
stessa:

| Forma | Dove |
|---|---|
| Un campo che il client manda e il server non legge | `type_id` sulla riprogrammazione (2° round) |
| Una prova che chiama il servizio invece della rotta | `R-01` (2° round) |
| Uno stato locale che non riceve cio che il server ha appena scritto | la versione dell'evento (4° round) |
| Una condizione sempre vera perche confronta fuori dal codominio | `status !== "cancelled"` (4° round) |
| Una correzione applicata a una superficie e non alla sua gemella | `clubIdentity` su `Header` e non su `MobileTopBar` (4° round) |
| Un vocabolario imparato dal dominio e non dalla schermata | le parole del rinnovo (5° round), il **colore** dello stato (5° round) |

E tre volte **la correzione di un round ha creato il difetto del successivo**:

1. la correzione di R6 (mezzanotte) ha aperto F4 (trenta ore fino a mezzanotte
   due giorni dopo);
2. la correzione del questionario-rinnovo lo ha mandato alla pagina pubblica
   anonima, perdendo il legame con il figlio;
3. la correzione dell'etichetta dell'appuntamento ha lasciato il **colore** sul
   vocabolario vecchio, e le due meta si contraddicevano nella stessa pastiglia.

### La cosa piu utile che un revisore ha fatto

Il quarto ha chiuso il proprio referto dicendo, a chiare lettere, **quali file
non era riuscito a coprire**. Quella dichiarazione ha prodotto il quinto round,
che su quei file ha trovato una High — in `renewal-form.tsx`, un file che **non
e mai stato nel diff di PP-02**, e che per questo quattro round non avevano
avuto motivo di aprire.

Da qui una regola che vale oltre questo pacchetto:

> Una revisione che dichiara la propria copertura vale piu di una che sembra
> completa. E il difetto che sopravvive non sta quasi mai nel file che hai
> cambiato: sta in quello che **legge** cio che hai cambiato.

### Cosa ne esce per le prove

Le sonde di §S e §T partono tutte dalla rotta o dalla proiezione. Ma i test di
superficie restano `includes()` sul sorgente, e il quarto revisore lo ha detto
senza girarci intorno: possono dire che una riga esiste, mai che il valore che
ci passa e giusto. Le due prove nuove sugli appuntamenti guardano **i campi che
la riga legge** invece della stringa che li circonda — e' il massimo che questa
forma di test consente. Il resto lo dovra fare un collaudo a schermo, che per
questo pacchetto e stato fatto (§ precedente) e va rifatto a ogni cambiamento
dell'area.

---

## 20. Dal settimo al dodicesimo round: la revoca, e cosa insegna

I round dal settimo in poi hanno lavorato quasi tutti su **un solo difetto**, e
il modo in cui si e spostato di volta in volta vale piu del difetto stesso.

### Il difetto di partenza

«Scollega account» **non revocava**. Il vaglio dell'accesso accetta quattro
forme di legame, e la quarta e l'indirizzo di **contatto** che la segreteria
scrive a mano sulla scheda (ADR-0114: e cosi che una famiglia entra senza
riscattare un codice). La revoca azzerava le altre tre e quell'indirizzo — che
al club serve — giustamente lo lasciava.

Risultato: la segreteria premeva il pulsante, leggeva la conferma che promette
«non vedra piu calendario, pagamenti e documenti del minore», la scheda diceva
«Account non collegato», e la persona continuava a vedere tutto. Byte del
certificato medico compresi, e con il potere di revocare i consensi dati
dall'altro genitore.

Non e un caso limite: e il percorso normale di una separazione o di un affido
che cambia.

### Cinque stesure, e cosa ha imparato ognuna

| # | Stesura | Cosa ha rotto o non copriva |
|---|---|---|
| 1 | Marchio `accessRevokedAt` **sulla riga** | Si aggirava aggiungendone una **sorella** con lo stesso indirizzo — a mano, o lasciando che lo facesse l'approvazione di un modulo, che fa `guardians.push(...)` di un oggetto nuovo |
| 2 | Riporto del marchio sui salvataggi generici | Un'esenzione che proteggeva un caso **irraggiungibile** («e il riscatto», che scrive per altra strada) e apriva quello reale |
| 3 | Elenco di **identita** sull'atleta | Sottraeva le revocate da **entrambi** gli insiemi della guardia di crescita, lasciando la differenza identica: piu debole di prima |
| 4 | Conservazione dell'elenco sul salvataggio generico | Fatta per **unione**, quindi un client poteva **aggiungere** identita e chiudere fuori un tutore legittimo |
| 5 | `contactOnly` sulle righe senza autore dimostrato | Criterio sul **trasporto** (`source`) invece che sull'autore: il rinnovo che una famiglia manda dall'area famiglia le toglieva l'accesso |

### La diagnosi

Sette volte su dodici round, **la correzione di un round ha creato il difetto
del successivo**. Il filo e uno solo, e va scritto perche vale oltre PP-02:

> **Una difesa nuova non eredita da sola le protezioni di quella che sostituisce
> o affianca.**

Le protezioni che ogni difesa su `athletes.data` deve avere, e che vanno
verificate **una per una** quando se ne aggiunge un'altra:

1. **sopravvivere al salvataggio generico** — quel blob viene sostituito per
   intero, e nessun file client conosce le chiavi di difesa;
2. **essere vista dalla guardia della crescita** — o toglierla non risultera una
   concessione, e non verra vagliata;
3. **essere letta da tutte e quattro le letture dei tutori** — accesso,
   solleciti, promemoria del certificato, notifiche documentali;
4. **non essere scrivibile da chi la deve subire** — una difesa che si puo
   impugnare e un'arma;
5. **essere reversibile per una strada dichiarata** — o una revoca diventa
   definitiva per errore.

Il §21 tiene ferma la terza con una sonda; le altre quattro hanno ciascuna la
propria.

### Il resto del pacchetto, in breve

Fuori dalla revoca, i round dal settimo al dodicesimo hanno chiuso:

- **un estraneo che si faceva scrivere come tutore di un minore** compilando un
  modulo pubblico: bastava lo slug che il club diffonde e il nome di un
  tesserato, e l'approvazione della segreteria faceva il resto;
- **le pratiche di iscrizione aperte a ogni ruolo di club**: la voce di catalogo
  dei moduli non aveva chiavi, e su una voce senza chiavi il vaglio dei ruoli
  personalizzati risponde `true` a chiunque;
- **l'RSVP che rifiutava la risposta di tutti** — una `select` che non portava
  la categoria, invisibile ai test perche il doppio di Prisma non proiettava;
- **la campanella che si accendeva su un pannello vuoto**, e la bacheca del
  ragazzo che rispondeva 403;
- **tre perimetri di sede e categoria mancanti**: sulla revoca (che *scrive*),
  sulla ricevuta, e sulla porta storica dei documenti;
- **`parent1`/`parent2`**, che concedono e che nessuno poteva revocare.

### I quattro operatori mancanti nel doppio di Prisma

`array_contains`, `isEmpty`, `select`, piu i filtri di relazione che restano
non implementati (debito **PP02-D12**). Il doppio considera **soddisfatta** ogni
condizione che non conosce: e la scelta giusta — un test deve fallire
sull'asserzione vera, non su una finta non-corrispondenza — e ha un prezzo che
va detto ogni volta.

`select` e stato il piu insidioso dei quattro: gli altri facevano tornare **piu
righe** del vero, questo faceva tornare **piu campi**. Un campo di troppo non si
nota fino al giorno in cui qualcuno decide qualcosa su di lui — ed e successo,
sull'RSVP.


## 21. Il quattordicesimo round: la guardia guardava la cosa sbagliata

Il tredicesimo round aveva chiuso un Critical che una correzione mia aveva
aperto. Il quattordicesimo ha misurato che quella chiusura era **corretta** —
8.748 forme di riga passate una per una attraverso `canParentAccessAthlete` e
confrontate con l'insieme sorvegliato: zero righe che concedono senza portare
identita, zero che portano senza concedere — e ha trovato altrove due High, uno
dei quali di nuovo aperto dal commit precedente.

### A — Revocare la madre revocava anche il padre

Configurazione ordinaria: madre e padre, ognuno con il proprio
`linkedUserId`, e **un solo indirizzo di famiglia** su tutte e due le righe.

Per raggiungere una seconda riga **della stessa persona** — un secondo invito
riscattato, che e la risposta ordinaria a «il link non funziona» e che
scavalcava la revoca — la ripulitura filtrava le righe sorelle con
`isLinkedToTarget`, che combacia **anche sul solo indirizzo**. Al padre
venivano quindi azzerati il legame dichiarato e scritto addosso il marchio.

Al caricamento successivo lui trovava «Accesso negato»: calendario, rate,
ricevute, documenti e certificato del figlio, e con loro solleciti, promemoria
e notifiche. La scheda diceva «Account non collegato» anche sulla sua riga,
nessuno aveva premuto quel pulsante, e l'audit registrava un `guardian_id`
solo — quello della madre. Per rientrare gli serviva un invito nuovo.

La correzione distingue **persona** e **recapito**: si spazza per
identificativo, e si cade sull'indirizzo solo quando la riga un identificativo
non ce l'ha. Li l'indirizzo **e** l'identita, e due righe senza identificativo
allo stesso indirizzo non sono distinguibili nemmeno in principio — quel caso
resta, dichiarato, e non e un difetto ma il limite del dato.

### B — «Tutte e quattro le grafie» non era mai entrato in funzione

Un round precedente aveva allargato `guardianAccessIdentities` a leggere le
quattro grafie dell'identificativo. Le leggeva pero su una riga che
`getGuardianRows` aveva **gia compressa** con `firstText`: tre letture su
quattro erano codice morto, e la misura lo ha mostrato in tre righe.

Effetto: un allenatore — nessuna chiave sugli accessi, nessuna vista clinica —
si scriveva `user_id: <se stesso>` in un `PATCH` dell'anagrafica, l'insieme
non cresceva, nessuna guardia scattava, e da quel momento riceveva ogni
notifica documentale su quel minore, con il nome del bambino e il documento
chiesto. Il cruscotto no; la campanella si. E la scheda continuava a dire
«Account non collegato», perche anche quel badge comprimeva.

Adesso la domanda «quali identita dichiara questa riga» ha **una** risposta,
`guardianDeclaredIds`, e la usano il vaglio dell'accesso, la guardia della
crescita, la deroga dopo una revoca e i due canali di invio.

### C — Il falso positivo che bloccava la scheda per sempre

La guardia confrontava uno stato di partenza calcolato **sottraendo** le
identita revocate con uno stato in arrivo che non le sottraeva. Su 1.536
combinazioni, 1.079 risultavano una crescita **rimandate invariate**.

Nasceva da solo, senza malafede, in due modi entrambi ordinari: la segreteria
revoca la madre e poi aggiunge la nonna con lo stesso indirizzo di famiglia;
oppure rimette la madre a mano, scrivendole il legame dichiarato senza passare
da un riscatto. Da quel momento un ruolo senza `clinical.read` non salvava
piu **niente** su quell'atleta — ne una taglia, ne un telefono, ne un documento
— con un messaggio che parlava di legami di famiglia mentre l'operatore stava
cambiando una maglia. Nessuna schermata scioglieva quello stato.

Due correzioni, e insieme rendono l'insieme una cosa sola e dicibile — **le
identita a cui questa scheda concede qualcosa**:

1. il ripiego sull'indirizzo cade anche su un'identita revocata, e da **tutti e
   due** i lati. Una riga con solo un indirizzo revocato non apre il cruscotto
   (dopo una revoca la deroga chiede un legame **dichiarato**) e non apre un
   invio (tutti e tre i canali filtrano sull'elenco): non deve contare;
2. l'asimmetria sparisce. Serviva a far risultare crescita il rientro di una
   persona revocata, ma quel rientro **non passa di qui** — lo scrive il
   riscatto con una `update` diretta — e cio che passa di qui, il ripiego, e
   ormai escluso dai due lati. Gli identificativi invece non si sottraggono
   mai: scriversi un legame **dichiarato** verso un'identita revocata resta una
   crescita, e resta rifiutato.

### E la guardia misura cio che verra scritto, non cio che e arrivato

Il confronto stava **prima** dei tre riporti (`accessRevokedAt`,
`contactOnly`, l'elenco delle identita), cioe guardava un `data` a cui
mancavano le difese che la rotta stava per rimettere. Non e un caso limite: e
il caso **normale**, perche nessun file client conosce quei tre campi e ogni
salvataggio li lascia cadere.

Spostato a valle, la domanda diventa quella giusta: dopo che le difese sono
tornate al loro posto, questa scrittura fa entrare qualcuno che prima non
entrava? I riporti non possono aprire niente — riscrivono cio che era in
archivio — quindi misurare dopo non indebolisce la guardia, la rende esatta.

Due sonde hanno cambiato asserzione per questo, ed e giusto dirlo:

- **W-13c** chiedeva che rimettere il solo indirizzo revocato fosse rifiutato.
  Adesso chiede che passi **e non conceda niente**. Rifiutarlo non proteggeva
  nessuno: era il falso positivo;
- **W-17d** chiedeva che togliere `contactOnly` fosse rifiutato. Adesso chiede
  che il salvataggio **riesca** e che il segno sia comunque li. Il riporto e la
  difesa piu forte del rifiuto: il segno diventa **immutabile** da questa rotta,
  e la sola strada che lo scioglie e un riscatto, che ha il suo gate.

### D — «Scollega account» non trovava un tutore nato da un modulo

Quelle righe un `id` non ce l'hanno: `form-submissions.ts` fa
`guardians.push` di un oggetto che porta i soli binding del modulo. La scheda
mostra allora l'id **sintetico** di `normalizeGuardianRows`, e la rotta
cercava per `entry.id`: rispondeva «Genitore non trovato nella scheda atleta»
su un genitore che era li sullo schermo, e la persona restava collegata —
proprio sulla classe di righe attorno a cui e nata tutta la difesa
`contactOnly`.

Si ricade percio sullo stesso id sintetico, calcolato con la **stessa**
funzione che lo mostra.

### Cosa insegna, di nuovo

Il conto di questo pacchetto e ormai una regola: **otto** difetti su quattordici
round sono stati aperti dalla correzione del round precedente. Sette volte la
forma era «una difesa nuova non eredita le protezioni di quella che affianca»
(ADR-0116). L'ottava, qui, e nuova e vale scriverla:

> Una correzione che **allarga un predicato per raggiungere di piu** va
> misurata anche su chi **non** doveva raggiungere.

La ripulitura delle righe sorelle e stata scritta per una proprieta vera — «la
revoca vale per la persona, non per la riga» — e provata con due righe **della
stessa persona**. La proprieta complementare, «e non raggiunge nessun altro»,
non la chiedeva nessuno. Le due adesso stanno accanto, `W-24c` e `W-25`, e
si leggono insieme.


## 22. Il quindicesimo round: fuori dalla revoca

I quattordici round precedenti hanno lavorato quasi tutti sullo stesso
perimetro. Al quindicesimo la revisione e andata dove le liste dei «non
verificati» indicavano da tre round — moduli, strutture, appuntamenti,
notifiche, il contesto del browser — e ha trovato **dieci High**, cinque dei
quali aperti o allargati dalle correzioni dei due round precedenti.

Vale la pena dire cosa significa: il perimetro della revoca **ha** converso —
il fuzz su 8.748 forme di riga non trova piu discordanze fra cancello e
guardia — e cio che restava aperto era tutto il resto. Un pacchetto non e
pulito perche la sua parte piu guardata lo e.

### Le due che concedevano

**Un rinnovo regalava l'area famiglia a un indirizzo qualunque.** Il segno
`contactOnly` era agganciato a «compilazione senza autore dimostrato», cioe al
solo modulo pubblico. `submitRenewalForm` scrive pero `submittedBy: userId`:
un tutore legittimo dichiarava un terzo con un indirizzo qualsiasi, la
segreteria leggeva «Genitore aggiunto: Zio» e approvava, e quell'indirizzo
apriva allergie, farmaci, i byte del certificato, rate e ricevute — e la revoca
dei consensi dati dall'altro genitore. Nessun audit di concessione, e
`accounts.athlete.manage` non veniva mai chiesta a chi concedeva.

Il criterio giusto non e «chi ha compilato» ne «da quale porta»: e **chi ha
scritto quell'indirizzo**. ADR-0114 fa valere l'indirizzo come chiave poggiando
sul presupposto che lo scriva il club, e l'unica compilazione di cui questo e
vero e quella interna.

**«Scollega account» revocava la persona sbagliata.** L'id sintetico di
`normalizeGuardianRows` nasce dal dato **piu l'indice**, e sembra unico. Non lo
e: la scheda atleta lo **salva**, quindi cancellare una riga fa scalare le
altre e una riga senza id genera a quel posto un id gia in archivio. Misurato:
il clic su «Scollega» della nonna che toglie l'accesso al padre, con l'audit
intestato al padre e la schermata che segna scollegate tutte e due. Lo stesso
id collidente faceva copiare il marchio della revoca sulla riga sbagliata al
primo salvataggio dell'anagrafica.

### La difesa che era diventata un'arma

Un ruolo di club con **zero chiavi** chiudeva fuori un tutore legittimo
scrivendogli `accessRevokedAt` addosso dalla rotta generica. Nessun audit. La
guardia sorveglia la **crescita**, e togliere l'accesso a qualcuno non fa
crescere niente.

E la stessa frase gia scritta per il registro delle identita — «una difesa che
si puo impugnare e un'arma» — che ai due marchi di riga non era stata
applicata. Adesso valgono esattamente cio che dice l'archivio: non si mettono e
non si tolgono da li, e chi vuole revocare passa da «Scollega account», che ha
il suo permesso e lascia la riga di audit.

### Il blob che usciva nel browser

`athletes.data` viaggiava quasi intera nel payload della famiglia. Il taglio
era un **elenco di cio che si toglie** — sei nomi di campo credenziale — su un
contenitore che la segreteria riempie a mano: ogni campo nuovo nasce visibile,
e nessuno se ne accorge. Misurato dentro la risposta: una nota «famiglia
morosa», una «relazione-servizi-sociali», il codice fiscale dell'altro tutore,
una nota che lo riguarda, e — nuovo di questa serie —
`revokedGuardianIdentities`, cioe il cruscotto che dichiara a chi legge che il
club ha revocato l'altro genitore. Il contesto conserva tutto anche in
`sessionStorage`.

Le schermate della famiglia leggono di quel blob **due** chiavi. Adesso escono
quelle, e la proiezione dei tutori porta nome, rapporto e recapiti invece dei
campi con cui si **decide** l'accesso.

### La notifica di nessuno

Una riga di notifica con `user_id` nullo finiva nella bacheca di **ogni**
genitore del club, e non si poteva spegnere: segnare letto filtra per
`user_id`. Misurato dal contenuto — «Rata scaduta: <nome del minore>», con
indirizzo, telefono e importo della famiglia.

Nessun produttore la scrive cosi di proposito: nasce quando il destinatario non
ha un account. Chi non ha un account non ha una bacheca — la sua strada e
l'email, che quello stesso invio percorre gia.

### Le tre della stessa domanda

- **L'interruttore «si compila una volta sola» non arrivava mai in
  produzione**: il confronto fra due schemi elencava a mano **sette** delle
  otto impostazioni, e l'ottava era quella. Adesso l'elenco si costruisce dalle
  chiavi dei valori predefiniti: la nona non ripetera la storia dell'ottava.
- **Due implementazioni di `isWithinFieldAvailability`**, sullo stesso dato,
  con risposte opposte: `Europe/Rome` dalla strada della famiglia, **UTC** da
  quella del club. Il lunedi alle 18:00, sullo stesso campo, la famiglia
  prenotava e l'allenatore veniva rifiutato. Il fuso giusto e quello locale,
  perche la fascia la scrive una persona e la rilegge come l'ha scritta.
- **Una fascia `22:00-02:00` veniva stampata e rifiutata**, e due fasce
  contigue non coprivano la loro unione: il messaggio di rifiuto elencava le
  fasce che contenevano la richiesta.

### Il presidio che non presidiava

`tests/ui/pp-02-superfici.test.mjs` sono **28 test, 76 asserzioni, zero
import**: tutto `readFileSync` piu `includes`. La revisione ha spento tre
funzioni lasciando intatte le stringhe cercate — la campanella della famiglia,
«Cambia figlio», l'elenco dei moduli online — e il file e rimasto **28/28
verde**.

Non e stato corretto in questo commit, ed e giusto dire perche: la suite non ha
`jsdom` ne `react-dom`, quindi il comportamento di un componente non e
**misurabile** qui, e introdurre un motore di rendering e un lavoro con la sua
misura, non una riga dentro una lane di correzioni. Le proprieta che vivono sul
server sono provate dalle sonde contro PostgreSQL; quelle che vivono nel
browser oggi non sono provate da nessuno, e adesso e scritto (**PP02-D16**).


## 23. Il sedicesimo round: gli importi, e la terza stesura dei riporti

Il quindicesimo round aveva lasciato scritto che gli **importi** non erano
stati verificati. Il sedicesimo e andato li e ha trovato la cosa piu grave del
pacchetto; e intanto ha riaperto, per la terza volta, la stessa ferita nei
riporti delle difese.

### Il Critical: la famiglia leggeva il doppio

`calculateAthleteExpectedIncome` accetta il periodo della stagione come
ripiego del pro-rata, e serve **sempre**, perche un piano che accende il
pro-rata senza dichiarare il proprio periodo e la configurazione ordinaria.
`getAthleteEnrollmentSummary` — l'unica strada verso l'area famiglia — quel
parametro non lo aveva ne in firma ne nel tipo.

Misurato su un piano da 600 EUR con iscrizione al 1° febbraio: la scheda
atleta calcolava **300**, l'area famiglia **600**. La famiglia leggeva «Totale
dovuto 600,00 EUR» e «Residuo 600,00 EUR» sopra un elenco di rate che somma
300, e quel residuo non sarebbe mai sceso a zero. Il dato per correggerlo era
gia nello stesso file: ne uscivano id ed etichetta della stagione, non le date.

### Le rate impagabili

La ripartizione troncava ogni rata al multiplo di cinque inferiore e faceva
assorbire tutto il resto all'ultima: `100` in 12 rate diventava undici da 5 e
una da 45, e `12` in 3 rate diventava `[0, 0, 12]`.

Una rata da zero non e un'anteprima innocua. Viene scritta in archivio, e li
non si chiude piu: `resolveLedgerState` chiede un dovuto maggiore di zero per
dire «pagata», il pagamento online risponde «Questa rata e gia saldata» e
l'incasso manuale «L'importo supera il residuo della rata (0.00 EUR)». Resta
scaduta per sempre, e il conto degli insoluti della famiglia non torna a zero.

### La terza stesura dei riporti, e cosa insegna

I riporti delle difese hanno avuto tre stesure, e ognuna ha chiuso il difetto
della precedente aprendone uno nuovo:

1. **per `id`** — e le righe che il segno `contactOnly` protegge un id non
   ce l'hanno, perche nascono da `guardians.push`;
2. **per id, o per posizione** — e la posizione la sceglie chi chiama. Tre
   strade indipendenti, misurate con un ruolo a **zero chiavi**, scrivevano il
   marchio di una riga addosso a un'altra: riordinare le righe, mandare id che
   in archivio non esistono, duplicarne uno in arrivo. E se il salvataggio
   cambiava la **lunghezza** dell'elenco il riporto non si applicava affatto:
   `contactOnly` spariva, e per quel segno non c'e un secondo registro che lo
   rimetta;
3. **per identita** — che e la risposta giusta, e si vede solo dicendola:
   *una difesa non protegge una riga, protegge una persona*, e le persone
   sopravvivono al riordino, alla rinumerazione e all'inserimento in mezzo.

La definizione di identita non e pero «l'identificativo se c'e»: dopo una
revoca la riga in archivio ha gli identificativi **azzerati**, quindi una riga
che si ridichiara con `linkedUserId` avrebbe un'identita che con quel marchio
non combacia — ed e esattamente la strada con cui una scheda aperta prima della
revoca la annulla salvando. Un identificativo vale come identita solo se il
club lo **riconosce gia**, cioe se compare su una riga in archivio che un
marchio non ce l'ha. Le due meta si tengono insieme:

- il **padre** che condivide l'indirizzo di famiglia con la madre revocata ha
  il proprio identificativo sulla propria riga, viva: e lui, e il marchio
  dell'altra non lo tocca;
- la **madre** che si ripresenta con il proprio: in archivio quel numero non
  c'e piu, quindi resta l'indirizzo, e l'indirizzo porta il marchio.

### Le altre quattro

- **La campanella non si spegneva.** `onMarkRead` era dichiarata nel tipo,
  documentata e propagata da tre gusci — e mai invocata: nel file compariva due
  volte, tutte e due nella firma. Il clic restava sulla scrittura generica, che
  a un genitore risponde 403 e lascia una riga di audit a ogni notifica aperta.
- **«Segna tutte come lette (N)»**: N contava le notifiche del figlio scelto,
  la scrittura ne chiudeva **tutte** quelle del genitore in quel club. Un
  genitore con due figli spegneva anche quelle dell'altro.
- **`/documenti` apriva con una chiave e la rotta ne chiedeva due.** La
  seconda (`documents.read_dossier`) e deselezionabile nell'editor dei ruoli,
  quindi la configurazione si raggiunge dall'interfaccia: chi la incontrava
  trovava un riquadro rosso sopra una coda vuota, e una riga di audit a ogni
  apertura.
- **La fascia notturna, di nuovo.** Il quindicesimo round aveva aperto la
  fascia `22:00-02:00`; la finestra della prenotazione si fermava pero alla
  mezzanotte, quindi la richiesta `23:00 → 01:00` — quella che quella fascia
  esiste per accogliere — restava rifiutata, citando nel messaggio la fascia
  che la conteneva. Chiuso a meta e' come chiuso male.

### Una prova che non discriminava

Vale la pena scriverlo perche e successo **misurando le proprie correzioni**.
La prima stesura di `W-39` chiedeva soltanto che la madre restasse dentro dopo
un riordino, e un **rifiuto** la soddisfaceva: rimettendo l'abbinamento
posizionale, la scrittura veniva negata dalla guardia e la prova restava verde.

Una prova sull'accesso deve chiedere anche che il salvataggio **riesca**, o non
distingue «ho protetto» da «ho bloccato tutto» — che e il verso opposto, e in
questo pacchetto e costato quattro volte.


## 24. Il diciottesimo round: la quarta stesura, e una rata da zero

Due High, **tutti e due riaperti dal commit precedente**. Il conto sale a dodici
difetti su diciotto nati dalla correzione del round prima, ed e ormai una
proprieta del pacchetto piu che una serie di sfortune.

### La revoca che si propagava all'altro genitore

Configurazione ordinaria: la madre ha riscattato un invito, il padre entra per
l'**indirizzo di famiglia** — la capability che ADR-0114 tiene aperta — e quello
stesso indirizzo sta su tutte e due le righe.

Dopo la revoca, `clearLinkedFields` azzera gli identificativi della madre e le
lascia l'indirizzo, perche al club serve per scriverle. La sua identita
**collassa** quindi sull'indirizzo di famiglia, che e esattamente l'identita del
padre. Al primo salvataggio ordinario — la segreteria cambia una taglia — il
riporto per identita gli scriveva addosso il marchio: calendario, rate,
ricevute, documenti e certificato spariti, nessuno aveva premuto niente, e in
audit restava un `anagrafica.updated`.

Il commento della stesura precedente prometteva **proprio questo caso**. Era
vero solo per il padre che porta un identificativo gia riconosciuto, cioe non
per quello per cui ADR-0114 esiste. Una promessa scritta in un commento non e
una proprieta misurata: qui la distanza fra le due e costata un round.

La quarta stesura e in ADR-0116, con la regola che ne esce — «fra due errori
possibili si sceglie quello che una seconda difesa copre» — e con l'id stabile
che rende raro il dubbio.

### La rata da zero, di nuovo

La riscrittura della ripartizione aveva chiuso le rate a zero e la somma
sbagliata, e le aveva riaperte sul ramo degli importi **fissi**: il vincolo
«non piu di quello che resta» c'era nella stesura vecchia e si e perso in
quella nuova. Un acconto fisso di 200 EUR su un totale ripartito di 150
produceva `[200, 25, 0]` — somma 225 sotto un «Totale dovuto 180,00 EUR», e una
rata da 0,00 che nessun canale puo chiudere.

Limitare l'importo fisso a cio che resta corregge la somma e lascia lo zero
(`[150, 0, 0]`). Uno zero pero non e mai una risposta: se le rate chiedono piu
del totale il piano e configurato male — e ha gia il suo avviso — ma cio che si
scrive in archivio deve restare **pagabile**, quindi si stringono tutte in
proporzione, importi fissi compresi. Il numero delle rate lo ha scelto il club,
e non e una funzione di arrotondamento a doverlo cambiare in silenzio.

Un fuzz su 4.000 piani con importi fissi casuali: zero somme sbagliate, zero
rate a zero, zero negative. Le tre sonde che il round precedente aveva scritto
chiamavano la funzione **senza** `preserveIndexes`, cioe non toccavano il ramo
in cui il difetto viveva.


## 25. Il diciannovesimo round: misurato contro PostgreSQL, e due High

Il primo round condotto **contro il database vero** invece che contro il doppio.
Due High, tutti e due dentro `resources.ts`, tutti e due nati dalla correzione
del round precedente: il conto sale a quattordici su diciannove. E le 230 sonde
esistenti erano **tutte verdi** mentre i due difetti erano vivi.

### Il segno cancellato dalla rotta, senza nessun attaccante

Il vaglio che decide se una riga in arrivo sia «nuova» guardava se la sua
**identita** fosse gia in archivio. Su una riga `contactOnly` l'identita e
l'indirizzo — gli identificativi non ci sono — quindi due tutori sulla stessa
email di famiglia, che ADR-0114 chiama la configurazione ordinaria, e la seconda
riga risultava «conosciuta». La rotta le cancellava allora il segno che il
dominio dei moduli le aveva appena scritto.

Misurato contro PostgreSQL, con il flusso di prodotto e basta: due moduli
pubblici approvati dalla segreteria, e al secondo il minore si apriva. Chi ha
compilato un modulo pubblico dichiarandosi tutore — senza dimostrare niente —
entrava in allergie, farmaci, byte del certificato, rate e ricevute.

E la diagnosi che il commit precedente aveva scritto nel proprio messaggio:
l'identita che collassa sull'indirizzo. Corretta in un punto e lasciata
nell'altro, dodici righe piu sotto.

### L'identita presa da un campo che sceglie chi chiama

L'`id` stabile era stato introdotto per togliere l'ambiguita. Arriva pero dal
corpo della richiesta, e vinceva su `linkedUserId` e sull'indirizzo: mandando
la riga della madre con l'`id` della riga revocata, il marchio le finiva
addosso. Perdeva calendario, rate, ricevute, documenti e certificato, con un
`anagrafica.updated` in audit invece di una revoca.

La superficie cresceva con il proprio rimedio. La quinta stesura corrobora
l'`id` invece di fidarsene: vale finche cio che la riga porta non indica
un'altra riga — e questo chiude anche il verso opposto, perche correggere un
refuso nell'indirizzo di un tutore adesso **non** gli fa perdere il segno.

### Cio che ha tenuto, e vale dirlo

La ripartizione in rate ha retto un fuzz di 60.000 piani dal lato del revisore e
50.000 dal mio: nessuna somma sbagliata, nessuna rata negativa. L'id stabile non
ha rotto «Scollega account», l'approvazione di un modulo, ne la scheda atleta.
Il registro delle identita revocate tiene: un modulo approvato che ridichiara
l'indirizzo di una persona revocata **non** riapre l'accesso.

### Cosa insegna

Due lezioni, e sono in ADR-0116 perche valgono oltre questo caso.

La prima: **una seconda difesa e tale solo se ha un gate diverso**. La
giustificazione scritta un round prima — «tanto lo copre la guardia della
crescita» — era falsa proprio per chi quel gesto lo fa di mestiere.

La seconda: **l'identita di una riga non e un campo che sceglie chi chiama.**


## 26. Il ventesimo round: smettere di riscrivere la stessa correzione

Il round che ha chiuso la classe, e non per averla corretta meglio.

### Il difetto, per la sesta volta

Un salvataggio **ordinario** della segreteria — una taglia — faceva cadere il
segno di solo-recapito, e l'area famiglia del minore si apriva a chi aveva solo
compilato un modulo pubblico: 3.782 byte di cruscotto con note mediche e
farmaci, byte del certificato, rate, ricevute, e la revoca dei consensi dati dal
genitore vero. In audit, un `anagrafica.updated`.

Il payload che lo produce e quello **vero** della scheda atleta: id sintetici
che in archivio non esistono, e le righe **senza** `contactOnly`, perche nessun
file client conosce quel campo. Con due tutori sullo stesso indirizzo di
famiglia l'abbinamento e ambiguo per costruzione, la riga risulta «nuova», e il
segno si butta.

Non era una regressione dell'ultimo commit: era il **residuo** dello stesso
difetto che l'ultimo commit dichiarava chiuso. Cinque stesure avevano spostato
il confine senza mai attraversarlo.

### Perche cinque stesure non erano bastate

Perche il problema, nella forma in cui era posto, **non ha soluzione**.

Far sopravvivere un marchio di riga a un salvataggio richiede di sapere quale
riga in arrivo corrisponda a quale riga in archivio. Quella domanda non ha
risposta: due righe senza identificativo allo stesso indirizzo non sono
distinguibili nemmeno in principio, e l'unico campo che le distingue — l'`id` —
arriva dal corpo della richiesta, cioe da chi si vorrebbe controllare.

L'indizio era nei dati da quattro round: delle tre difese, l'unica mai caduta e
`revokedGuardianIdentities`. Non perche sia scritta meglio: perche vive a
livello di **atleta**, ha una chiave propria e un solo scrittore, e **non ha
niente da abbinare**.

### La correzione: cambiare forma, non stesura

`contactOnlyIdentities` e un registro sull'atleta, con la stessa disciplina
dell'altro: lo scrive l'approvazione di un modulo, lo toglie il riscatto di un
invito, e dalla rotta generica si puo solo **aggiungere**, mai togliere. Il
marchio sulla riga resta — racconta la storia di quella riga — ma non decide
piu.

E la scheda adesso lo **mostra**. Il badge diceva «Account non collegato» tanto
per un recapito quanto per una riga qualunque; la difesa che governa l'accesso
al dato sanitario di un minore non compariva in nessuna schermata, misurato con
un `grep` su tutto `src/components` e `src/app`. Un club che non puo vedere
una difesa non puo accorgersi che e caduta, ed e questa la ragione per cui il
difetto e sopravvissuto cinque round senza che nessuno lo segnalasse.

### Cio che la revisione dichiara converso

Vale la pena riportarlo, perche dice dove **non** conviene piu cercare — ed e
misurato, non dedotto:

- **il registro delle identita revocate**: nessun modo di impugnarlo trovato in
  quattro round;
- **la guardia della crescita**: distingue un refuso da una concessione, non si
  aggira con array, maiuscole o le sei grafie dell'identificativo;
- **`roundInstallmentsToFive`**: 200.000 giri di fuzz dal lato della revisione,
  50.000 dal mio, zero difetti su quattro proprieta;
- **`stessaPersona` nella revoca**: ha retto ogni configurazione di ADR-0114.

E dove resta fragile: nei **chiamanti** dei domini induriti, non nei domini. La
funzione che ripartisce le rate e a prova di fuzz; e `generateInstallmentPreview`
a produrre una rata da zero, e la schermata a salvarla (PP02-D31). Si indurisce
la funzione e il difetto si sposta di un anello.


## 27. Il ventunesimo round: la difesa nuova non eredita niente, di nuovo

Il ventesimo aveva cambiato forma alla difesa e chiuso una classe che cinque
stesure non avevano chiuso. Il ventunesimo ha misurato la difesa nuova e ne ha
trovati **tre** difetti, tutti suoi, tutti nati nel round che l'aveva scritta.

E la quarta volta che questo pacchetto paga la stessa forma: **una difesa nuova
nasce senza le protezioni di quella che affianca.** ADR-0116 la descrive dal
quattordicesimo round, con una checklist di sette protezioni — e averla scritta
non e bastato a farsela applicare.

### Il registro si poteva riempire

Era conservato in «sola aggiunta» invece che in sola lettura, perche
l'approvazione di un modulo ci passava attraverso. Da quella fessura, misurato:
un ruolo di club a **zero chiavi** — che non riesce ad aggiungere un tutore,
perche la guardia della crescita lo nega — mandava
`contactOnlyIdentities: ["<indirizzo della madre>"]` e la chiudeva fuori dal
proprio figlio, con i canali di invio spenti, nessuna schermata che lo
spiegasse e un `anagrafica.updated` in audit.

La guardia non poteva vederlo: misura la **crescita**, e iniettare nel registro
**restringe**. Venti righe piu sotto, nello stesso file, il registro gemello e in
sola lettura per questa identica ragione, scritta a lettere — «una difesa che si
puo impugnare e un'arma». Due difese gemelle per progetto, due discipline
opposte.

Adesso lo scrive il dominio dei moduli con una scrittura diretta, come fa
`unlinkGuardianAccount` per le revoche, e la rotta generica lo conserva e basta.

### Il registro non conosceva le righe

Il marchio di riga ha una regola che il registro non aveva: **non si declassa un
tutore che la segreteria aveva scritto**. Il registro nega per identita, da
qualunque riga.

Misurato con il flusso ordinario: un atleta la cui unica riga e
`{ Anna, famiglia@… }` senza legame dichiarato — la capability di ADR-0114 — e
un modulo che dichiara un secondo tutore **allo stesso indirizzo di famiglia**.
La segreteria approva, legge «Genitore aggiunto», e la madre perde accesso e
invii.

Adesso un indirizzo che su quella scheda **e gia una chiave** non si avvelena:
la riga nuova la governa il suo marchio di riga, e chi entrava continua a
entrare.

### La strada di ritorno era scritta e non esisteva

«Lo toglie il riscatto di un invito» compariva nel messaggio di commit e in tre
file. Un `grep` sul file del riscatto restituiva **zero**. Un indirizzo di
famiglia avvelenato una volta restava chiuso per sempre, per ogni persona futura
che la segreteria avesse scritto su quella scheda senza un invito nominale.

Vale la pena dire come e successo: la patch che avrebbe scritto quella riga e
uscita a meta per un altro errore, e io non ho verificato che cosa fosse
atterrato. Il commento pero l'avevo gia scritto in quattro punti, e da quel
momento descriveva un comportamento inesistente. **Un commento che promette e
peggio di nessun commento**, perche il round dopo lo legge e non controlla.

### E i chiamanti, che il round prima aveva indicato

La revisione precedente aveva detto: il dominio e indurito, i **chiamanti** no.
Confermato, e corretto: l'anteprima delle rate produceva una rata da 0,00
**senza avviso** — i due controlli guardavano percentuali e importi fissi
separatamente, mai il risultato — e le due schermate bloccano il salvataggio
solo quando un avviso c'e. Adesso l'avviso guarda cio che esce.

E il badge, che il ventesimo round aveva aggiunto leggendo il **marchio di
riga**: dopo che a decidere e diventato il registro, tornava a dire «Account non
collegato» a un tutore che il cancello sta rifiutando. Adesso legge tutte e due.


## 28. Il ventiduesimo round: la correzione che non girava, e l'ottava protezione

Un High e quattro Medium, e questa volta la revisione ha risposto anche a una
domanda che valeva quanto i reperti.

### Il badge che non girava

La correzione del round precedente — il badge «Solo recapito», che doveva
spiegare alla segreteria perche un tutore non entra — **non e mai entrata in
funzione**. La scheda atleta gli passava `athlete.data.contactOnlyIdentities`, e
lo stato di quella pagina e un oggetto **chiuso** costruito campo per campo:
una chiave `data` non ce l'ha. Il terzo argomento era sempre vuoto.

E il quinto caso di codice irraggiungibile di questo pacchetto, e stavolta
l'irraggiungibile era la **spiegazione** che il prodotto doveva dare a chi si
trova davanti un genitore chiuso fuori. La sonda del round precedente chiamava
la funzione con oggetti letterali: la funzione era giusta, il cablaggio non
esisteva, e nessuno lo misurava.

### L'ottava protezione, che nessuno aveva scritto

La domanda posta alla revisione era: il registro dei soli recapiti e **davvero**
equivalente a quello delle revoche in tutte e sette le protezioni di ADR-0116?

La risposta e stata che tre non erano pari — e che **ne mancava un'ottava che
l'elenco non nomina**: lo scrittore del gemello e **atomico con il fatto che
registra**. `unlinkGuardianAccount` scrive righe e identita nella stessa
`update`; il registro nuovo scriveva le righe con `updateResource` e poi, fuori
transazione, rileggeva e scriveva se stesso. Cinque approvazioni concorrenti,
sei giri su sei con una voce persa.

La revisione ha anche detto **come** l'ha trovata, ed e la parte che vale: «si
rilegge la difesa che si sta copiando» era stato applicato al suo elenco di
proprieta, non al suo **codice**. Guardando il codice, la differenza fra una
`update` e due con una rilettura in mezzo si vede alla prima occhiata.

### Le altre tre

- **Il riscatto lasciava il segno sulla riga.** La regola che protegge un
  indirizzo «gia in uso» salta le righe marchiate: l'indirizzo di una famiglia
  che aveva seguito il percorso dichiarato — modulo, invito, riscatto — restava
  avvelenabile da qualunque modulo approvato in seguito. Adesso il riscatto
  toglie tutti e due i marchi: un accesso ridato si rida per intero.
- **La quarta lettura dei tutori** leggeva due grafie del legame dichiarato, e le
  altre tre ne leggono quattro: un tutore legato con `userId` smetteva di
  ricevere **solo** le notifiche documentali. Tre si e un no sulla stessa
  persona, sulla stessa riga.
- **Il badge** leggeva due grafie: una riga collegata con `userId` diceva
  «Account non collegato» mentre apriva l'area famiglia. Un badge che
  contraddice il cancello e peggio di nessun badge.

### E una sonda che non discriminava, di nuovo

`W-64` misurava i destinatari di una notifica documentale leggendo la bacheca
del genitore — e le sezioni precedenti gliene avevano gia scritte. Passava
comunque. Adesso parte da una bacheca vuota.

E la terza volta in questo pacchetto che una sonda verde non misurava niente:
vale la pena tenerlo a mente ogni volta che si legge «239/239».
