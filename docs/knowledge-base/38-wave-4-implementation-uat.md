# 38 — Wave 4: cosa e stato costruito, e cosa lo dimostra

> **Contabilita, prima nota, rendiconto e fiscalita gestionale.**
>
> Questo documento e un **consuntivo**, non un piano. Il piano e
> [37](37-wave-4-planning.md); qui c'e cio che esiste nel codice, cio che lo
> prova, e cio che non e stato fatto.
>
> Trentatre commit su `integration/web-v1`, da `76feed0` a `8230aff`.
> 220 file, otto migrazioni.
>
> **Ogni numero di questo documento e stato misurato**, non stimato. Dove una
> misura manca, il documento lo dice.

---

## Indice

1. [Il verdetto, in una pagina](#1--il-verdetto-in-una-pagina)
2. [Cosa e cambiato per un club](#2--cosa-e-cambiato-per-un-club)
3. [I workstream, e cosa ognuno ha prodotto](#3--i-workstream-e-cosa-ognuno-ha-prodotto)
4. [Il registro, e perche e una vista](#4--il-registro-e-perche-e-una-vista)
5. [Le prestazioni, prima e dopo](#5--le-prestazioni-prima-e-dopo)
6. [Le prove: cosa gira, e contro cosa](#6--le-prove-cosa-gira-e-contro-cosa)
7. [Le cinque tornate di revisione ostile](#7--le-cinque-tornate-di-revisione-ostile)
8. [Gli invarianti contabili, dichiarati](#8--gli-invarianti-contabili-dichiarati)
9. [La gap matrix](#9--la-gap-matrix)
10. [Cosa la Wave 4 non ha fatto](#10--cosa-la-wave-4-non-ha-fatto)
11. [Cosa resta da validare professionalmente](#11--cosa-resta-da-validare-professionalmente)

---

## 1 — Il verdetto, in una pagina

| | |
|---|---|
| Workstream | 10 su 10 nel codice |
| Migrazioni | 8 |
| Test | 3.529, tutti verdi |
| Riconciliazione SQL ⇄ TypeScript | 16 righe su 16, contro Postgres |
| Invarianti di database | 31 su 31 |
| Collaudo economico | 37 controlli su 37, contro Postgres |
| Concorrenza | 21 difese su 23 (due MEDIUM documentate) |
| Prestazioni a 35.000 righe | 11 misure su 11 entro soglia |

**Il verdetto onesto: la Wave 4 e completa nel perimetro gestionale, e il
perimetro fiscale professionale resta dichiaratamente non validato.** §11 dice
esattamente cosa.

---

## 2 — Cosa e cambiato per un club

Dieci cose, e nessuna e un dettaglio tecnico.

1. **La prima nota esiste.** Prima `/movements` era un aggregatore nel browser:
   diciassette viaggi HTTP per disegnare una pagina, di cui quattordici sulla
   stessa riga `clubs`. Adesso e un registro con data, conto, causale,
   controparte, documento e origine, e si legge in una richiesta.
2. **Il saldo di un conto non e piu una colonna scritta a mano.** Era
   `current_balance` dentro un blob JSON, mutato dal browser con una seconda
   chiamata non transazionale: un incasso registrato dalla scheda atleta non lo
   toccava, e due persone insieme se lo cancellavano a vicenda. Adesso e la
   somma dei movimenti, e si ricalcola ogni volta.
3. **«Entrate» dice la cassa.** Sommava dovuto e incassato: su un dataset reale
   la cassa era 250 € e la schermata diceva 1.750 €.
4. **Il denaro non si cancella.** Una rata con storia economica cancellava in
   cascata incassi, storni e rimborsi; un movimento si cancellava da un
   `confirm()` del browser. Adesso si storna, e lo storno e una riga che resta.
5. **Il rendiconto chiude.** Cassa e competenza sono due riquadri separati da un
   bordo, e non esiste una funzione che li sommi. Il non classificato si
   dichiara invece di sparire in un totale.
6. **Il commercialista riceve un file.** CSV con BOM, `;`, CRLF, quoting,
   decimali italiani, e venti colonne fra cui anno fiscale, stagione e sede.
7. **Il libro soci e append-only, con numerazione assegnata.** Il numero di
   tessera era un campo di testo libero: due segreterie potevano scrivere lo
   stesso numero e nessuno se ne accorgeva.
8. **Uno sponsor ha un contratto, un credito e un incasso che entra in prima
   nota.** Prima il residuo non esisteva e il denaro non arrivava al registro.
9. **Un documento fiscale emesso non si riscrive**, non si cancella, non torna
   in bozza, e se e annullato lo dichiara sul foglio con una fascia e una
   filigrana. La stampa legge lo snapshot congelato all'emissione.
10. **Un club con 35.000 movimenti apre il rendiconto in sette decimi di
    secondo.** Ne impiegava centodieci.

---

## 3 — I workstream, e cosa ognuno ha prodotto

| Lane | Stato | Cosa esiste |
|---|---|---|
| **W4-0 — I tre difetti** | **CHIUSA** | `assertPaymentHasNoEconomicHistory`; `cashEvidence` sulla riga normalizzata; `canDelete: false` ovunque e il CRUD generico chiuso su `transactions`/`transfers` |
| **BARRIERA** | **CHIUSA** | Tre tabelle, otto `CHECK`, quattro indici unici parziali, `src/lib/accounting/permissions.ts` con otto permessi, `src/lib/accounting/model.ts` con gli invarianti come funzioni |
| **W4-A — Causali e conti** | **CHIUSA** | `fiscal_operation_types` con `deductible`, `is_membership_fee`, `reporting_bucket` e l'autore della classificazione; `financial_accounts` con saldo derivato; `OperationTypesPanel` |
| **W4-B — Prima nota** | **CHIUSA** | `accounting_entries`, la vista `accounting_ledger_lines`, `/movements` come superficie del registro, storni, riconciliazione, previsioni |
| **W4-C — Gli agganci** | **CHIUSA** | Conto e causale su incassi, compensi e liquidazioni; storno della liquidazione; il versamento F24 come movimento |
| **W4-D — Rendiconto** | **CHIUSA** | `buildManagementReport`, sedici KPI dichiarati per grandezza, confronto fra periodi, `/reports` |
| **W4-E — Fiscalita rappresentata** | **CHIUSA nel perimetro gestionale** | Imponibile e imposta sui documenti, `activity_scope` congelato su incassi e documenti, immutabilita, numerazione, FatturaPA coerente |
| **W4-F — Libro soci** | **CHIUSA, ridotta** | `membership_events` append-only, numerazione assegnata, delibera, cessazione, stato derivato a una data |
| **W4-G — Export** | **CHIUSA** | `src/lib/accounting/export.ts` sopra `csv.ts`, venti colonne |
| **W4-H — Sponsor e controparti** | **CHIUSA** | Contratto, credito derivato da due fonti, incasso nel registro, documento intestato allo sponsor |

---

## 4 — Il registro, e perche e una vista

La decisione piu importante della Wave, e l'unica che e stata presa **due
volte**.

**La prima volta:** il registro non materializza incassi, compensi e
contributi. Li **proietta**. Materializzarli sarebbe stata la seconda
contabilita che il committente ha vietato: due fonti per lo stesso numero, e
nessun modo di tenerle allineate.

**La seconda volta:** la proiezione, scritta in TypeScript, rileggeva l'intero
registro a ogni pagina. Su 35.000 righe una pagina costava 5,7 secondi e il
rendiconto 110. La risposta e stata spostare la proiezione **dentro il
database**, come vista.

Una vista non e una tabella, e la differenza e tutta la ragione: non contiene
niente, quindi non puo disallinearsi da cio che legge. Se un incasso viene
stornato, la vista lo sa nello stesso istante in cui lo sa
`payment_transactions`, perche **e** `payment_transactions`.

### La regola e scritta due volte, e una sonda lo tiene onesto

| Dove | Cosa ne fa |
|---|---|
| `prisma/migrations/20260830160000_wave4_registro_a_prova_di_blob` | la **esegue**, in SQL: e cio che la produzione usa |
| `src/lib/accounting/ledger-view.ts` | la **dichiara**, in TypeScript: e cio che i test leggono e che il doppio di Prisma ricompone |
| `scripts/wave-4-registro-riconciliazione.mjs` | prova che le due **coincidono**, contro Postgres, riga per riga e campo per campo |

Senza la terza, le prime due sarebbero due contabilita. La sonda semina i casi
in cui potrebbero divergere — storno, rimborso, compenso a netto zero,
liquidazione stornata, documento annullato, movimento storico, importo con la
frazione a mezzo centesimo, e **sette righe di blob malformate** — e confronta
35 colonne piu l'ordine.

### Cosa il database ha insegnato, e i doppi no

Tre volte, in questa Wave, un doppio di Prisma ha lasciato passare cio che
Postgres rifiuta:

- `payment_transactions_amount_check` vieta l'importo **zero**: il ramo «importo
  zero» delle due proiezioni e irraggiungibile per gli incassi;
- `funding_settlements_amount_check` impone importo **positivo** a una
  liquidazione e **negativo** a uno storno: una stesura con lo storno positivo
  passava nei doppi e cadeva sul database;
- un `INSERT` diretto con un importo in notazione italiana o una data che non
  esiste faceva fallire **l'intera query** della vista — e la dichiarazione in
  TypeScript degradava con grazia, quindi le due letture non coincidevano
  sull'input sporco.

---

## 5 — Le prestazioni, prima e dopo

Misurate su un club dedicato con **~35.000 righe di prima nota** (20.000
movimenti propri, 12.000 incassi, 1.500 compensi, 500 liquidazioni, 1.000
movimenti storici nel blob), contro Postgres, con `ANALYZE` dopo la semina,
un giro a vuoto e cinque ripetizioni. Si riporta la **mediana**; il verdetto
guarda il **massimo**.

    node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
      scripts/measure-accounting-performance.mjs --grande

| Scenario | Prima | Dopo | Soglia |
|---|---:|---:|---:|
| Prima nota, prima pagina | 5.719 ms | **325 ms** | 800 |
| Prima nota, pagina intermedia | 4.885 ms | **362 ms** | 800 |
| Prima nota, ultima pagina | 5.225 ms | **374 ms** | 800 |
| Filtro anno fiscale | 3.305 ms | **123 ms** | 800 |
| Filtro conto | 1.904 ms | **86 ms** | 800 |
| Filtro causale | 1.934 ms | **17 ms** | 800 |
| Ricerca testuale | 5.107 ms | **145 ms** | 800 |
| Rendiconto annuale | 110.621 ms | **723 ms** | 2.000 |
| Rendiconto senza filtri | 3.661 ms¹ | **1.194 ms** | 2.000 |
| Saldi di tutti i conti | 24 ms | **11 ms** | 1.000 |
| Export annuale completo | 93.285 ms | **1.057 ms** | 5.000 |

¹ misurato dalla revisione ostile; il collaudo precedente non aveva questo
scenario.

**Cosa ha prodotto il guadagno**, in ordine di peso:

1. la vista: filtri, ordinamento, paginazione, conteggio e ricerca scendono nel
   database, e il rendiconto e l'export smettono di sfogliare una funzione che
   ricostruiva tutto — il costo era O(N × pagine);
2. tre indici che mancavano: `payment_transactions (organization_id, paid_at)`,
   `funding_settlements (organization_id, settled_at)`,
   `accounting_entries (organization_id, operation_type_code)`;
3. le cinque letture del riepilogo, che erano in sequenza perche la prima
   verificava il confine — il confine si verifica senza leggere niente;
4. il riepilogo che leggeva la riga intera per raggruppare: non guarda
   descrizioni, note, controparti ne il testo di ricerca, che e la colonna piu
   grande perche e la concatenazione delle altre.

**Il tetto di 40.000 righe resta**, e non e stato abbassato per far passare il
gate. A 35.000 righe c'e margine su ogni soglia; il tetto esiste perche un club
fuori scala non produca una lettura senza fine, e oltre il tetto il rendiconto
lo **dichiara** e l'export **rifiuta** invece di consegnare un file incompleto.

---

## 6 — Le prove: cosa gira, e contro cosa

| Cosa | Come si esegue | Esito |
|---|---|---|
| **3.529 test** | `npm test` | verdi |
| **Riconciliazione SQL ⇄ TypeScript** | `scripts/wave-4-registro-riconciliazione.mjs` | 16/16 righe, ordine identico |
| **Invarianti di database** | `scripts/wave-4-db-invariants.mjs` | 31/31 |
| **Collaudo economico** | `scripts/wave-4-uat.mjs` | 37/37 |
| **Concorrenza** | `scripts/wave-4-concurrency-probe.mjs` | 7/7 |
| **Concorrenza (audit)** | `scripts/wave-4-audit-concurrency-probe.mjs` | 21/23 |
| **Concorrenza (supplemento)** | `scripts/wave-4-audit-supplement.mjs` | 3/4 |
| **Prestazioni** | `scripts/measure-accounting-performance.mjs --grande` | 11/11 |

I tre script che chiedono un database vero rifiutano di partire se
`EASYGAME_DB_ENV` non vale `development`, creano un club dedicato e lo
cancellano.

### Cosa prova il collaudo economico

I sette scenari del §30 del brief, eseguiti **attraverso i servizi**:

1. quota 600 → incasso 200 → incasso 400 → storno;
2. incasso in contanti → versamento in banca;
3. dieci quote in contanti → un versamento cumulativo;
4. contributo: maturazione → liquidazione → storno;
5. sponsor: 5.000 dovuti, 2.000 incassati, 3.000 residui;
6. anno fiscale e stagione: due domande diverse;
7. la quadratura: saldo conto = movimenti netti + apertura.

Nessuna asserzione guarda una risposta HTTP: si contano le righe. Cio che prova
e che le quattro superfici — il ledger del dominio, la prima nota, i saldi dei
conti e il rendiconto — raccontino **lo stesso denaro**.

---

## 7 — Le cinque tornate di revisione ostile

Cinque tornate indipendenti. Vale la pena scrivere cosa hanno trovato ognuna,
perche il pattern si ripete e la sua forma e la cosa piu utile di tutto questo
documento: **ogni tornata ha trovato difetti creati dalla tornata precedente**,
e la quinta ne ha trovati meno della quarta, che ne aveva trovati meno della
terza. La curva scende, e non e ancora piatta.

### Prima tornata

Quattro `CRITICAL`, cinque `HIGH`. Il piu grave era un **IDOR di classe**: sei
moduli autorizzavano una riga contro `allowedOrganizationIds` mentre il
permesso si verifica con `activeRole`. Un genitore, proprietario di una societa
creata da lui, ha letto l'IBAN di un altro club, rinominato un conto,
registrato un'uscita da 70.000 euro e stornato un movimento.

### Seconda tornata, e cosa dimostra

La correzione della prima tornata aveva chiuso **sei moduli**. Erano un
campione: la stessa forma viveva in altri **dodici**. E fuori da quella firma
c'erano tre classi peggiori — vedi
[14 — Sicurezza §6-octies](14-security.md).

La seconda tornata ha trovato, fra le altre cose:

| # | Cosa | Perche importa |
|---|---|---|
| CRITICAL | `GET /api/v1/users` non aveva **nessun** confine | anagrafica di ogni utente della piattaforma, password riscrivibile, account cancellabile con i suoi club in cascata |
| CRITICAL | `assets` idem | carte d'identita e certificati medici, con il contenuto in base64 |
| CRITICAL | `user_metadata.role` si scriveva da se | qualunque account diventava amministratore di piattaforma con una `PATCH` |
| CRITICAL | una riga sporca nel blob storico | spegneva prima nota, rendiconto, export e saldi di quel club |
| CRITICAL | una ricevuta forgiata dirottava un incasso | quell'incasso non poteva **piu** essere documentato |
| CRITICAL | `prisma migrate dev` avrebbe cancellato i tre indici nuovi | rallentamento in produzione senza che nessuno collegasse le due cose |
| HIGH | il rendiconto troncava in silenzio su `/reports` | 434.520 € di incassato mancanti, senza un segnale |
| HIGH | la classificazione non arrivava mai a un incasso | il rendiconto dichiarava non classificato il 100% delle entrate delle famiglie |

**La lezione, e vale piu del singolo elenco:** una correzione che insegue una
**firma** — «cerca `allowedOrganizationIds`» — non trova cio che quella firma
non ha. `users` e `assets` non avevano un controllo sbagliato: non ne avevano
affatto. Per questo il confine adesso non e un elenco ma una **dichiarazione
obbligatoria**: `resources.ts` non si carica se una risorsa di modello non dice
a cosa appartiene.

---

### Terza tornata: cio che i test verdi non vedevano

Tre revisori su codice gia corretto e gia verde — 3.529 test, zero rossi. Hanno
trovato **sei fra Critical e quasi-Critical**, e nessuno era visibile alla
suite.

| # | Cosa | Perche i test non lo vedevano |
|---|---|---|
| CRITICAL | `prisma generate` falliva: il ramo non si installava ne si deployava | test, typecheck, lint e build usavano tutti il client generato **prima** del commit che ha rotto lo schema. Un artefatto piu vecchio del codice che descrive non e una verifica |
| CRITICAL | un incasso senza causale rispondeva 400 | il test che copre quel caso **omette la chiave** invece di mandarla `null`: la sola forma che il client non produce mai |
| CRITICAL | `createResource` non chiamava mai `assertRecordAccess`: un `upsert` per email riscriveva la password di chiunque | il test del confine copriva le altre tre porte. La quarta non aveva un controllo sbagliato: non ne aveva affatto |
| CRITICAL | `club_access` nel corpo concedeva `owner` di un club qualsiasi | il confine dava ragione all'attaccante — la riga era davvero sua — e continuava a dargliela **dopo**, perche a quel punto aveva ragione |
| CRITICAL | un importo oltre 21.474.836,47 spegneva la contabilita di un club | nessun test aveva mai scritto un numero troppo grande |
| CRITICAL | stornare e poi rimborsare era accettato: 100 € persi per incidente | saldo derivato e prima nota **concordano** su quel dato: nessuna riconciliazione fra le due letture puo vederlo |

### Quarta tornata: i difetti creati dalle correzioni

Due revisori sulle correzioni della terza. **Un High di sicurezza e un Critical
di prodotto, entrambi creati dalla terza tornata** — che e precisamente il
motivo per cui la conferma si fa.

- una **relazione annidata** scavalcava il confine, perche l'elenco delle
  relazioni da togliere era scritto a mano e lo schema era cambiato sotto;
- **cancellare uno sponsor** azzerava lo storico di tutti gli altri, perche il
  gestore risalvava nella vecchia collezione JSON un elenco che da un commit
  prima veniva dal registro, e nella forma sbagliata;
- le due letture del registro divergevano ancora su **undici date a Greenwich e
  ventisette a Roma**: la sonda che deve provare che coincidono dava un verdetto
  diverso a seconda della macchina su cui girava;
- **riempire** una riga orfana invece di crearla toglieva all'indice unico la
  possibilita di arbitrare una corsa: due emissioni simultanee restituivano due
  numeri e lasciavano una riga sola.

### Quinta tornata: la correzione che sposta il difetto

Due revisori sulle correzioni della quarta. **Due Critical**, di nuovo creati
dalla tornata precedente.

- **la creazione di un club era morta**, da entrambe le schermate. La chiave
  `members` era stata ribattezzata `memberships` per separare le tessere dal
  libro soci, e nessuno la **consumava** prima della scrittura: arrivava a
  Prisma come argomento sconosciuto. Il difetto non era stato chiuso, era stato
  **spostato** — e il test lo diceva verde perche il doppio di Prisma accetta
  gli argomenti che non conosce;
- **ogni emissione di fattura falliva** contro Postgres. Il filtro
  `NOT: { invoice_number: null }` era stato aggiunto per rendere il lato
  fattura uguale al lato ricevuta; ma `receipts.receipt_number` e nullabile e
  `invoices.invoice_number` e `NOT NULL`, e Prisma rifiuta un filtro nullo su
  una colonna obbligatoria. Una simmetria apparente costava l'intera funzione,
  e i test la coprivano con uno stato che il database non ammette.

E due difetti che nessuna tornata precedente aveva visto: un **operatore** di
Prisma su una colonna scalare — `{"status":{"set":"paid"}}` — attraversava
tutte le guardie e marcava una rata come saldata senza che un euro fosse
entrato; e `creator_id` preso dal corpo permetteva di **intestare un club a un
altro utente**, che se lo ritrovava attivo e con ruolo di proprietario.

Piu **165 divergenze su 482 righe ostili** fra le due letture del registro:
arrotondamento del millesimo (che a capodanno cambia l'anno fiscale, e a fine
millennio produce l'anno 10000 e fa cadere ogni lettura di quel club), fusi
fuori scala, spazi bianchi nei numeri, esadecimali, `btrim` contro `trim`,
`COALESCE` contro `||`, e il rendering JSON di un valore che non e una
stringa. La sonda ne semina ora ventiquattro classi, e riconcilia in quattro
fusi orari diversi.

**La lezione, e vale piu del singolo elenco:** una correzione che insegue una
**firma** — «cerca `allowedOrganizationIds`» — non trova cio che quella firma
non ha; e una correzione che tiene un **elenco** — di relazioni, di risorse, di
nomi — resta indietro in silenzio il giorno in cui lo schema cambia. Le due
regole che ne restano sono le stesse: chiedere allo schema invece di
ricordarsi, e far fallire il caricamento invece del test.

---

## 8 — Gli invarianti contabili, dichiarati

Il brief chiedeva di dichiararli invece di forzare identita fra concetti
diversi. Sono quattro, e ognuno dice **anche** quando non si applica.

### 8.1 — Il saldo di un conto

    SALDO CONTO = SALDO DI APERTURA + MOVIMENTI FINANZIARI NETTI DEL CONTO

Vale **sempre**, e lo prova lo scenario 7 del collaudo economico. Le righe
neutralizzate — stornate, e gli storni — sommano zero e restano fuori da
entrambi i lati. I **movimenti storici** non hanno un conto e non entrano: il
loro effetto e gia dentro il saldo di apertura, che e cio che il vecchio blob
`clubs.bank_accounts` dichiarava il giorno del travaso.

> Cio che la migrazione della prima stesura affermava — «il saldo di apertura e
> la somma dei movimenti storici» — **non e vero**, ed e stato corretto: e il
> saldo **dichiarato**, non una somma. Una riga storica scartata non e quindi
> «gia dentro il saldo»: non e in nessuna superficie. Vedi §10.

### 8.2 — Il dovuto di una famiglia

    DOVUTO = INCASSATO + RESIDUO

Vale sulle rate (`payments` per il dovuto, `payment_transactions` per la cassa),
e lo stato di una rata non si scrive: si deriva. Non vale — e non deve — fra
**cassa** e **competenza**: un credito verso una famiglia non e denaro in
cassa, e il rendiconto li tiene in due riquadri separati da un bordo, senza
nessun totale che li unisca. E il difetto D-2, e il modo di non ripeterlo e non
esporre il numero che lo produce.

### 8.3 — Il credito di uno sponsor

    DOVUTO (contratto) = INCASSATO + RESIDUO

Vale, con due fonti per l'incassato — le righe di `payment_transactions` con la
controparte dichiarata, e la vecchia collezione JSON — che sono **disgiunte per
costruzione**, perche un incasso nuovo non scrive piu nel JSON.

### 8.4 — I contributi

    MATURATO ≠ LIQUIDITA

Maturare fa nascere un credito verso l'ente; solo la **liquidazione** e denaro.
Cinque importi distinti e nessuno si somma agli altri: assegnato, previsione,
maturato, rendicontato, liquidato (ADR-0037).

### 8.5 — Il costo del lavoro sportivo

    COSTO CLUB = NETTO PAGATO ALLA PERSONA + F24 VERSATO ALL'ERARIO

Sono **due movimenti**, in due momenti, verso due controparti. La prima nota
registra fatti finanziari: dal conto verso la persona esce il netto, dal conto
verso l'erario esce l'F24. Registrare il costo pieno verso la persona **piu**
l'F24 conterebbe i contributi due volte, e il saldo del conto sarebbe sbagliato
di quella cifra a ogni compenso.

---

## 9 — La gap matrix

| Gap | Prima | Dopo |
|---|---|---|
| **G-09** — causale con i flag fiscali | PARTIAL | **CLOSED** |
| **G-10** — prima nota | CONFIRMED assente | **CLOSED** |
| **G-11** — rendiconto per voce | CONFIRMED assente | **CLOSED** (gestionale) |
| **G-12** — estratto conto | CONFIRMED assente | **CLOSED** (saldo derivato, movimenti per conto) |
| **G-13** — dichiarazione 730 | CONFIRMED assente | **OPEN** — V1.1, dipende dalla validazione professionale |
| **G-19** — «incassato conta le rate» | risolto sulle rate | **CLOSED** (D-2) |
| **G-23** — trasmissione allo SdI | CONFIRMED | **OPEN** — manca l'intermediario, non il codice |
| **G-39** — fornitori e ciclo passivo | CONFIRMED | **PARTIAL** — la controparte si, il ciclo passivo no |
| **G-40** — ricevute massive | CONFIRMED | **OPEN** — V1.1 |
| **G-41** — saldo IVA trimestrale | NEEDS VALIDATION | **OPEN** — POST-V1 |
| **G-45** — libro soci | CONFIRMED assente | **PARTIAL** — vedi §11 |
| **G-46** — quota associativa in contabilita | CONFIRMED | **CLOSED** |
| **G-54** — report economico esportabile | CONFIRMED assente | **CLOSED** |
| **G-70** — dimissione con data e motivo | CONFIRMED | **CLOSED** |
| **G-71** — riconciliazione payout | NO ACTION | **NO ACTION** |

**CLOSED 9 · PARTIAL 2 · OPEN 4**

---

## 10 — Cosa la Wave 4 non ha fatto

Dichiarato, non nascosto.

- **Riconciliazione bancaria vera.** Nessun parser CAMT/MT940/CBI, nessun
  matching automatico. Cio che esiste e una **spunta manuale** con data valuta e
  riferimento sulla riga.
- **Chiusura dei periodi.** Un esercizio non si chiude, e un movimento
  retrodatato entra in un anno gia rendicontato.
- **Il ciclo passivo.** I fornitori esistono come controparte; le fatture
  ricevute, lo scadenzario passivo e i pagamenti a fornitore no.
- **Il motore IVA.** Imponibile e imposta si **conservano** e si espongono; non
  si liquidano.
- **La trasmissione allo SdI.** Il tracciato si genera e si valida; non si
  trasmette, e la rotta lo dice esplicitamente con un 503.
- **Il travaso dei movimenti storici.** Restano nel blob e si leggono in sola
  lettura, senza conto e senza causale: travasarli avrebbe richiesto di
  **inventare** per ognuno un conto e una causale che nessuno ha mai
  dichiarato.
- **I due MEDIUM di concorrenza** che restano, con la ragione: vedi
  [16 — Debito tecnico](16-technical-debt.md), voci `W4-R1` e `W4-R2`.

---

## 11 — Cosa resta da validare professionalmente

Questo elenco esiste perche il prodotto **non dichiari conformita che nessun
professionista ha confermato**.

| Tema | Cosa fa oggi il prodotto | Cosa serve |
|---|---|---|
| **Libro soci** | Registro append-only con numerazione assegnata, delibera, cessazione e stato derivato a una data. E **bookkeeping**, non conformita statutaria | Un commercialista o un legale deve dire se questo registro soddisfa gli obblighi dello statuto e del RUNTS. Il prodotto **non** lo chiama «legalmente conforme» da nessuna parte |
| **Istituzionale vs commerciale** | Il club **dichiara** l'ambito sulla causale, e il prodotto lo congela sul movimento e sul documento. Il prodotto **non decide** | La classificazione di ogni causale va confermata da chi tiene la contabilita della societa |
| **Detraibilita e quota associativa** | Due flag sulla causale, che nascono `NULL` e non `false`: un valore non dichiarato si vede che manca | Le regole del 730 e della detraibilita sportiva vanno validate prima di G-13 |
| **Bollo** | Soglia 77,45 € e importo 2,00 € vivono come valori predefiniti del profilo, **senza fonte e senza anno** | Vanno versionati come le regole del lavoro sportivo: un file per anno con la fonte obbligatoria |
| **Saldo IVA per cassa** | Non esiste | G-41, POST-V1 |
| **Numerazione dei documenti** | Sequenza per club, serie e anno; il numero non si digita e un buco resta leggibile (ADR-0044) | La politica di numerazione — serie separate per fatture e ricevute, ripartenza annuale — va confermata |

---

## Riferimenti

- [37 — Wave 4: planning](37-wave-4-planning.md)
- [30 — Gap audit Golee/EasyGame](30-golee-easygame-gap-audit.md)
- [06 — Modello dati](06-data-model.md) — le tre tabelle, la vista, i vincoli
- [14 — Sicurezza](14-security.md) — le due tornate di IDOR, per intero
- [16 — Debito tecnico](16-technical-debt.md) — cio che resta, con la ragione
- [18 — Decision log](18-decision-log.md)
- `src/lib/accounting/OWNERSHIP.md` — chi possiede cosa, nel registro
