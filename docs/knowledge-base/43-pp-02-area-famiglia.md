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
