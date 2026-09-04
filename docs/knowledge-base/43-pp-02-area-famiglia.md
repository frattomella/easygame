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

## 7. §O — I due residui di PP-01

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

## 8. Verifica

### Collaudo di dominio

`scripts/pp-02-uat.mjs` semina **due famiglie nello stesso club** — che e la
configurazione su cui un errore di perimetro si vede, perche due club diversi si
separano gia da soli per `organization_id` — piu un tutore senza tessera e un
club estraneo.

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
