# 37 — Wave 4: planning esecutivo

> **Contabilita, prima nota, rendiconto e fiscalita ASD/SSD.**
>
> Questo documento e un **piano**, non un'implementazione. Nessuna riga di
> codice e stata scritta, nessuna migrazione creata, nessun dato toccato. La
> ricognizione che lo precede e stata **di sola lettura**.
>
> Redatto il 2026-08-29, dopo le Wave 1, 2 e 3
> ([32](32-wave-1-implementation-uat.md), [34](34-wave-2-implementation-uat.md),
> [36](36-wave-3-implementation-uat.md)).

---

## Indice

1. [Cosa e stato letto, e con quale metodo](#1--cosa-e-stato-letto-e-con-quale-metodo)
2. [Il principio: chi possiede cosa](#2--il-principio-chi-possiede-cosa)
3. [La mappa del denaro](#3--la-mappa-del-denaro)
4. [Economico e finanziario non sono la stessa cosa](#4--economico-e-finanziario-non-sono-la-stessa-cosa)
5. [Cio che la ricognizione ha trovato, e che non sapevamo](#5--cio-che-la-ricognizione-ha-trovato-e-che-non-sapevamo)
6. [I tre difetti che vengono prima del piano](#6--i-tre-difetti-che-vengono-prima-del-piano)
7. [Il gap audit della Wave 4](#7--il-gap-audit-della-wave-4)
8. [Prima nota: la domanda mal posta, e la risposta](#8--prima-nota-la-domanda-mal-posta-e-la-risposta)
9. [Causali](#9--causali)
10. [Conti finanziari](#10--conti-finanziari)
11. [Trasferimenti interni](#11--trasferimenti-interni)
12. [Riconciliazione bancaria](#12--riconciliazione-bancaria)
13. [Rendiconto: gestionale, non ufficiale](#13--rendiconto-gestionale-non-ufficiale)
14. [Anno fiscale e stagione](#14--anno-fiscale-e-stagione)
15. [Istituzionale e commerciale](#15--istituzionale-e-commerciale)
16. [IVA: il dato prima del motore](#16--iva-il-dato-prima-del-motore)
17. [Fatture e ricevute](#17--fatture-e-ricevute)
18. [Quota associativa e quota sportiva](#18--quota-associativa-e-quota-sportiva)
19. [Libro soci](#19--libro-soci)
20. [Controparti](#20--controparti)
21. [Sponsor](#21--sponsor)
22. [Voucher e contributi: solo coerenza](#22--voucher-e-contributi-solo-coerenza)
23. [Lavoro sportivo: solo integrazione](#23--lavoro-sportivo-solo-integrazione)
24. [Storni](#24--storni)
25. [Audit](#25--audit)
26. [Chiusura dei periodi](#26--chiusura-dei-periodi)
27. [Export per il commercialista](#27--export-per-il-commercialista)
28. [Dashboard economica](#28--dashboard-economica)
29. [Multi-sede](#29--multi-sede)
30. [Permessi](#30--permessi)
31. [Matrice di validazione professionale](#31--matrice-di-validazione-professionale)
32. [Normativa: cosa e verificato e cosa no](#32--normativa-cosa-e-verificato-e-cosa-no)
33. [Audit anti-duplicazione](#33--audit-anti-duplicazione)
34. [I workstream e il DAG](#34--i-workstream-e-il-dag)
35. [Cosa non copiamo da Golee](#35--cosa-non-copiamo-da-golee)
36. [Pre-production challenge](#36--pre-production-challenge)
37. [Gli scenari di collaudo, decisi prima del codice](#37--gli-scenari-di-collaudo-decisi-prima-del-codice)
38. [Prestazioni](#38--prestazioni)
39. [Cosa la Wave 4 non fa](#39--cosa-la-wave-4-non-fa)

---

## 1 — Cosa e stato letto, e con quale metodo

Sette letture indipendenti e **parallele**, tutte in sola lettura, ognuna con
un dominio e il divieto di sconfinare. Nessuna ha modificato un file.

| Lettura | Dominio | Esito in una riga |
|---|---|---|
| **A** | Pagamenti delle famiglie: rate, incassi, storni | La catena e solida e **non arriva alla prima nota**. Trovato un percorso di cancellazione distruttivo |
| **B** | Movimenti, riepilogo finanziario, report | **Non esiste una tabella movimenti.** «Entrate» somma due grandezze diverse |
| **C** | Lavoro sportivo, denaro in uscita | Il registro e esemplare. `bank_account_id` esiste e **nessuno lo compila** |
| **D** | Voucher e contributi, riconciliazione | La catena e completa fino all'incasso e **si ferma li**: nessuna riga di prima nota |
| **E** | Motore fiscale, documenti, sponsor, soci | Il motore c'e e **non raggiunge nessun dato reale**: `operation_type_code` e sempre nullo |
| **F** | Golee: il perimetro contabile e fiscale | Cinque assenze note poggiano su **un solo mattone**: la causale con i flag fiscali (G-09) |
| **G** | Normativa e classificazione professionale | Vedi §31 e §32 |

**Il metodo, e perche conta.** A ogni lettura e stato chiesto di citare
`file:riga` per ogni affermazione e di scrivere **«non esiste»** mostrando il
comando che glielo ha fatto concludere. Non e pedanteria: meta di cio che
segue contraddice la documentazione esistente, e senza una citazione non
sarebbe distinguibile da un'opinione.

Il documento [30](30-golee-easygame-gap-audit.md) resta la fonte dei gap, con
**una riserva** che va detta subito: il suo §3 — la matrice delle 189
capability — **non e mai stato riscritto** dopo le tre Wave. Chi lo legge oggi
trova C-144 ancora `EG~` P1 benche G-19 sia chiuso dal §4.5, e i totali del
§3.19 fermi a `EG- 48` quando le Wave dichiarano 36. **Le uniche sezioni
aggiornate sono le §4.5, §4.6 e §4.7.** Questo planning legge quelle.

---

## 2 — Il principio: chi possiede cosa

La richiesta e stata esplicita: *non voglio una seconda contabilita*. La
condizione perche non nasca e che **ogni numero economico abbia una sola fonte
canonica**, e che chi la legge non la ricalcoli.

### La tabella di ownership, come e oggi

| Grandezza | Proprietario canonico | Chi puo solo leggere |
|---|---|---|
| Quanto e **dovuto** da una famiglia | `payments.amount` — [`prisma/schema.prisma:383`](../../prisma/schema.prisma) | tutti |
| Quanto e **stato incassato** da una famiglia | somma delle righe valide di `payment_transactions` — `src/lib/payments/installment-ledger.ts:330` | tutti |
| Lo **stato** di una rata | non e un dato: `resolveLedgerState`, `installment-ledger.ts:380` | tutti |
| Quanto e **maturato** verso una persona | `sport_work_compensation_installments.accrued_amount` | tutti |
| Quanto le e stato **pagato** | `sport_work_outbound_transactions` — `src/lib/server/sport-work-ledger.ts` | tutti |
| Contributi, franchigie, costo del club | congelati sulla riga di registro — `prisma/schema.prisma:1725-1744` | **nessuno li ricalcola** |
| Quanto e **maturato** da un bando | `funding_accruals.accrued_amount` | tutti |
| Quanto l'ente ha **versato** | somma di `funding_settlement_lines.amount` — `src/lib/funding/funding-model.ts:845` | tutti |
| Numero di un documento fiscale | `document_number_sequences` via `allocateDocumentNumber` | **nessuno lo digita** |
| Cio che un documento diceva quel giorno | `invoices.snapshot` / `receipts.snapshot` | tutti |

Questa tabella e **gia vera oggi**, ed e il patrimonio su cui la Wave 4 si
appoggia. Il compito della Wave non e riscriverla: e **aggiungere una riga**,
il movimento di prima nota, senza che diventi una fonte concorrente di
nessuna delle altre.

### La regola operativa, in una frase

> Un movimento di prima nota **non e mai la fonte** di un numero che un altro
> dominio possiede. E la sua **proiezione datata e classificata**. Se i due
> divergono, ha ragione il dominio.

---

## 3 — La mappa del denaro

Sette flussi. Per ognuno: la fonte di verita, l'evento economico (quando nasce
il credito o il debito), l'evento finanziario (quando il denaro si muove), come
si storna, dove finisce nella prima nota.

### 3.1 — Quota dell'atleta

```
PIANO DI PAGAMENTO  (clubs.payment_plans, JSON)
  -> RATA                payments                     evento ECONOMICO: nasce il credito
       -> INCASSO        payment_transactions         evento FINANZIARIO: entra denaro
            -> [oggi si ferma qui]
            -> DOMANI:   movimento di prima nota      data, conto, causale
       -> DOCUMENTO      receipts / invoices          facoltativo, per incasso
```

| | |
|---|---|
| Fonte di verita | `payments` per il dovuto, `payment_transactions` per la cassa |
| Stato | **derivato**, mai scritto: `resolveLedgerState` |
| Storno | riga opposta con `reverses_transaction_id`; **nessun DELETE** — `payment-transactions.ts:571` |
| Audit | `payment.transaction.recorded` / `.reversed` in `audit_logs` |
| Riconciliazione | **assente**: nessun conto, nessuna data-valuta, nessun estratto conto |
| Buco | l'incasso **non produce** nessuna riga di prima nota, e non tocca nessun saldo di conto |

### 3.2 — Voucher e contributi da enti

```
BANDO           funding_programs        regole = configurazione, non codice
  -> ISCRIZIONE funding_enrollments     assegnato al club
       -> MATURAZIONE  funding_accruals      evento ECONOMICO: nasce il credito v/ente
            -> RENDICONTAZIONE  status="reported"   marcatura interna, non trasmissione
                 -> LIQUIDAZIONE  funding_settlements + _lines   evento FINANZIARIO
                      -> [oggi si ferma qui]
```

| | |
|---|---|
| Fonte di verita | maturato: `funding_accruals`; incassato: **le righe di liquidazione**, mai lo stato |
| Cinque importi distinti | assegnato, previsione, maturato, rendicontato, liquidato (ADR-0037) |
| Storno | **non esiste**: una liquidazione registrata per errore resta, e blocca a valle |
| Riconciliazione | la ripartizione e obbligatoria: un bonifico dice **quali crediti chiude** |
| Buco | nessuna riga di prima nota, **nessun conto bancario**, nessun allegato contabile |

### 3.3 — Lavoro sportivo (denaro in uscita)

```
RAPPORTO   sport_work_relationships
  -> PIANO      sport_work_compensation_plans
       -> SCADENZA  sport_work_compensation_installments
            accrued_amount  = MATURATO   evento ECONOMICO: nasce il debito
            paid_amount     = PAGATO
            -> USCITA   sport_work_outbound_transactions   evento FINANZIARIO
                 -> PROIETTATA in /movements, in sola lettura
```

| | |
|---|---|
| Fonte di verita | il registro. Contributi e franchigie sono **congelati sulla riga** |
| Debito vero | `accruedUnpaid` — `src/lib/sport-work/plan.ts:333` |
| Storno | riga `COMPENSATION_REVERSAL` con tutti gli importi negati; l'originale resta marcato |
| Prima nota | **gia collegata**, e in sola lettura: `normalizeSportWorkPayout`, `club-financial-summary.ts:1125`, con `canEdit:false` |
| Buco | `bank_account_id` esiste e nessuna superficie lo compila; il versamento F24 esce dal club **senza lasciare una riga** |

### 3.4 — Sponsorizzazione

```
SPONSOR            clubs.sponsors (JSON)          nessun contratto, nessuna scadenza
  -> PAGAMENTO     clubs.sponsor_payments (JSON)  {date, amount, type, status}
       -> proiettato in /movements come categoria "sponsor"
```

| | |
|---|---|
| Fonte di verita | una collezione JSON sulla riga del club |
| Credito | **non esiste**: non c'e un'esposizione, non c'e un residuo |
| Documento | **non emettibile**: l'intestatario di una fattura e sempre un atleta (`fiscal-documents.ts:143`) |
| Storno | non esiste: si cancella la riga |
| Buco | il tipo di operazione `sponsorizzazione` e l'unico che **richiede** una fattura, ed e irraggiungibile |

### 3.5 — Movimento manuale (cassa e banca)

```
UTENTE -> /movements o AdvancedTransactionDialog
       -> clubs.transactions (JSON)  + club_resource_items
       -> mutazione a mano di clubs.bank_accounts[].current_balance
```

| | |
|---|---|
| Fonte di verita | **una colonna JSON senza schema**, scritta da due componenti React |
| Saldo del conto | **denormalizzato e mutato a mano**, non ricalcolabile: nessuna funzione lo ricostruisce |
| Storno | **non esiste**: si cancella, fisicamente, con un `confirm()` del browser |
| Audit | resta `resource.updated` su `clubs`, con l'id **del club**: quale movimento non si sa |
| Atomicita | movimento e saldo sono **due chiamate HTTP separate**, senza transazione |

### 3.6 — Documento fiscale

```
INCASSO  payment_transactions
  -> RICEVUTA  receipts   allocateDocumentNumber(receipt)   idempotente per transaction_id (unique)
  -> FATTURA   invoices   allocateDocumentNumber(invoice)   idempotenza applicativa, non vincolata
       -> TRACCIATO  einvoice_transmissions   FPR12 generato, validato, MAI trasmesso
```

### 3.7 — Trasferimento interno

```
GIROCONTO  clubs.transfers (JSON)  {fromAccount, toAccount, amount}
  -> direzione "transfer", collectedAmount forzato a 0
  -> ESCLUSO dai totali di entrate e uscite
```

E l'unico pezzo del dominio movimenti **modellato correttamente**, ed e il
precedente da conservare.

---

## 4 — Economico e finanziario non sono la stessa cosa

Il brief chiede di non progettare superfici che confondano le due grandezze.
La ricognizione dice che **EasyGame le confonde gia**, in un punto preciso, e
che il resto del prodotto le tiene distinte molto bene.

### Dove sono gia distinte, e come si chiamano

| Coppia | Economico | Finanziario | Dove |
|---|---|---|---|
| Famiglia | `payments.amount` (credito) | `payment_transactions` (incasso) | ADR-0036 |
| Lavoro sportivo | `accrued_amount` (debito) | `paid_amount` + riga di registro | ADR-0074 |
| Bando | `accrued_amount` (credito v/ente) | righe di liquidazione | ADR-0037 |
| Documento | `invoices` (fattura emessa) | l'incasso che l'ha generata | ADR-0047 |

Quattro domini, quattro coppie, tutte separate, ognuna con il suo ADR. **Non
c'e niente da insegnare a questo prodotto sulla distinzione**: c'e da renderla
vera anche nell'ultimo posto in cui non lo e.

### Dove non lo sono

Il numero «Entrate» di `/movements`. In
[`club-financial-summary.ts:251`](../../src/lib/club-financial-summary.ts):

```js
return status === "paid" ? amount : 0;
```

Per ogni riga che **non** porta la fotografia `data.ledger.paidAmount` — cioe
per **tutti** i movimenti manuali, tutte le previsioni convertite, tutte le
fatture e ricevute, tutti i pagamenti sponsor, fornitore, procura e struttura —
l'«incassato» e il **dovuto dedotto dallo stato**.

Quindi «Entrate» somma cassa vera (per le rate) e dovuto travestito da cassa
(per tutto il resto). E lo stesso difetto che ADR-0068 ha chiuso sulle rate,
**sopravvissuto in tutto il resto del perimetro**. Peggio: `normalizeStatus`
mappa `"issued"` su `"paid"` — una fattura **emessa e non pagata** conta come
denaro entrato.

Questo non e un gap da colmare: e un **bug**, e sta nel numero piu visibile del
prodotto. Vedi §6.

---

## 5 — Cio che la ricognizione ha trovato, e che non sapevamo

Cinque scoperte cambiano il piano rispetto a come sarebbe stato scritto
leggendo solo il documento 30.

### 5.1 — Non esiste una tabella movimenti

```
grep -rin "movement" prisma/     ->  nessun risultato
ls src/app/api/v1/movements      ->  non esiste
ls src/lib/server/movements.ts   ->  non esiste
```

`/movements` e **un aggregatore di lettura nel browser**: 22 letture in
parallelo, ~20 famiglie di righe normalizzate in memoria, due deduplicazioni
con due chiavi diverse, e un `sort` con `localeCompare` su date ISO. I
movimenti manuali vivono in cinque colonne `Json?` sulla riga `clubs`
(`transactions`, `transfers`, `expected_income`, `expected_expenses`,
`bank_accounts`), **senza indici, senza vincoli, senza schema**.

Il documento 30 chiama `transactions` un «registro esistente» accanto a
`payment_transactions` e `sport_work_outbound_transactions` (§22, riga 1452).
**Non lo e**: gli altri due sono tabelle, questo e un blob. La conseguenza per
il piano e diretta, ed e il §8.

Due delle 22 letture sono **morte**: `supplier_payments` e `suppliers` non
esistono ne come colonna ne come risorsa, e tornano sempre vuote.

### 5.2 — Il motore fiscale non raggiunge nessun dato

`operation_type_code` esiste su `payment_transactions`, `invoices` e
`receipts`. Ma lo schema di validazione degli incassi **non accetta il campo**,
e il webhook Stripe non lo passa. E quindi **sempre `null`**, e la catena di
fallback classifica **ogni documento** come `quota_attivita`.

Ne discende che `activity_scope` — la colonna che distinguerebbe istituzionale
da commerciale — **non tocca una sola riga reale**, e che il tipo
`sponsorizzazione`, unico con `documentRoute: "invoice"`, e irraggiungibile.

Tre funzioni scritte per fare la cosa giusta **non hanno chiamanti**:
`describeDocumentDecision` (la spiegazione da mostrare **prima** di emettere),
`peekDocumentNumber`, e `assertDocumentMutable` — quest'ultima implementa la
regola «un documento emesso non si modifica», mentre il CRUD generico su
`/api/v1/invoices` accetta un `invoice_number` **digitato dal client**.

### 5.3 — Il conto finanziario e mezzo nato, non assente

`sport_work_outbound_transactions.bank_account_id` **esiste** nello schema
(`prisma/schema.prisma:1723`) e il servizio **lo scrive**
(`sport-work-ledger.ts:513`). Nessuna superficie lo compila: non il dialogo di
pagamento, non le tre funzioni dell'agenda, che non lo accettano nemmeno nella
firma.

Sul lato incassi, `payment_transactions` **non ha** un riferimento al conto. I
saldi esistono solo su `clubs.bank_accounts[].current_balance`, mutati a mano
dal browser e **mai ricalcolabili**: non esiste una funzione che li ricostruisca
dai movimenti.

Il conto quindi non e da inventare. E da **finire**, e da rendere l'unica
risposta alla domanda «quanto c'e in cassa».

### 5.4 — La causale non esiste, ma la tabella si

Il documento 30 descrive `fiscal_operation_types` come «percorso documentale,
ambito», maturita 2. E piu ricca di cosi: ha gia `vat_rate` e `vat_nature`
(`schema.prisma:1443-1445`), tre `activity_scope`, quattro rotte documentali, e
un catalogo di nove voci seminabili fra cui **`quota_associativa`**.

Mancano i due flag che il documento chiama «il perno»: `deductible` e
`is_membership_fee`. **G-09 e quindi un EXTEND di poche colonne**, non una
tabella nuova — ma il campo `category` dei movimenti, che oggi e **testo
libero** e viene precompilato con la categoria **sportiva** dell'atleta
(«Under 15»), non e collegato a niente.

### 5.5 — Soci e sponsor vivono nel JSON del club, e si scrivono dal browser

`clubs.members` e `clubs.sponsors` sono colonne JSON. La creazione di un socio
legge l'array, ci appende un oggetto e **riscrive l'intera colonna** dal
browser (`src/app/soci/new/page.tsx:162`). Due segreterie che creano un socio
nello stesso minuto: la seconda scrittura cancella la prima.

Un socio non porta: delibera, numero progressivo assegnato, cessazione con
motivo, storico, quota versata. Il `membershipNumber` esiste come **campo di
testo libero** digitato a mano, non assegnato e non unico.

---

## 6 — I tre difetti che vengono prima del piano

Sono stati trovati durante una ricognizione **di sola lettura**, e non sono
gap: sono difetti attivi. Due riguardano la perdita di dati, uno riguarda il
numero piu visibile del prodotto. Vanno decisi **prima** che la Wave cominci,
perche costruire una prima nota sopra di essi significa costruire su un
pavimento che cede.

### D-1 — `DELETE` a cascata distrugge il registro degli incassi — **BLOCKER**

Tre fatti veri insieme:

1. `payment_transactions.payment_id -> payments.id` e **`ON DELETE CASCADE`**
   (`prisma/migrations/20260826090000_payment_transactions/migration.sql:71`);
2. `deleteResource` del CRUD generico fa `delegate.delete({ where: { id } })`,
   **senza** la guardia di ledger che protegge gli altri verbi
   (`src/lib/server/resources.ts:3357`);
3. `payments` e il suo alias `simplified_payments` **non sono** in
   `MANAGEMENT_ADMIN_ONLY_RESOURCES`, quindi `collaborator` e `staff` superano
   il controllo di accesso.

Risultato: **`DELETE /api/v1/simplified_payments/:id` cancella fisicamente la
rata e, a cascata, tutti i suoi incassi, storni e rimborsi** — per un ruolo che
**non ha il permesso di registrarne uno** (registrare un incasso richiede
owner o gestore). Un percorso di soft-delete corretto esiste, ma su un'altra
rotta.

Il dominio dichiara «Non esiste un `DELETE`, ed e una scelta». La scelta e vera
su una porta e falsa sull'altra.

### D-2 — «Entrate» somma cassa e dovuto — **BLOCKER**

Vedi §4. Il numero di testa di `/movements` non e ne cassa ne competenza: e un
misto, e nessuno che lo legge puo saperlo. Una fattura emessa e non pagata ci
entra come denaro incassato.

Nota di metodo: e **la stessa famiglia** di G-19, chiuso in Wave 1 sulle rate.
La correzione allora ha risolto il caso che era stato guardato; il resto del
perimetro e rimasto.

### D-3 — Il movimento manuale si cancella senza traccia — **IMPORTANT**

Un incasso di 100 € su una rata **non si puo cancellare**: si storna, e restano
visibili entrambe le righe con il motivo. Un movimento manuale di 10.000 € in
cassa si cancella con un `confirm()` del browser, sparisce dall'array e dalla
tabella gemella, e nell'audit resta «qualcuno ha modificato il club».

E la contraddizione piu netta del dominio: la regola «il denaro non si
cancella» vale dove il denaro e una riga di tabella e non vale dove e un
oggetto in un JSON.

---

## 7 — Il gap audit della Wave 4

Gap verificati contro il codice, non contro il documento 30. Lo stato dichiarato
qui **prevale** su quello del §3 della matrice, che non e aggiornato (§1).

### 7.1 — I gap del registro `G-xx`

| Gap | Cosa dice | Stato verificato | Wave 4? |
|---|---|---|---|
| **G-09** | Causale con flag di detraibilita e quota associativa | **PARTIAL** — `fiscal_operation_types` esiste con `vat_rate`, `vat_nature`, `activity_scope`; mancano `deductible` e `is_membership_fee`, e **nessuna schermata la configura** | **SI — e il prerequisito di tutto** |
| **G-10** | Prima nota | **CONFIRMED** — non esiste, e la premessa «e una lettura di tre registri» e **falsa**: uno dei tre e un blob JSON | **SI** |
| **G-11** | Rendiconto per voce di costo, bilancio con flusso di cassa | **CONFIRMED** — `/reports` ha quattro numeri sui pagamenti atleta e nessun rendiconto | **SI** |
| **G-12** | Estratto conto | **CONFIRMED** — nessun saldo ricalcolabile, nessun movimento per conto | **SI** |
| **G-13** | Dichiarazione 730 con importo calcolato | **CONFIRMED**, e **senza stato dichiarato dopo tre Wave**: il §22 lo dava a Wave 3, il §4.7 non lo nomina, il doc 31 lo dava a Wave 4 | **NO — V1.1**, dipende da G-09 e dalla validazione professionale |
| **G-19** | «Incassato conta le rate, non il denaro» | **ALREADY SOLVED sulle rate** (Wave 1) — ma vedi **D-2**: il difetto sopravvive fuori dal perimetro corretto | ricade in **D-2** |
| **G-23** | Trasmissione della fattura elettronica allo SdI | **CONFIRMED** — manca l'intermediario, non il codice | **NO — capability separata** (§39) |
| **G-39** | Fornitori e clienti con ciclo passivo | **CONFIRMED** — `suppliers` non esiste nemmeno come colonna, e due letture morte lo cercano | **PARZIALE**: la controparte si, il ciclo passivo no |
| **G-40** | Generazione massiva di ricevute | **CONFIRMED**, e senza stato dichiarato dopo tre Wave | **V1.1** |
| **G-41** | Saldo IVA trimestrale per cassa | **NEEDS PROFESSIONAL VALIDATION** — vedi §16 e §31 | **NO — POST-V1** |
| **G-45** | Libro soci nel senso statutario | **CONFIRMED** — nessuna numerazione assegnata, nessuna delibera, nessuna cessazione, nessuno storico | **SI, ridotto** (§19) |
| **G-46** | Quota associativa collegata alla contabilita | **CONFIRMED** — il codice `quota_associativa` esiste nel catalogo e **non ha un percorso di incasso**: un socio non ha una riga a cui una rata possa puntare | **SI** |
| **G-54** | Report economico esportabile | **CONFIRMED** — `src/lib/csv.ts` e gia il proprietario del tracciato | **SI** |
| **G-70** | Dimissione del socio con data e motivo | **CONFIRMED** | **SI**, dentro G-45 |
| **G-71** | Riconciliazione dei payout esposta | **NO ACTION** — confermata la scelta: il cruscotto del PSP la fa gia | **NO** |

### 7.2 — I temi del brief che non hanno un `G-xx`

| Tema | Stato verificato | Wave 4? |
|---|---|---|
| **Conti finanziari (cassa/banca)** | **PARTIAL** — `bank_accounts` e un blob JSON con saldo mutato a mano; `bank_account_id` esiste sul registro compensi e nessuno lo compila | **SI** |
| **Trasferimenti interni** | **ALREADY SOLVED** — modellati correttamente ed esclusi dai totali | **NO ACTION** |
| **Riconciliazione bancaria** | **CONFIRMED assente** — zero parser CAMT/MT940/CBI, zero matching bonifico/credito. Cio che si chiama «riconciliazione» oggi e la quadratura di un bando | **V1.1**, ridotta (§12) |
| **Anno fiscale sui movimenti** | **CONFIRMED assente** — esiste solo sul lavoro sportivo. `/movements` non ha **nessun** filtro data | **SI** |
| **Istituzionale vs commerciale** | **PARTIAL** — la colonna c'e e non raggiunge nessuna riga | **SI**, come dato |
| **IVA** | **PARTIAL come dato, assente come motore.** Imponibile e imposta **non esistono** su fatture e ricevute | **SI il dato, NO il motore** |
| **Quota associativa vs sportiva** | **CONFIRMED** — distinte in un catalogo, indistinguibili nei dati | **SI** |
| **Controparti** | **PARTIAL** — cinque campi denormalizzati copiati per valore, nessuna relazione | **SI**, leggera |
| **Sponsor: contratto, credito, incasso** | **CONFIRMED** — nessun contratto, nessun credito, nessun documento emettibile | **SI**, ridotto |
| **Storni uniformi** | **PARTIAL** — perfetti su tre domini, assenti su movimenti manuali e liquidazioni | **SI** |
| **Chiusura dei periodi** | **CONFIRMED assente** | **V1.1** (§26) |
| **Export commercialista** | **CONFIRMED assente** — `csv.ts` esiste come tracciato, nessun export contabile lo usa | **SI** |
| **730 / precompilata** | **CONFIRMED assente.** «Precompilata» non compare nel documento 30 ne nei documenti di Wave | **NO — V1.1 il 730, POST-V1 la trasmissione** |
| **Fattura elettronica** | **CONFIRMED**: tracciato generato e validato, **mai trasmesso**, e mai accettato dallo SdI | **NO** (§39) |

---

## 8 — Prima nota: la domanda mal posta, e la risposta

Il brief chiede: **«studia se `/movements` puo evolvere nella vera prima nota,
preferenza EXTEND MOVEMENTS anziche NEW ACCOUNTING MODULE»**.

La domanda presuppone che ci sia qualcosa da estendere. **Non c'e.** Non esiste
una tabella `movements`, non esiste una rotta, non esiste un modulo
proprietario. Esistono cinque colonne JSON su `clubs` e un aggregatore da 1.556
righe che gira nel browser.

Quindi la scelta reale non e «EXTEND o NEW». E questa:

| Opzione | Cosa significa | Verdetto |
|---|---|---|
| **A — estendere il JSON** | Aggiungere campi al payload di `clubs.transactions` | **Scartata.** Nessun indice, nessun vincolo, nessuna data interrogabile, read-modify-write dell'intero storico a ogni riga, scritture concorrenti che si perdono. Aggiungere una classificazione fiscale li significa metterla dove non e interrogabile |
| **B — una tabella nuova che copia tutto** | `accounting_movements` che materializza incassi, compensi, contributi | **Scartata.** E letteralmente la seconda contabilita che il committente vieta: due fonti per lo stesso numero, e nessun modo di tenerle allineate |
| **C — una tabella per cio che oggi e un blob, e una proiezione per il resto** | I movimenti **manuali** diventano righe di tabella; gli altri domini restano proprietari e si **proiettano**, in sola lettura | **Scelta.** E il modello che il lavoro sportivo usa gia oggi, con successo |

### La forma della scelta C

```
   PROPRIETARI (invariati)                    LA PRIMA NOTA
   ─────────────────────────                  ─────────────
   payment_transactions      ──proiezione──►
   sport_work_outbound_...   ──proiezione──►   una LETTURA sola,
   funding_settlements       ──proiezione──►   datata, classificata,
   invoices / receipts       ──proiezione──►   per conto e per anno
                                          ►
   accounting_entries        ──le sue righe──►
   (NUOVO: solo cio che oggi
    e clubs.transactions e
    clubs.transfers)
```

**Cosa e NEW**: una tabella sola, `accounting_entries`, che ospita **solo cio
che oggi vive nel JSON** — il movimento manuale e il giroconto. Non copia
niente da nessun altro dominio.

**Cosa e EXTEND**: `fiscal_operation_types` (i due flag mancanti), il
proiettore `club-financial-summary.ts` (che diventa server-side e sa di conti e
date), `csv.ts` (l'export), `payment_transactions` e
`sport_work_outbound_transactions` (il riferimento al conto).

**La risposta al §30 del brief — «why existing domain cannot own this»** per
l'unica entita nuova:

> `clubs.transactions` non e un dominio: e una colonna. Non ha un proprietario
> in `src/lib/server/`, non ha vincoli, non ha una data interrogabile, non ha
> un autore, e la sua scrittura non e atomica con quella del saldo che
> pretende di aggiornare. Nessun dominio esistente puo possedere un movimento
> di cassa che nessun altro evento ha generato — l'affitto della palestra
> pagato in contanti non e ne un incasso da famiglia, ne un compenso, ne un
> contributo. Quel movimento ha bisogno di una riga propria.

### Il modello canonico proposto, campo per campo

Il brief elenca 17 campi. Per ognuno, cosa esiste oggi e cosa si propone.

| Campo | Oggi | Proposta |
|---|---|---|
| data | tre campi opzionali (`date`, `dueDate`, `paidAt`), stringhe | **`entry_date DateTime NOT NULL`**, indicizzata |
| direzione | duplicata (`type` **e** `direction`), default `income` in lettura | **`direction`** con vincolo `IN` \| `OUT` \| `TRANSFER` |
| importo | `Float` in JSON | **`amount_cents Int NOT NULL`**, con `CHECK (amount_cents > 0)`: il segno lo dice la direzione |
| metodo di pagamento | duplicato (`paymentMethod` **e** `method`), testo libero | **`payment_method`**, testo, ma proposto da `payment_methods` |
| conto | `bankAccountId` verso un id dentro un altro blob | **`financial_account_id`** con **FK vera** (§10) |
| causale | `category`, testo libero, precompilato con la categoria sportiva | **`operation_type_code`** verso `fiscal_operation_types` (§9) |
| controparte | cinque campi copiati per valore | **`counterparty_kind` + `counterparty_id` + `counterparty_label`** (§20) |
| dominio di origine | `source`, due valori scritti | **`source_domain`**, enum chiuso |
| id di origine | **non esiste** | **`source_id`**, e l'unicita che rende una proiezione non duplicabile |
| documento | solo una *richiesta* mai letta | **`document_kind` + `document_id`**, verso `invoices`/`receipts` |
| note | scritte e **mai lette** | `notes`, e **mostrate** |
| stato di riconciliazione | **non esiste** | **`reconciliation_status`** (§12) |
| classificazione fiscale | **non esiste sul movimento** | **derivata** dalla causale, e **congelata** sulla riga: `activity_scope_snapshot` |
| stagione | c'e, iniettata automaticamente | resta |
| **anno fiscale** | **non esiste** | **`fiscal_year Int NOT NULL`**, derivato da `entry_date` (§14) |
| autore | **non esiste** | **`created_by`** |
| audit | «qualcuno ha modificato il club» | riga in `audit_logs` con l'id **del movimento** |

Due campi in piu che il brief non chiede e che la ricognizione impone:

- **`site_id`** facoltativo (§29);
- **`reversal_of_id`** e `reversed_at`, perche il denaro non si cancella (§24).

**Perche `activity_scope` va congelato e non solo referenziato**: la causale e
configurazione **mutabile** — `saveOperationType` riscrive `activity_scope` in
place. Se domani un club corregge la classificazione di una causale, tutti i
movimenti passati cambierebbero natura retroattivamente. E lo stesso motivo per
cui il lavoro sportivo congela contributi e aliquote sulla riga.

---

## 9 — Causali

E il **mattone**: il documento 30 dice che prima nota, rendiconto per causale,
estratto conto, saldo IVA e 730 poggiano tutti e cinque su questo.

### Cosa c'e gia

`fiscal_operation_types` (`prisma/schema.prisma:1435`): `code`, `label`,
`document_route` (4 valori), `activity_scope` (3 valori), `vat_rate`,
`vat_nature`, piu il catalogo di nove voci seminabili con
`quota_associativa`, `quota_iscrizione`, `quota_attivita`,
`vendita_abbigliamento`, `sponsorizzazione`, `contributo`.

E gia un modello **SYSTEM + CLUB CUSTOM**: le nove voci sono un seme, il club
puo aggiungerne. Il brief chiede esattamente questo, e c'e.

### Cosa manca

| Attributo chiesto dal brief | Stato |
|---|---|
| entrata/uscita | **manca** — `direction_hint` |
| categoria (bucket di rendiconto) | **manca** — `reporting_bucket` |
| fiscal relevance | c'e come `activity_scope` |
| institutional/commercial | c'e |
| VAT relevance | c'e (`vat_rate`, `vat_nature`) |
| cash/bank compatibility | **manca** — e discutibile che serva: vedi sotto |
| default description | **manca** — `default_description` |
| document requirements | c'e come `document_route` |
| reporting bucket | **manca** |
| **detraibile** | **manca** — `deductible`, il flag del 730 |
| **quota associativa** | **manca** — `is_membership_fee` |

**Su «cash/bank compatibility»**: una causale che vieta il contante e una
regola gestionale, non contabile, e le eccezioni sono la norma (l'affitto si
paga in contanti quando il proprietario lo chiede). **Non lo introduciamo**: si
registrerebbe un divieto che gli utenti aggirerebbero scegliendo una causale
sbagliata, cioe peggiorando il dato.

### La regola che il brief impone, e che il codice gia rispetta

> **NON hardcodare decine di causali nel codice.**

Il seme e gia dichiarativo, e il commento del modulo spiega perche **nessuna
voce nasce con un'aliquota**: *«Dire "la quota associativa e istituzionale"
sarebbe vero nella maggior parte dei casi e falso in abbastanza casi da
produrre danni. Un valore non dichiarato e visibilmente da compilare; un valore
sbagliato sembra compilato.»* Questa disciplina si conserva: i due flag nuovi
nascono `null`, non `false`.

### Il lavoro vero non e la colonna

E **collegare la causale a un dato reale**. Oggi `operation_type_code` e sempre
`null` sugli incassi (§5.2), e il campo `category` dei movimenti e testo libero.
La Wave deve:

1. accettare `operation_type_code` sull'incasso (una riga nello schema di
   validazione, oggi assente);
2. usarlo come causale del movimento proiettato;
3. renderlo **obbligatorio** sul movimento manuale, con un elenco, al posto del
   testo libero;
4. dare al club **la schermata** che oggi non ha: `/api/v1/fiscal/operation-types`
   funziona e nessun componente la chiama.

---

## 10 — Conti finanziari

Il brief dice: *«valuta un concetto FINANCIAL ACCOUNT, ma SOLO se non esiste
gia»*.

**Esiste a meta.** `clubs.bank_accounts` e un blob JSON con
`{id, name, iban, bank_name, status, current_balance}`, e
`sport_work_outbound_transactions.bank_account_id` e una colonna vera che
punta a quegli id **senza foreign key**.

### Il difetto che conta

`current_balance` **non e calcolato**: e mutato a mano dal browser a ogni
operazione, con una seconda chiamata HTTP non transazionale. Non esiste nessuna
funzione che lo ricostruisca dai movimenti. Quindi:

- un incasso registrato dalla scheda atleta o dal webhook Stripe **non tocca
  nessun saldo**;
- se la scrittura del movimento riesce e quella del saldo fallisce, restano
  disallineati per sempre;
- due utenti in contemporanea: l'ultimo vince, il saldo dell'altro e perso.

### La proposta

**Una tabella `financial_accounts`**, e il saldo **derivato**.

| Perche NEW e non EXTEND del JSON | |
|---|---|
| Serve una **FK** da `accounting_entries`, da `payment_transactions` e da `sport_work_outbound_transactions`. Un blob JSON non puo esserne il bersaglio | |
| Serve un `kind` con vincolo: `CASH` \| `BANK` \| `CLEARING` | |
| Serve che il saldo **non sia una colonna**: e la somma dei movimenti, come lo stato di una rata e la somma degli incassi. E la disciplina di ADR-0036 applicata al conto | |

Il `CLEARING` serve per Stripe: il denaro incassato online non e in banca il
giorno dell'incasso, e il payout arriva dopo, al netto delle commissioni. Senza
un conto di transito, o il saldo banca e sbagliato per giorni, o le commissioni
spariscono.

Migrazione: i conti esistenti nel JSON si travasano; `current_balance` diventa
**il saldo di apertura** con la sua data, che e l'unico modo onesto di
conservarlo — nessuno puo ricostruire i movimenti che lo hanno prodotto.

---

## 11 — Trasferimenti interni

**NO ACTION sul modello: e gia corretto.**

Il giroconto ha un tipo dedicato, direzione `"transfer"`, `collectedAmount`
forzato a zero con il commento che spiega perche, ed e **escluso dai totali**
di entrate e uscite. E l'unica parte del dominio movimenti fatta bene, e va
conservata parola per parola nel modello nuovo.

Cio che cambia e solo conseguenza del §10: le due gambe del giroconto puntano a
`financial_accounts` con una FK, e i due saldi si muovono perche i movimenti
esistono, non perche qualcuno li ha mutati a mano.

**Un vincolo nuovo, unico**: le due gambe devono essere **una transazione
sola**. Oggi sono due chiamate HTTP, e un giroconto a meta lascia denaro
sparito.

---

## 12 — Riconciliazione bancaria

Il brief dice: *«NON costruire open banking se non necessario»*. Concordo, e
riduco ancora.

### Cosa esiste oggi

Tre cose si chiamano «riconciliazione» e **nessuna e bancaria**:

1. la **quadratura di un bando**: una riga per atleta e periodo con la misura
   grezza accanto al requisito, anche in CSV. Confronta EasyGame con le attese
   dell'**ente**;
2. la **ripartizione di una liquidazione**: quali crediti chiude un bonifico;
3. l'**import CSV delle conferme di maturazione**, che non e un estratto conto.

```
grep -rniI "estratto conto|bank statement|cbi|mt940|camt" src/
  -> solo metafore nei commenti
```

### La proposta per la V1: riconciliare senza importare

L'import di un estratto conto vero e un lavoro grande e a **basso rendimento
iniziale**: i formati sono tre, le banche li interpretano diversamente, e il
matching automatico su causale libera sbaglia abbastanza da farsi disattivare.

**V1**: la riconciliazione e un **atto umano su un dato che il sistema gia
conosce**. Il movimento porta `reconciliation_status`
(`unreconciled` \| `reconciled` \| `disputed`), una data valuta facoltativa e un
riferimento (CRO, numero distinta). Chi ha l'estratto conto davanti spunta.

Il valore che questo produce subito, e che oggi manca:

- un bonifico dell'ente si registra come **incasso di una liquidazione** e
  chiude il credito voucher — cosa che gia funziona nel dominio bandi, ma **non
  arriva a nessun conto**;
- una quota pagata con bonifico si riconcilia con l'incasso corretto;
- «cosa non ho ancora visto arrivare in banca» diventa una domanda che ha
  risposta.

**V1.1**: import CSV con il tracciato che `csv.ts` gia possiede, e matching
**suggerito** — mai automatico — su importo e data, con conferma obbligatoria.
Le righe non appaiate restano elencate, come gia fa l'import delle conferme dei
bandi.

**POST-V1**: CAMT/MT940, open banking. Non prima che un club vero abbia chiesto
di riconciliare a mano per una stagione.

---

## 13 — Rendiconto: gestionale, non ufficiale

Il brief chiede di distinguere il **riepilogo gestionale** dal **documento
fiscale o ufficiale**, e di non chiamare «conforme» cio che non e stato
validato. La distinzione va scritta nel prodotto, non solo qui.

### Cosa EasyGame puo produrre da solo — classe A

Sono somme e raggruppamenti su dati che possiede, e nessuna di esse richiede
un'interpretazione:

- entrate e uscite di un periodo, **per cassa**, con la data del movimento;
- lo stesso, raggruppato per causale e per `reporting_bucket`;
- saldo per conto, iniziale e finale;
- crediti aperti (residuo delle rate, maturato non liquidato dei bandi);
- debiti aperti (maturato non pagato del lavoro sportivo);
- confronto fra due periodi o due stagioni.

### Cosa non e questo — e va detto sulla pagina

Un rendiconto per cassa gestionale **non e** il rendiconto che una ASD deposita
o conserva per obbligo, non e un bilancio, e non e un documento che qualcuno
abbia validato. Il §31 e il §32 dicono cosa richiede un professionista.

**Regola di prodotto**: nessuna intestazione, nessun titolo di export e nessuna
etichetta usa le parole «ufficiale», «conforme», «a norma» o «per il deposito».
Il titolo e **«Riepilogo gestionale»**, e la pagina lo dichiara in una riga.

E la stessa disciplina di ADR-0073 («il motore propone e spiega; cio che non e
validato non produce un numero definitivo») e di ADR-0092 (la classe redazionale
di un modello), applicata a un report.

---

## 14 — Anno fiscale e stagione

**Obbligatorio, e c'e gia un precedente da imitare invece che inventare.**

### Il precedente

Il lavoro sportivo distingue i due assi da tempo, e lo schema lo dichiara:
*«`season_id` esiste per l'operativita ma **non e la chiave del motore**:
metterli nello stesso perimetro azzererebbe i progressivi cambiando stagione,
cioe a giugno»*.

`fiscalYearOfPayment` e l'anno solare UTC della data di pagamento, e non ammette
date invalide. Due `fiscal_year` distinti convivono: quello della **scadenza
programmata** (una previsione) e quello del **pagamento** (il fatto).

### Cosa fa la Wave 4

Ogni movimento porta **entrambi**:

- `season_id`, come oggi, iniettato dalla stagione attiva;
- **`fiscal_year Int NOT NULL`**, derivato da `entry_date`, **mai digitato**.

Lo scenario del brief e il collaudo: stagione 2026/27, movimenti a settembre
2026 e gennaio 2027; il riepilogo fiscale 2026 prende **solo** i primi, il
riepilogo di stagione li prende entrambi. Sono due domande diverse, e il
prodotto deve rispondere a tutte e due senza che l'utente debba capire perche.

### La trappola da leggere prima di scrivere un filtro

`toYearFilter` (`src/lib/sport-work/model.ts:769`) esiste per un difetto vero,
trovato a runtime con duemila test verdi: **`Number(null)` non e `NaN`, e `0`**,
ed e un intero. Un filtro scritto come
`Number.isInteger(Number(filter.year)) ? { year } : {}` passa i test — che
passano `undefined` — e in produzione filtra `fiscal_year = 0`, cioe risponde
**elenco vuoto** a chiunque non chieda un anno esplicito. `searchParams.get()`
restituisce `null` quando il parametro manca.

Ogni filtro per anno della Wave 4 passa da quella funzione, o ne ripete la
logica con il suo test.

---

## 15 — Istituzionale e commerciale

Il brief e preciso: *«NON codificare regole fiscali finche non validate. Ma il
modello dati deve essere capace di rappresentare correttamente la
classificazione.»*

### Lo stato reale

La classificazione **esiste come colonna** (`activity_scope`, tre valori) e
**non tocca nessuna riga reale**, per la catena descritta al §5.2: sette voci
su nove nascono `unspecified`, `operation_type_code` e sempre `null`, e lo
scope non e copiato ne sull'incasso, ne sul documento, ne nello snapshot.

Solo due voci nascono classificate, ed entrambe con una motivazione scritta:
`vendita_abbigliamento` (*«cessione di beni: e attivita commerciale a
prescindere dal soggetto»*) e `sponsorizzazione`.

### Cosa fa la Wave 4

**Rende rappresentabile la classificazione, e non ne decide nessuna.**

1. `operation_type_code` diventa scrivibile sull'incasso e obbligatorio sul
   movimento manuale;
2. `activity_scope` viene **congelato** sulla riga del movimento al momento
   della registrazione (§8), perche la causale e configurazione mutabile;
3. il rendiconto puo raggruppare per scope, e quando lo fa **dichiara quante
   righe sono `unspecified`** invece di nasconderle in un totale;
4. **nessuna voce del seme cambia classificazione** in questa Wave. Le sette
   `unspecified` restano tali finche un professionista non le guarda (§31).

Il punto 3 e la parte che vale davvero: un club che vede «istituzionale
12.400 €, commerciale 3.100 €, **non classificato 22.700 €**» capisce che deve
configurare le causali. Un club che vede solo i primi due numeri crede di avere
un rendiconto.

---

## 16 — IVA: il dato prima del motore

Il brief chiede di separare **IVA DATA MODEL** da **IVA ENGINE**. La
ricognizione dice che oggi non c'e ne l'uno ne l'altro, e che l'unico posto con
aritmetica IVA ha un difetto latente.

### Il dato: cosa manca davvero

| Concetto | Stato |
|---|---|
| aliquota | c'e, dichiarata sulla causale |
| natura IVA | c'e, dichiarata sulla causale |
| regime | c'e, codificato (11 codici `RF*` su ~19; l'unico regime speciale modellato e la L. 398/1991, ed e **persistito e mai letto**) |
| **imponibile** | **non esiste** su `invoices` e `receipts`: c'e un solo `amount` |
| **imposta** | **non esiste** |
| data documento | c'e (`issue_date`) |
| data incasso | c'e (`payment_transactions.paid_at`) |
| anno fiscale | c'e sui documenti (`document_year`) |
| documento di origine | c'e |

**Quindi la Wave 4 aggiunge due colonne** — imponibile e imposta, in centesimi
— a `invoices` e `receipts`, e le porta nello snapshot. Nient'altro.

### Il difetto latente da chiudere insieme

Nel tracciato FatturaPA, `<ImportoTotaleDocumento>` e la somma delle righe piu
il bollo e **non comprende l'imposta**, mentre `<DatiRiepilogo>` espone
un'imposta calcolata. Con una riga al 22% il documento dichiarerebbe come
totale l'imponibile netto. Oggi non si manifesta **solo perche** l'unica
classificazione raggiungibile ha `vat_rate = null`, trattato come zero (§5.2).

Nel momento in cui la Wave 4 rende raggiungibile una causale con aliquota, il
difetto diventa attivo. **Va chiuso nella stessa Wave**, anche se la
trasmissione non esiste: un file sbagliato scaricato e dato al commercialista
e un danno reale.

E un difetto laterale della stessa famiglia: `resolveStampDuty` usa
`Boolean(vatRate)`, e `Boolean(0)` e falso — un'operazione dichiarata **ad
aliquota zero**, che il codice stesso definisce «una dichiarazione fiscale
precisa» diversa da `null`, verrebbe trattata come senza IVA.

### Il motore: NO

Saldo IVA per cassa, liquidazioni periodiche, detraibilita: sono **classe C**
(§31). Non entrano in Wave 4. Il dato modellato correttamente e la condizione
perche un giorno ci si possa arrivare; costruire il motore prima della
validazione produrrebbe numeri con l'aria di essere giusti.

---

## 17 — Fatture e ricevute

### I quattro concetti, e cosa esiste

| Concetto | Stato |
|---|---|
| **Documento gestionale** | `payments` — la rata. Non e un documento fiscale: nessun numero, nessun intestatario, nessuno snapshot |
| **Ricevuta** | `receipts`, completa: numero allocato, serie, anno, snapshot, annullamento, **idempotenza garantita dal database** (`transaction_id` unique) |
| **Fattura** | `invoices`, completa, ma l'idempotenza e **solo applicativa**: `transaction_id` non e unique, e due richieste simultanee possono produrre due fatture con due numeri |
| **Fattura elettronica** | `einvoice_transmissions`: tracciato `FPR12` generato e validato, **mai trasmesso e mai accettato dallo SdI** |

### Cosa fa la Wave 4

1. **Chiude il vincolo mancante**: `invoices.transaction_id` diventa unique
   parziale, come lo e per le ricevute. E una riga di migrazione, e toglie una
   possibilita di doppia numerazione su un documento fiscale;
2. **Collega il documento al movimento**: `document_kind` + `document_id`
   sulla riga di prima nota;
3. **Aggiunge imponibile e imposta** (§16);
4. **Chiama `assertDocumentMutable`**, che esiste e non ha chiamanti, sul
   percorso del CRUD generico — dove oggi si puo digitare un `invoice_number`;
5. **Fa vedere `describeDocumentDecision`**, che esiste e non ha chiamanti: e
   la spiegazione che l'operatore dovrebbe leggere **prima** di premere il
   pulsante, non l'errore che riceve dopo.

I punti 4 e 5 sono l'esempio piu chiaro di cio che questa Wave e: **non
scrivere codice nuovo, ma collegare quello giusto che e gia scritto.**

### Cosa NON fa

La trasmissione allo SdI. Vedi §39.

---

## 18 — Quota associativa e quota sportiva

**EasyGame oggi non le distingue nei dati.** Ha i nomi delle due cose in un
catalogo (`quota_associativa` e `quota_attivita` sono due codici distinti, con
la mappa `member -> quota_associativa`), e un solo percorso reale che classifica
tutto come `quota_attivita`.

Il motivo strutturale e piu profondo di un flag mancante: **non esiste un
percorso di incasso per un socio.** Le rate stanno su `payments.athlete_id`, gli
incassi su `payment_transactions.athlete_id`. Un socio e un oggetto dentro
`clubs.members`: non ha una riga a cui una rata possa puntare.

### La proposta minima

Non un secondo sistema di rate. **Rendere il socio un soggetto pagabile**, che
e la stessa cosa che il §20 chiede per fornitori e sponsor:

- `payments` e `payment_transactions` accettano una **controparte generica**
  accanto ad `athlete_id`, senza toglierlo (nessuna migrazione distruttiva);
- la quota associativa e un incasso con `operation_type_code =
  quota_associativa` verso una controparte di tipo `member`;
- il flag `is_membership_fee` sulla causale rende la domanda «quanto abbiamo
  incassato di quote associative quest'anno» una query, non una stima.

E il prerequisito reale del libro soci (§19) e del 730 (che deve escludere le
quote associative dagli importi detraibili).

---

## 19 — Libro soci

Il brief e esplicito: **NON creare nuova anagrafica soci. EXTEND.** Concordo, e
il perimetro va ridotto rispetto a cio che «libro soci» evoca.

### Cosa c'e

Un socio ha: nome, contatti, codice fiscale, nascita, indirizzo, tipo (elenco
chiuso di tre), stato binario attivo/non attivo, `membershipDate`, scadenza
tessera, e un `membershipNumber` che e **un campo di testo libero digitato a
mano**.

Vive in `clubs.members`, e la creazione **riscrive l'intera colonna dal
browser** leggendo l'array, appendendo e salvando: due segreterie in
contemporanea, la seconda cancella la prima.

### Cosa manca, e cosa la Wave 4 fa

| Chiesto | Stato | Wave 4 |
|---|---|---|
| data di ammissione | c'e, con **due nomi** per lo stesso fatto | unificata |
| **delibera** | **non esiste** | **si**: estremi e data, testo |
| **numero progressivo** | testo libero digitato | **assegnato**, con `document_number_sequences` — che gia sa allocare per club e per esercizio e non e digitabile |
| stato | binario | **stato con storia**: ammesso, attivo, dimesso, decaduto |
| **cessazione** | **non esiste** | **si**: data, motivo, estremi della delibera |
| **storico** | **non esiste**: l'oggetto e mutabile | **append-only**, come i consensi della Wave 3 |
| quota associativa | **non esiste** | §18 |
| export/stampa | c'e (PDF e CSV) | resta, e prende i campi nuovi |

**La scelta strutturale**: gli eventi del socio — ammissione, dimissione,
decadenza — diventano un **registro append-only**, e lo **stato si deriva**,
come per i consensi e per le rate. Non e una preferenza estetica: e cio che
distingue un libro da un elenco, ed e l'unica forma che regge alla domanda «chi
era socio il 12 marzo 2026».

L'anagrafica del socio **non si tocca**: resta dov'e. Cio che nasce e il
registro degli eventi accanto.

**Cosa NON facciamo**: la scorciatoia di Golee «tutti i tesserati sono soci»,
gia respinta nel documento 30 e confermata respinta qui. Sono due qualita
diverse della stessa persona, e confonderle produce un libro soci che nessuno
puo usare.

---

## 20 — Controparti

Il brief chiede se serva un modello canonico, e avverte: **non duplicare Person
Core**.

### La situazione

Oggi una controparte e **cinque campi denormalizzati copiati per valore** nel
payload del movimento: `originEntityType`, `originEntityId`, `originEntityName`,
`subjectName`, `subjectEmail`, `subjectPhone`. Senza FK. Se l'atleta cambia
nome, il movimento conserva quello vecchio. E il form base di `/movements` non
li scrive affatto: un movimento creato li **non ha controparte**.

Gli sponsor e i soci sono oggetti JSON. I fornitori **non esistono**: `suppliers`
non e ne una colonna ne una risorsa, e due delle 22 letture della pagina lo
cercano invano.

### La proposta: leggera, non canonica

**Non** una tabella `counterparties` che duplichi atleti, allenatori, soci e
sponsor. Una **coppia polimorfa** sul movimento:

```
counterparty_kind   ATHLETE | MEMBER | SPORT_WORK_PERSON | SPONSOR | SUPPLIER | ENTITY | OTHER
counterparty_id     l'id nel dominio proprietario, quando esiste
counterparty_label  il nome AL MOMENTO del movimento, congelato
```

L'etichetta congelata non e una duplicazione sciatta: e la stessa scelta dello
snapshot di un documento fiscale. Il movimento deve poter dire a chi si
riferiva anche se quella scheda e stata cancellata.

**I fornitori** sono l'unico caso in cui serve qualcosa di nuovo, ed e minimo:
un fornitore e uno sponsor con `type: "fornitore"` — la distinzione **esiste
gia** nel dominio sponsor, che ha esattamente quei due valori. Non serve una
tabella nuova: serve smettere di leggere due colonne che non esistono.

**Il ciclo passivo (G-39)** — ordini, ddt, scadenzario fornitori — resta
**POST-V1**. Non e contabilita: e un modulo acquisti.

---

## 21 — Sponsor

Il brief chiede di collegare `SPONSOR -> CONTRATTO -> DOCUMENTO -> CREDITO ->
INCASSO -> MOVEMENT`, e di **non creare un sponsor accounting separato**.

La catena oggi si ferma al primo passo: c'e l'anagrafica, non c'e il contratto,
non c'e il credito, e **non si puo emettere una fattura a uno sponsor** perche
l'intestatario di un documento e sempre risolto dall'atleta.

### La proposta, ridotta a cio che serve

| Anello | Wave 4 |
|---|---|
| Sponsor | **resta dov'e**, con un codice fiscale accanto alla P.IVA |
| **Contratto** | **si, minimo**: importo, periodo, note. Non un modulo contratti: tre campi che rendono il credito calcolabile |
| Documento | **si**: `resolveFiscalRecipient` impara una seconda forma, la controparte non-atleta. E la stessa estensione che serve al socio (§18) |
| **Credito** | **derivato**: importo del contratto meno incassato. Non una colonna |
| Incasso | **passa da `payment_transactions`**, come tutti gli altri, con la controparte del §20. Oggi passa da un JSON |
| Movimento | proiezione, come tutti |

Il guadagno: la sponsorizzazione e **l'unica entrata dichiaratamente
commerciale** del catalogo, e l'unica che richiede una fattura. Oggi e l'unica
che non puo averne una.

---

## 22 — Voucher e contributi: solo coerenza

**Il dominio non si riscrive.** E il piu maturo del prodotto: cinque importi
distinti, regole del bando come configurazione, incasso parziale gestito con la
ripartizione obbligatoria, separazione dai pagamenti delle famiglie verificata
in entrambe le direzioni.

La Wave 4 fa **tre cose sole**:

1. **la liquidazione arriva alla prima nota**: oggi un bonifico dell'ente e
   invisibile nel saldo, perche `funding_settlements` non e fra le sorgenti di
   `/movements`;
2. **la liquidazione porta un conto**: oggi non ha nessun riferimento bancario
   (nessun `bank_account_id`, nessuna FK);
3. **la liquidazione si puo stornare**: oggi non esiste alcun rimedio a una
   liquidazione registrata per errore, e l'errore **propaga** — l'accrual
   diventa `settled`, non si riscrive piu, non si conferma piu, e l'iscrizione
   non si cancella piu.

Il punto 3 e un difetto vero, della stessa famiglia di D-3, e va corretto qui
perche il dominio non ha un'altra Wave in vista.

**Cio che non tocchiamo**: il calcolo del maturato, la ripartizione, la
riconciliazione del bando, la regola che vieta la compensazione automatica fra
contributo e rata della famiglia — *«farebbe risultare saldate rate che nessuno
ha pagato»*.

**Un difetto minore da registrare, non da correggere qui**: un ricalcolo su un
programma fuori validita e un **no-op silenzioso** — l'API risponde 200 con
zero periodi senza dire perche.

---

## 23 — Lavoro sportivo: solo integrazione

**Non si riscrive niente.** Le regole previdenziali e fiscali restano nel loro
proprietario, versionate per anno con la loro fonte, e **la contabilita non le
ricalcola**: legge i valori congelati sulla riga.

Il collegamento con la prima nota **esiste gia** ed e fatto bene: `/movements`
chiama l'endpoint del dominio con i permessi del dominio — non la CRUD generica,
per non aggirare l'unica ragione per cui quel dominio ha permessi propri — e la
proiezione e marcata `canEdit: false, canDelete: false`.

La Wave 4 fa due cose:

1. **compila `bank_account_id`**, che esiste, che il servizio scrive, e che
   nessuna superficie popola. Le tre funzioni dell'agenda (premi, rimborsi,
   fatture P.IVA) non lo accettano nemmeno nella firma;
2. **decide cosa fare del versamento F24**. Oggi un adempimento assolto
   aggiorna solo il proprio stato: il denaro dei contributi esce dal club
   **senza lasciare una riga di registro**. I tipi `CONTRIBUTION_PAYMENT` e
   `EXTERNAL_PAYROLL_COST` sono dichiarati e **nessun codice li produce**.

Il punto 2 non e cosmetico: senza, il costo del lavoro sportivo in prima nota e
sistematicamente **inferiore al vero** della parte contributiva.

---

## 24 — Storni

La regola di EasyGame e **NO DELETE DEL DENARO**, e vale gia in tre domini su
cinque:

| Dominio | Storno | Come |
|---|---|---|
| Incassi famiglia | **si** | riga opposta con `reverses_transaction_id`; l'originale resta marcato |
| Lavoro sportivo | **si** | riga `COMPENSATION_REVERSAL` con importi negati; tre vincoli di database la difendono |
| Rimborsi | **si**, e distinti dallo storno: contano nei totali, e reggono il parziale |
| **Voucher** | **NO** | nessun `update`, nessun `delete`, nessuna rotta: l'errore resta e propaga |
| **Movimenti manuali** | **NO** | `confirm()` del browser e rimozione fisica dall'array |

### Cosa uniforma la Wave 4

Una regola sola, applicata ovunque:

> Una riga che rappresenta denaro **non si cancella**. Si storna con una riga
> opposta che cita l'originale, l'originale resta e porta il motivo, e i totali
> escludono entrambe.

Con i tre vincoli di database che il lavoro sportivo ha gia dimostrato
sufficienti: **uno storno non si storna**, **niente doppio storno** (indice
unico parziale su `reversal_of_id`), **coerenza fra segno e tipo**.

Non e un refactoring dei domini esistenti: e la forma che `accounting_entries`
nasce avendo, piu la sua estensione a `funding_settlements`.

---

## 25 — Audit

Il brief chiede che ogni movimento finanziario sappia dire **chi, quando,
perche, origine, modifica, storno**.

### Dove funziona

Il lavoro sportivo e il modello: venti azioni dedicate, la traccia scritta **nel
servizio e non nella rotta** (chiamare la funzione da altrove lascia comunque il
segno), e una riga che vale piu di tutte —
`sport_work.payment.without_current_self_declaration`, *«la prova di chi ha
deciso di erogare sapendo che il calcolo poteva essere incompleto, e quando»*.

Gli incassi hanno `payment.transaction.recorded` e `.reversed`, con `created_by`
sulla riga.

### Dove non funziona

| Buco | Conseguenza |
|---|---|
| Un movimento manuale non ha **autore** | la riga non sa chi l'ha scritta |
| L'audit registra `resource.updated` su `clubs` con l'id **del club** | non si sa **quale** movimento |
| Un incasso **online** ha `created_by: null` e il webhook **non scrive nessun audit** | l'incasso piu automatico e il meno tracciato |
| Un rimborso ha `created_by: null` per costruzione | idem |
| `backfillProviderFees` riscrive `net_amount_cents` **senza audit e senza attore** | un numero di rendiconto cambia dopo il fatto, e non c'e traccia |
| Il dominio voucher scrive l'audit **nella rotta** | chiamare il servizio da altrove non lascia traccia |

La Wave 4 chiude i primi due (sono conseguenza diretta della tabella nuova) e il
quarto e il quinto. Il terzo — l'attore di un incasso online — e per costruzione
«nessuno»: la correzione onesta e registrare **il provider come attore**, non
lasciare `null`.

---

## 26 — Chiusura dei periodi

Il brief chiede di classificare: V1 / V1.1 / POST-V1.

**Verdetto: V1.1.**

Il motivo non e la difficolta — un `accounting_periods` con
`(organization_id, year, month, locked_at, locked_by)` e una guardia in
scrittura e piccolo. Il motivo e che **bloccare un periodo prima che i movimenti
siano affidabili blocca i dati sbagliati**.

L'ordine giusto e: prima la riga di prima nota esiste, ha un autore, un conto e
una data che nessuno puo cambiare; poi si chiude il mese. Chiudere prima
significa consacrare un saldo che oggi e mutato a mano dal browser.

**Cosa la Wave 4 fa comunque**, perche la chiusura sia possibile dopo senza
migrazioni dolorose: `entry_date` e `fiscal_year` sono **NOT NULL** dal primo
giorno, e nessun percorso puo modificarli dopo la creazione.

---

## 27 — Export per il commercialista

Il committente lo dichiara molto importante, e concordo — **con la sua stessa
motivazione**: *«meglio un export chiaro e completo che fingere di sostituire il
software del commercialista»*.

### Cio che esiste e non va rifatto

`src/lib/csv.ts` e gia il **proprietario del tracciato**: separatore `;` (che
Excel italiano apre senza chiedere), CRLF, BOM, quoting su `;`, `"`, `\n` **e
`\r`**. Esiste proprio perche il CSV era gia stato scritto due volte, con due
comportamenti diversi, e la terza copia avrebbe reso il difetto strutturale.

**L'export contabile estende quello. Non ne scrive un quarto.**

### Le colonne, come chieste

| Colonna | Fonte |
|---|---|
| data | `entry_date` |
| causale | codice + etichetta della causale |
| descrizione | `description` |
| entrata | importo se `direction = IN` |
| uscita | importo se `direction = OUT` |
| conto | nome del conto finanziario |
| metodo | `payment_method` |
| controparte | `counterparty_label` congelata |
| documento | numero del documento collegato |
| classificazione | `activity_scope` **congelato** sulla riga |
| IVA | imponibile e imposta, quando ci sono |
| origine | `source_domain` — «da dove viene questo numero» |
| protocollo | numero del documento, quando esiste |

Piu due che il brief non chiede e che un commercialista chiede sempre:
**`fiscal_year`** e **stato di riconciliazione**.

**XLSX**: non in V1. Il CSV con `;` e BOM si apre in Excel con un doppio clic;
un writer XLSX e una dipendenza nuova per un guadagno estetico.

---

## 28 — Dashboard economica

Il brief impone: *«nessun numero duplicato. Ogni card deve dichiarare
implicitamente il proprio owner.»*

La ricognizione dice che **oggi i numeri duplicati ci sono, e sono documentati**:
«denaro incassato» e calcolato in due moduli con due perimetri diversi e due
etichette diverse («Entrate» su `/movements`, «Pagato» su `/reports`), senza che
nessuna delle due pagine dichiari il rapporto fra i due numeri. E «pendente» e
calcolato due volte con due logiche: una guarda la scadenza, l'altra no.

C'e anche un difetto isolato: il filtro **Periodo** di `/reports` non tocca il
report pagamenti — le dipendenze del `useMemo` non includono il periodo.
Selezionare «Ultimi 30 giorni» cambia allenamenti, presenze e gare e lascia i
quattro numeri finanziari sull'intero storico, senza dirlo.

### La regola per la Wave 4

Ogni riquadro dichiara **il suo proprietario e la sua grandezza**, e nessuna
schermata calcola un numero che un'altra gia calcola.

| Riquadro | Proprietario | Grandezza |
|---|---|---|
| Saldo cassa / banca | `financial_accounts`, derivato | **finanziaria** |
| Entrate / uscite del mese | prima nota, per cassa | **finanziaria** |
| Crediti verso famiglie | ledger delle rate | **economica** |
| Insoluti (scaduti) | ledger delle rate + data | economica |
| Voucher da ricevere | dominio bandi, `pendingSettlement` | economica |
| Compensi da pagare | dominio lavoro sportivo, `accruedUnpaid` | economica |
| Debiti verso fornitori | **non esiste, e non lo inventiamo** | — |

E la separazione visiva **e** la separazione dei numeri: cassa da una parte,
crediti e debiti dall'altra, mai nella stessa riga di totali.

---

## 29 — Multi-sede

Il brief dice: *«NON obbligare la sede su ogni movimento»*. Il prodotto ha gia
la regola giusta, ed e ADR-0038: *«il club mono-sede non paga niente»* —
con zero o una sede configurata nessuna interfaccia mostra un filtro sede — e
*«un elemento senza sede appartiene a tutte le sedi, non a nessuna»*.

Il movimento eredita esattamente questo: `site_id` **facoltativo**, filtro
mostrato solo ai club multi-sede, e nessun movimento storico scompare da un
elenco perche non ha una sede.

L'attribuzione a struttura o evento: **no**. Sarebbe un terzo asse di
aggregazione per un caso d'uso che nessuno ha chiesto.

---

## 30 — Permessi

### La matrice attuale, verificata

Sette ruoli canonici: `owner`, `club_manager`, `collaborator`, `staff`,
`trainer`, `parent`, `athlete`. **Non esiste un ruolo tesoriere.**

E c'e una contraddizione, della stessa famiglia di quella che la Wave 3 ha
chiuso su `/modulistica`:

- `/movements` **non** e riservata a proprietario e gestore: passano anche
  staff e collaboratore;
- il CRUD generico su `transactions` e `transfers` **e aperto** a staff e
  collaboratore;
- ma la pagina non usa quelle rotte: legge via `clubs`, che **e** admin-only, e
  `getClubData` **inghiotte il 403 restituendo un array vuoto**.

Risultato osservabile: un collaboratore apre `/movements`, la pagina si carica
senza errori e **mostra tutto a zero**. Ogni salvataggio fallisce con un
messaggio generico. Due porte sulla stessa cosa che rispondono diversamente, e
la terza — l'API generica — che risponde 200 e permette di cancellare (D-1).

### La matrice proposta

| Azione | owner | club_manager | collaborator | staff | trainer |
|---|:-:|:-:|:-:|:-:|:-:|
| Vedere la prima nota | ✅ | ✅ | ✅ | ✅ | — |
| Creare un movimento | ✅ | ✅ | ✅ | ✅ | — |
| **Stornare** | ✅ | ✅ | — | — | — |
| Riconciliare | ✅ | ✅ | ✅ | ✅ | — |
| Vedere i conti e i saldi | ✅ | ✅ | — | — | — |
| Vedere i compensi | ✅ | ✅ | — | — | — |
| Vedere gli sponsor | ✅ | ✅ | ✅ | ✅ | — |
| **Export contabile** | ✅ | ✅ | — | — | — |
| **Modificare le causali** | ✅ | ✅ | — | — | — |
| **Chiudere un periodo** | ✅ | ✅ | — | — | — |

Tre principi, tutti gia usati altrove nel prodotto:

1. **registrare non e stornare.** Chi tiene la cassa registra; chi corregge un
   errore di denaro e la direzione. E la stessa separazione fra
   `sport_work.manage` e `sport_work.pay`;
2. **la matrice della pagina e quella della rotta sono la stessa.** Il difetto
   trovato al §30 e W3-14 daccapo: le tre porte devono rispondere allo stesso
   modo, e la pagina deve **dire** perche nega, non mostrare zeri;
3. **nessun permesso ad hoc dentro una pagina.** I permessi contabili stanno in
   un modulo solo, come `src/lib/documents/permissions.ts` e
   `src/lib/sport-work/permissions.ts`.

**Un ruolo tesoriere?** Non in V1. Il prodotto ha gia quattro ruoli gestionali e
nessuna evidenza che un club li usi tutti; aggiungerne un quinto prima che
qualcuno lo chieda e la strada che ha prodotto le trentaquattro automazioni di
Golee. La separazione «registra / storna» ottiene lo stesso risultato senza un
ruolo nuovo.

---

## 31 — Matrice di validazione professionale

Il brief impone di classificare ogni regola in quattro classi, e di **non
trasformare B, C e D in codice definitivo** durante il planning. La ricognizione
normativa (§32) ha prodotto ventitre voci. Ecco la sintesi, con la sola cosa che
al piano serve: **cosa possiamo scrivere e cosa no.**

| Classe | Significato | Quante | Cosa ne fa la Wave 4 |
|---|---|:-:|---|
| **A** | Contabilita deterministica: aritmetica su dati che possediamo | 3 | **Si implementa** |
| **B** | Interpretazione contabile: serve il giudizio di un commercialista | 5 | **Si rappresenta come dato**, mai come deduzione |
| **C** | Regola fiscale o di legge: serve la fonte **e** la validazione | 10 | **Si modella il dato, non la regola** |
| **D** | Adempimento esterno: serve un provider, un intermediario, una trasmissione | 5 | **Fuori Wave** |

### Classe A — cio che la Wave 4 implementa senza chiedere permesso a nessuno

| Regola | Perche e A |
|---|---|
| Somma di entrate e uscite in un periodo, per cassa | E aritmetica su movimenti datati |
| Saldo di un conto = somma dei suoi movimenti | Idem. E gia la disciplina di ADR-0036 applicata al conto |
| Raggruppamento per causale, per conto, per anno, per stagione | E un `GROUP BY` |
| Confronto fra due periodi | Idem |
| Export in CSV di righe che il sistema possiede | Nessuno standard esiste (vedi sotto): e una decisione di prodotto |

### Classe B — cio che la Wave 4 **rappresenta** senza deciderlo

| Regola | Come si rappresenta |
|---|---|
| Se un'entrata e istituzionale o commerciale | Un campo sulla causale, con `null` come stato iniziale onesto, e una traccia di **chi** l'ha classificata e **quando** |
| Lo schema del rendiconto per una ASD non-ETS | Attributo dell'ente, non del prodotto: ASD, SSD-capitali e ASD-ETS producono documenti strutturalmente diversi |
| La natura contabile di un contributo da bando | **Dato del bando**, come gia impone ADR-0037. Non esiste una risposta unica: dipende dal singolo avviso |
| Il libro soci per una ASD non-ETS | Obbligo **statutario** o elemento probatorio, non obbligo di legge autonomo |
| L'ambito soggettivo dell'immodificabilita | Zona grigia dichiarata: vedi §32 |

### Classe C — cio di cui la Wave 4 modella il **dato**, mai la regola

Le dieci voci normative — soglia e coefficiente del regime forfetario, condizioni
della decommercializzazione, esenzione IVA delle prestazioni sportive, obbligo
di fattura elettronica, termini di conservazione, soglia di tracciabilita dei
contanti, franchigie del lavoro sportivo, ritenuta sui contributi, termine di
annotazione del prospetto, immodificabilita delle scritture — **non diventano
codice in questa Wave**.

Cio che diventa codice e la **capacita di rappresentarne il risultato**: un
campo che dice quale regime ha l'ente e da quando, un campo che dice quale
natura ha un'entrata e chi gliel'ha attribuita, un campo che dice se una riga e
tracciabile.

**Con una sola eccezione, gia validata**: le franchigie del lavoro sportivo sono
gia implementate, versionate per anno, con la fonte accanto a ogni valore. La
contabilita **le legge**, non le riscrive.

### Classe D — fuori Wave

Trasmissione allo SdI, conservazione a norma dei documenti informatici,
comunicazione del Modello EAS, scissione dei pagamenti (dipende da un elenco
esterno di enti pubblici), comunicazione trimestrale al Registro nazionale.
Richiedono un intermediario o un canale, e nessuno di essi e una riga di codice.

### La regola che discende dalla matrice

> Su ventitre voci, **dieci sono C e cinque sono D**. Il grosso di questa Wave
> **non e aritmetica: e rappresentazione di decisioni prese da altri.** Il
> prodotto che ne esce non deve sembrare piu sicuro di quanto e.

---

## 32 — Normativa: cosa e verificato e cosa no

Il brief autorizza la ricerca esterna e impone di separare **norma verificata**,
**interpretazione professionale** e **decisione di prodotto**. La ricognizione
ha rispettato la separazione, e ha prodotto tre risultati che cambiano il piano.

### 32.1 — La prima nota non e un obbligo di legge. E qualcosa di piu scomodo

Non esiste una norma che imponga a una ASD un documento chiamato «prima nota».

Ma esiste una **prassi dell'Amministrazione finanziaria** che ci somiglia molto.
La Circolare 18/E del 1° agosto 2018, § 6.4, affrontando il caso delle quote
incassate in contanti e versate cumulativamente in conto corrente sopra la
soglia di tracciabilita, dice che l'ente

> «dovra dotarsi di un registro dove annotare analiticamente le entrate e le
> uscite, indicando i nominativi dei soggetti, la causale e l'importo incassato
> o pagato»

piu una quietanza per ogni singola quota.

**Questo e il modello dati della Wave 4, scritto da qualcun altro nel 2018.**
Nominativo, causale, importo, verso, data, mezzo di pagamento. E il §8 di questo
piano lo ricalca senza saperlo.

E aggiunge un vincolo che il brief non aveva chiesto e che va accolto: **il
movimento di cassa e il movimento bancario sono due eventi distinti e
collegati**, non lo stesso evento. Un incasso in contanti dal socio e il
successivo versamento cumulativo in banca sono due righe. Se il modello li
collassa, la ricostruzione che la circolare chiede diventa impossibile — ed e
esattamente cio che oggi accade, perche l'incasso non tocca nessun conto e il
versamento non esiste.

**Per l'ente in regime forfetario esiste inoltre un registro che e obbligo di
legge**: il prospetto approvato con D.M. 11 febbraio 1997, con annotazione dei
corrispettivi entro il giorno **15** del mese successivo. Su questo termine le
fonti normative e le fonti professionali divergono — alcune dicono 16 — e la
divergenza **resta aperta**: e la domanda 4 dell'elenco al §32.4.

### 32.2 — Ogni riferimento normativo che scriviamo scade il 31 dicembre 2026

Il riordino in testi unici cambia, dal 1° gennaio 2027, la numerazione di quasi
tutti gli articoli rilevanti: il TUIR e trasfuso in un nuovo decreto (l'art. 148
diventa l'art. 157), il decreto IVA in un altro, e gli articoli 20, 20-bis e 22
del D.P.R. 600/1973 sono **abrogati** e trasfusi altrove.

Conseguenza operativa diretta, e non e teorica: **una stringa di riferimento
normativo scritta come costante nel codice o mostrata in interfaccia ha una data
di scadenza nota.** Un `source` versionato per anno lo assorbe senza dramma; una
costante no.

E la seconda ragione, dopo quella del §14, per cui il pattern del lavoro
sportivo — un file per anno, `source` obbligatorio, `status` di validazione —
e la forma giusta anche qui.

### 32.3 — Una fonte ufficiale scartata, e perche va detto

La guida alle ASD ospitata sul dominio dell'Agenzia delle Entrate e
un'**edizione regionale del 2015**: cita il registro CONI, l'art. 90 della
L. 289/2002 e l'art. 20-bis del D.P.R. 600/1973 — norme abrogate dalla riforma
dello sport. E il primo risultato di ricerca su dominio istituzionale, ed e
superata.

Lo scriviamo qui perche chiunque rifaccia questa ricognizione ci inciampera, e
perche e la dimostrazione pratica del principio del §31: **una fonte
istituzionale non e automaticamente una fonte vigente.**

### 32.4 — Le diciassette domande da porre prima di scrivere codice fiscale

La ricognizione le ha prodotte tutte. Le tre che decidono qualcosa di questa
Wave:

1. **L'immodificabilita dell'art. 2219 del codice civile si estende al prospetto
   del regime forfetario e al rendiconto di una ASD, o riguarda solo le
   scritture contabili obbligatorie in senso proprio?** Determina se il blocco
   di periodo (§26) e un requisito o una comodita. Oggi non lo sappiamo, e per
   questo e V1.1 e non V1.
2. **Il registro analitico della Circolare 18/E § 6.4 va tenuto sempre, o solo
   quando ricorre il caso dei versamenti cumulativi sopra soglia?** Determina se
   la prima nota e una funzione o un presidio.
3. **Per ciascuna entrata tipica — quota associativa, quota corso, quota gara,
   sponsorizzazione, pubblicita, merchandising, affitto impianto, contributo
   comunale — qual e la classificazione, e quali dati devono essere presenti
   perche sia difendibile in verifica?** Determina il seme delle causali.

Le altre quattordici stanno nella ricognizione e vanno portate al
commercialista **prima** che la lane E cominci, non dopo.

Una in particolare non e tecnica ed e la piu importante di tutte:

> **Quale parte di questo lavoro volete continuare a fare voi?** Ci sono
> classificazioni che preferite restino una vostra decisione registrata nel
> sistema, invece che un automatismo?

### 32.5 — Cio che la norma dice sulla qualifica della controparte, e che il modello deve reggere

La decommercializzazione di un'entrata dipende, fra le altre condizioni, dal
fatto che la prestazione sia resa **a un socio, a un tesserato o a un tesserato
di altra affiliata**. E una condizione **datata**: un ex socio che paga a
settembre per un corso di ottobre non e la stessa cosa di un socio.

Quindi il modello deve conservare **la qualifica della controparte al momento
dell'operazione**, non il suo stato corrente. E la stessa ragione per cui il
§19 trasforma il socio in un registro di eventi invece che in un flag, e per cui
il §20 congela l'etichetta della controparte sul movimento.

Se il modello conserva solo lo stato corrente, la classificazione non e piu
ricostruibile a posteriori — ed e esattamente cio che un verificatore chiede.

### 32.6 — Le fonti, con il loro grado

Consultate il 2026-08-29. La colonna **grado** dice cosa e stato letto in
originale e cosa no: e la differenza fra una regola che si puo citare e una che
va riverificata prima di scriverla da qualche parte.

| Tema | Fonte | Grado |
|---|---|---|
| Obbligo di rendiconto economico-finanziario | D.Lgs. 36/2021, art. 7 c. 1 lett. f) — **non prescrive uno schema** | letta in originale |
| Rendiconto separato delle raccolte pubbliche di fondi | D.Lgs. 141/2026, art. 27 c. 2 (sostituisce l'art. 20 D.P.R. 600/1973 dal 2027-01-01) | letto in originale |
| Bilancio degli ETS, rendiconto per cassa sotto soglia | D.Lgs. 117/2017 art. 13 + D.M. Lavoro 5 marzo 2020 (modelli obbligatori) | letta in estratto |
| Bilancio civilistico delle SSD di capitali | Circolare 18/E/2018, nota 41 | letta in originale |
| Registro nazionale: **nessun obbligo generale di deposito** | Regolamento del Registro nazionale — le parole «bilancio» e «rendiconto» **non compaiono** | letto integralmente |
| Deposito per la personalita giuridica | D.Lgs. 39/2021, art. 14 | letta in originale |
| Regime forfetario: soglia 400.000 € | L. 398/1991, art. 1 | letta in originale |
| Coefficiente 3%, detrazione forfetaria, versamento trimestrale | L. 398/1991, art. 2 | letta in originale |
| Prospetto e annotazione entro il **giorno 15** | D.M. 11 febbraio 1997, richiamato da D.Lgs. 141/2026 art. 27 c. 3 lett. a) | letto in originale |
| **Discrepanza sul giorno 15 / 16** | fonti professionali indicano il 16 richiamando il D.P.R. 544/1999 | **non risolta** |
| Decommercializzazione: i due presupposti + le clausole statutarie | art. 148 c. 3 e c. 8 TUIR; art. 4 c. 4 decreto IVA | lette in originale |
| Esclusioni tassative (pubblicita commerciale, beni nuovi, somministrazione…) | art. 148 c. 4 TUIR | letto in originale |
| **SSD con divieto di lucro attenuato: non basta** | Circolare 7/E del 7 agosto 2026, § 1 | letta integralmente |
| «Valutazione caso per caso» dei presupposti | Circolare 18/E/2018, § 7.4 | letta in originale |
| Modello EAS | art. 30 D.L. 185/2008 + scheda AdE | letta in estratto |
| Esenzione IVA delle prestazioni sportive | art. 36-bis D.L. 75/2023 conv. L. 112/2023; direttiva 2006/112/CE art. 132 § 1 lett. m) | letta in originale |
| Dispensa dagli obblighi di fatturazione e registrazione | Circolare 7/E/2026, § 5 (art. 36-bis decreto IVA) | letta integralmente |
| Cessione del contratto di un atleta: **imponibile** | Circolare 7/E/2026, § 6 | letta integralmente |
| Scissione dei pagamenti: continuita dopo il 30 giugno 2026 | comunicato MEF | letto in estratto |
| **IVA per cassa** | — | **non verificata: domanda per il commercialista** |
| Fattura elettronica: obbligo esteso a tutti dal 2024-01-01 | D.L. 36/2022 art. 18 cc. 2-3, conv. L. 79/2022 | letto in originale |
| **Dove l'obbligo generale sia trasfuso nel nuovo T.U. IVA** | D.Lgs. 10/2026 | **non identificato: da accertare** |
| Specifiche del tracciato, canale dell'intermediario | provvedimenti AdE, specifiche v. 1.9 e v. 1.9.1 (dal 15 maggio 2026) | lette in estratto |
| Libro soci: **non e fra le clausole statutarie obbligatorie** | D.Lgs. 36/2021 art. 7 c. 1, lettere a)–h) lette per intero | letto in originale |
| Libro degli associati per gli ETS | D.Lgs. 117/2017 art. 15 | riferimento noto, **non riverificato** |
| Il libro soci come indizio, non come obbligo | Circolare 18/E/2018, § 7.4 | letta in originale |
| Franchigie 15.000 / 5.000, soglia IRAP 85.000, rimborsi volontari 400 €/mese | D.Lgs. 36/2021 artt. 29, 35, 36, 37 | **gia implementate e versionate** in `src/lib/sport-work/rules/` |
| La franchigia opera anche sul lavoro sportivo **subordinato** | Circolare 7/E/2026, § 3 | letta integralmente |
| I rimborsi ai volontari **concorrono** alla soglia dei 15.000 | Circolare 7/E/2026, § 2 | letta integralmente |
| Ritenuta 4% sui contributi **a imprese** | art. 28 c. 2 D.P.R. 600/1973 | letto in estratto |
| Contributi: due nature contabili dallo stesso erogatore | FAQ ufficiali di Sport e Salute sulla rendicontazione | lette in estratto |
| **Natura fiscale generale dei contributi da enti** | — | **nessuna fonte unica: dipende dal bando** |
| Conservazione oltre i 10 anni civilistici, fino alla definizione degli accertamenti | D.Lgs. 141/2026 art. 29 cc. 2-3 | letto in originale |
| **Registri elettronici regolari senza stampa, se aggiornati e stampabili su richiesta in sede di accesso** | D.Lgs. 141/2026 art. 29 c. 6 | letto in originale |
| Conservazione a norma dei documenti informatici | D.M. MEF 17 giugno 2014; Linee guida AgID | **lette solo su fonti professionali** |
| **Prima nota: nessun obbligo di legge** | — | cercato, **non trovato** |
| Registro analitico entrate/uscite con nominativo, causale, importo | Circolare 18/E/2018, § 6.4 | letta in originale |
| Tracciabilita dei movimenti ≥ 1.000 € | art. 25 c. 5 L. 133/1999 | letto in originale |
| Immodificabilita delle scritture | art. 2219 c.c., richiamato da D.Lgs. 141/2026 art. 29 c. 1 | letto in originale |
| **Se l'immodificabilita si estenda al prospetto 398 e al rendiconto** | — | **zona grigia dichiarata** |
| **Formato standard di esportazione per il commercialista** | — | **cercato, non esiste** |

Tre note di metodo che restano attaccate a questa tabella:

1. **Cinque voci non hanno una fonte**, e sono segnate come tali. Nessuna di
   esse diventa codice in questa Wave;
2. una guida alle ASD **ospitata sul dominio dell'Agenzia** e stata scartata
   perche e un'edizione regionale del 2015 che cita norme abrogate (§32.3). Una
   fonte istituzionale non e automaticamente una fonte vigente;
3. **la Circolare 7/E e del 7 agosto 2026**: ventidue giorni fa. La materia si
   muove, e questo e il motivo per cui il §32.2 chiede riferimenti versionati e
   non costanti.

---

## 33 — Audit anti-duplicazione

Il brief impone: per ogni entita nuova, scrivere **perche nessun dominio
esistente puo possederla**. Se la risposta non e forte, **EXTEND**.

| Entita proposta | NEW o EXTEND | Perche |
|---|---|---|
| **`accounting_entries`** | **NEW** | Un movimento di cassa che nessun altro evento ha generato — l'affitto della palestra pagato in contanti — non e ne un incasso da famiglia, ne un compenso, ne un contributo. Oggi vive in una **colonna JSON senza proprietario, senza vincoli e senza data interrogabile**. Nessun dominio esistente puo possederlo, e il posto dove sta oggi non e un dominio |
| **`financial_accounts`** | **NEW** | Serve come **bersaglio di una foreign key** da tre tabelle diverse. Un blob JSON non puo esserlo. E il saldo deve smettere di essere una colonna mutata a mano |
| **`membership_events`** | **NEW** | Il libro soci e un **registro append-only**; l'anagrafica del socio e un oggetto mutabile. Sono due cose diverse, e la seconda esiste gia e non va toccata |
| Causale con i flag fiscali | **EXTEND** | `fiscal_operation_types` esiste, con aliquota, natura IVA, ambito e rotta documentale. Mancano due colonne |
| Conto sull'incasso | **EXTEND** | `payment_transactions` esiste ed e il proprietario degli incassi |
| Conto sull'uscita | **EXTEND** | `bank_account_id` **esiste gia** su `sport_work_outbound_transactions` e nessuno lo compila |
| Conto sulla liquidazione | **EXTEND** | `funding_settlements` esiste |
| Imponibile e imposta | **EXTEND** | `invoices` e `receipts` esistono |
| Controparte generica | **EXTEND** | Tre colonne su `payments` e `payment_transactions`, accanto ad `athlete_id` che resta |
| Contratto sponsor | **EXTEND** | Tre campi nel dominio sponsor che gia esiste |
| Export contabile | **EXTEND** | `src/lib/csv.ts` e gia il **proprietario del tracciato**, nato proprio perche il CSV era stato scritto due volte |
| Proiettore della prima nota | **EXTEND** | `club-financial-summary.ts` esiste e fa gia questo lavoro. Va spostato sul server e insegnato a conti e date, non riscritto |
| Permessi contabili | **NEW modulo, zero ruoli nuovi** | Come `src/lib/documents/permissions.ts`: compone i ruoli che esistono |
| Regole contabili annuali | **EXTEND del pattern** | `src/lib/sport-work/rules/` e la forma. Non un meccanismo nuovo |

**Tre tabelle nuove, un modulo nuovo, dieci estensioni.** Ed e il rapporto
giusto per una Wave che ha come primo comandamento «non voglio una seconda
contabilita».

### Cosa NON nasce, e perche

| Tentazione | Verdetto |
|---|---|
| Una tabella `movements` che materializza incassi, compensi e contributi | **No.** E la seconda contabilita. I proprietari restano, e si proiettano |
| Un piano dei conti | **No.** Una ASD non tiene la partita doppia, e nessuna norma gliela chiede. Le causali con un `reporting_bucket` fanno il lavoro |
| Una tabella `counterparties` | **No.** Duplicherebbe atleti, soci, persone del lavoro sportivo e sponsor |
| Un ruolo `treasurer` | **No.** La separazione «registra / storna» ottiene lo stesso senza un quinto ruolo gestionale |
| Un motore IVA | **No.** Classe C. Si modella il dato |
| Un secondo sistema di rate per i soci | **No.** Il socio diventa una controparte pagabile del sistema che esiste |

---

## 34 — I workstream e il DAG

Otto lane di lavoro, piu una barriera e una lane zero che le precede.
La struttura proposta dal brief e stata **modificata** in quattro punti, per una
ragione sola: la ricognizione ha spostato le dipendenze.

### Le lane

| Lane | Cosa fa | File proprietari |
|---|---|---|
| **BARRIERA** | Schema, migrazione, matrice dei permessi, invarianti, contratto della proiezione | `prisma/schema.prisma`, la migrazione, `src/lib/accounting/permissions.ts`, `src/lib/accounting/model.ts` |
| **W4-0 — I tre difetti** | D-1 (cascade), D-2 (`collectedAmountFor`), D-3 (storno del movimento) | `resources.ts`, `access-roles.ts`, `club-financial-summary.ts` |
| **W4-A — Causali e conti** | `fiscal_operation_types` + i due flag; `financial_accounts` con saldo derivato; la schermata che oggi non esiste | `src/lib/fiscal/operation-types.ts`, `src/lib/server/fiscal-config.ts`, `src/lib/server/financial-accounts.ts` |
| **W4-B — Prima nota** | `accounting_entries`; il proiettore spostato sul server; storni; la pagina | `src/lib/server/accounting.ts`, `src/lib/accounting/**`, `src/app/movements/**` |
| **W4-C — Gli agganci dei domini** | Conto e causale su incassi, compensi, liquidazioni; storno della liquidazione; il versamento F24 | `payment-transactions.ts`, `sport-work-ledger.ts`, `funding.ts` |
| **W4-D — Rendiconto e dashboard** | Riepilogo gestionale, saldi, crediti e debiti, confronto fra periodi | `src/lib/accounting/reporting.ts`, `src/app/reports/**` |
| **W4-E — Fiscalita rappresentata** | Imponibile e imposta sui documenti; `activity_scope` congelato; il difetto del totale FatturaPA; `assertDocumentMutable` e `describeDocumentDecision` collegate | `src/lib/fiscal/**`, `src/lib/server/fiscal-documents.ts` |
| **W4-F — Libro soci** | `membership_events`, numerazione, delibera, cessazione, stato derivato | `src/lib/server/members.ts`, `src/app/soci/**` |
| **W4-G — Export** | L'export contabile sopra `csv.ts` | `src/lib/accounting/export.ts` |
| **W4-H — Sponsor e controparti** | Contratto, credito derivato, intestatario non-atleta, controparte generica | `src/lib/server/sponsors.ts`, `fiscal-recipient.ts` |

### Il DAG

```
                    ┌─────────────┐
                    │  W4-0       │  i tre difetti — PRIMA di tutto
                    │  blocker    │  (non dipende da niente, blocca tutto)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  BARRIERA   │  schema + migrazione + permessi + invarianti
                    │             │  UN COMMIT, poi si apre il parallelismo
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     ┌────▼────┐     ┌─────▼────┐     ┌─────▼────┐
     │  W4-A   │     │  W4-F    │     │  W4-H    │
     │ causali │     │ soci     │     │ sponsor  │
     │ + conti │     │          │     │ + contro │
     └────┬────┘     └─────┬────┘     └─────┬────┘
          │                │                │
     ┌────▼────┐           │                │
     │  W4-B   │◄──────────┴────────────────┘
     │ prima   │
     │ nota    │
     └────┬────┘
          │
     ┌────▼────┐     ┌──────────┐
     │  W4-C   │     │  W4-E    │  (indipendente: parte con la BARRIERA)
     │ agganci │     │ fiscale  │
     └────┬────┘     └─────┬────┘
          │                │
          └───────┬────────┘
                  │
            ┌─────▼─────┐
            │   W4-D    │  rendiconto e dashboard
            └─────┬─────┘
                  │
            ┌─────▼─────┐
            │   W4-G    │  export
            └───────────┘
```

### Cosa e cambiato rispetto alla proposta del brief, e perche

| Proposta | Modifica | Ragione |
|---|---|---|
| `W4-A Accounting Movement Core` per primo | **W4-A diventa causali e conti**; la prima nota e W4-B | La causale e il conto sono **prerequisiti** del movimento: un movimento senza causale obbligatoria nasce gia sbagliato |
| `W4-C Reconciliation` come lane | **Assorbita in W4-B** come tre campi | La riconciliazione V1 e uno stato sulla riga, non un dominio (§12) |
| Nessuna lane per i difetti | **Aggiunta W4-0, e blocca tutto** | Costruire una prima nota sopra un `DELETE` a cascata e sopra un numero che mescola due grandezze significa costruire su un pavimento che cede |
| `W4-F Libro Soci` a valle | **Portata in parallelo con W4-A** | Non dipende dalla contabilita: dipende dalla barriera. E il suo prerequisito — il socio come controparte pagabile — e in W4-H |

### La barriera, e cosa contiene

Prima di aprire le lane, **un commit solo** che chiude:

1. lo **schema** delle tre tabelle nuove e delle colonne aggiunte;
2. la **migrazione**, con i vincoli: `CHECK` sul segno, indice unico parziale
   sullo storno, FK verso i conti, `entry_date` e `fiscal_year` NOT NULL;
3. la **matrice dei permessi** in un modulo solo, con la regola «registra ≠
   storna»;
4. il **contratto della proiezione**: cosa una riga proiettata puo dire, e che
   e sempre `canEdit: false`;
5. l'**ownership dei file**, per lane;
6. gli **invarianti** del movimento, scritti come test prima del codice.

Poi si apre il parallelismo. E la stessa disciplina della Wave 3, e li ha
funzionato.

---

## 35 — Cosa non copiamo da Golee

| Cosa | Perche no |
|---|---|
| **La doppia contabilita** | Una ASD non tiene la partita doppia e nessuna norma gliela chiede. Un piano dei conti e un gergo che il segretario non parla, per un vantaggio che non ha |
| **Numeri derivati mantenuti a mano** | E il difetto che EasyGame ha gia sui saldi dei conti, e che questa Wave chiude. Un saldo e la somma dei suoi movimenti, non una colonna |
| **Stati economici modificabili a mano** | ADR-0036 ha tolto il campo che impostava lo stato di una rata. La stessa disciplina vale per il resto: uno stato si deriva |
| **Logiche fiscali hardcoded senza versione** | La ricognizione ha dimostrato che ogni riferimento normativo scade il 31 dicembre 2026. Una regola senza fonte e senza anno e un difetto a scoppio ritardato |
| **Decine di causali rigide** | Il seme e di nove voci, il club aggiunge le sue, e nessuna nasce con un'aliquota che nessuno ha dichiarato |
| **Report che confondono dovuto e incassato** | E il difetto D-2, e sta gia dentro EasyGame. Copiarlo sarebbe copiare due volte |
| **Funzioni commerciali spacciate per contabilita** | Il rendiconto e «gestionale», e la pagina lo dice. Nessuna etichetta usa «ufficiale», «conforme» o «a norma» |
| **La chat con i commercialisti dentro il gestionale** | Gia respinta: e un modello di ricavo, non una funzione, e **crea responsabilita su consigli fiscali** |
| **La fatturazione elettronica come add-on a pagamento** | L'intermediario e una decisione contrattuale, non un servizio da rivendere |
| **Il vendor lock-in sull'export** | Nessuno standard di interscambio esiste (§32). Proprio per questo l'export deve essere **leggibile da chiunque**: CSV, colonne dichiarate, nessun formato proprietario |
| **Il saldo IVA trimestrale per cassa** | Golee ce l'ha, ed e la cosa che dimostra che ha capito il caso d'uso. **Ma e classe C**, e senza validazione produrrebbe un numero con l'aria di essere giusto |

---

## 36 — Pre-production challenge

Ogni gap classificato. Il criterio: **blocca l'uso del prodotto da parte di una
societa vera, oppure no.**

### BLOCKER — impediscono di lavorarci, o distruggono dati

| # | Cosa |
|---|---|
| **D-1** | `DELETE` a cascata sulle rate: perdita irreversibile del registro incassi, da un ruolo che non puo registrarne uno |
| **D-2** | «Entrate» somma cassa e dovuto: il numero di testa del prodotto non e affidabile |
| **G-10 minimo** | Una riga di prima nota con data, conto, causale e autore. Senza, non c'e contabilita |
| **Conti con saldo derivato** | Senza, «quanto c'e in cassa» resta una cifra mutata a mano da un browser |
| **Permessi allineati** | La pagina che mostra zeri invece di dire «non puoi» e W3-14 daccapo |

### IMPORTANT — il prodotto funziona, ma il commercialista chiede

| # | Cosa |
|---|---|
| **D-3** | Lo storno del movimento manuale al posto della cancellazione |
| **G-09** | I due flag sulla causale, e la schermata per configurarla |
| **Anno fiscale** | Senza, «il 2026» non e una domanda che si puo fare |
| **G-54 / export** | E la cosa che il committente ha dichiarato piu importante, e ha ragione: e cio che rende il gestionale utile a chi non lo usa |
| **G-11 minimo** | Entrate e uscite per causale, in un periodo |
| **Voucher e compensi in prima nota** | Senza, il saldo e sistematicamente sbagliato in difetto |

### V1.1

Chiusura dei periodi · import CSV bancario con matching suggerito · G-40
(ricevute massive) · G-13 (730, dopo la validazione dei flag) · imponibile e
imposta esposti nei report · confronto fra stagioni.

### POST-V1

G-41 (saldo IVA) · G-23 (trasmissione SdI) · G-39 (ciclo passivo fornitori) ·
G-71 (riconciliazione payout) · open banking · conservazione a norma.

### Cosa **non** e pre-produzione, e va detto

Il documento 30 lo dichiara gia, e questa Wave lo conferma: *«la prima nota e il
saldo IVA… sono tutte cose che rendono EasyGame competitivo; **nessuna impedisce
a una societa di lavorarci**»*.

Resta vero **con un'eccezione che la ricognizione ha prodotto**: D-1 e D-2 non
sono gap competitivi, sono difetti. Il primo perde dati, il secondo mostra un
numero che sembra cassa e non lo e. Quelli si, impediscono di lavorarci in
sicurezza.

---

## 37 — Gli scenari di collaudo, decisi prima del codice

Come nelle Wave 1, 2 e 3: gli scenari si scrivono **adesso**, e il collaudo gira
contro un'applicazione vera con un database vero. Chi implementa non li puo
riscrivere per farli passare.

### Incassi

1. Rata da 600 €. Incasso 200 in contanti → residuo 400, rata parziale, saldo
   cassa +200, **una riga di prima nota**.
2. Incasso 400 con bonifico → rata saldata, saldo banca +400, seconda riga.
3. **Storno dei 200**: rata torna parziale, residuo 200, saldo cassa torna a
   zero, la riga originale **resta visibile** con il motivo, e la riga di storno
   e accanto.
4. Il riepilogo dice: incassato 400, credito residuo 200. **Due numeri, due
   riquadri, mai sommati.**
5. Un incasso senza causale **si rifiuta**, dicendo perche.

### Cassa e banca

6. Movimento in contanti → saldo cassa cambia, saldo banca no.
7. Bonifico → il contrario.
8. **Giroconto 500 € cassa → banca**: due saldi si muovono in senso opposto,
   entrate e uscite **non cambiano di un centesimo**.
9. Il giroconto e **una transazione sola**: se la seconda gamba fallisce, non
   resta la prima.
10. Il saldo di un conto e **ricalcolabile**: cancellando la cache e
    ricaricando, e lo stesso numero.
11. Lo scenario della circolare: dieci quote in contanti, poi **un versamento
    cumulativo** in banca. Sono **undici righe**, non dieci, e il versamento e
    collegato alle quote che copre.

### Voucher

12. Maturazione di un periodo → credito verso l'ente, **nessun movimento di
    cassa**.
13. Bonifico dell'ente che copre due periodi su tre → una riga di prima nota
    sul conto banca, il terzo periodo resta fra i crediti.
14. Residuo corretto, e **non sommato** agli incassi delle famiglie.
15. **Storno di una liquidazione registrata per errore**: il credito torna
    aperto, l'accrual torna `reported`.

### Lavoro sportivo

16. Compenso erogato → riga di prima nota in uscita, sul conto scelto, con
    **il costo del club** e non solo il netto.
17. Storno → riga opposta, e la prima nota **esclude entrambe**.
18. Il rendiconto mostra il costo del lavoro sportivo **senza ricalcolare
    nessun contributo**: i numeri sono identici a quelli del registro.
19. Il versamento F24 dei contributi **compare** fra le uscite.

### Sponsor

20. Contratto da 3.000 €, incasso di 1.000 → credito 2.000, riga di prima nota
    da 1.000.
21. Fattura emessa allo sponsor: **l'intestatario e lo sponsor**, non un atleta.
22. Saldo del contratto dopo il secondo incasso.

### Anno fiscale

23. Stagione 2026/27 con movimenti a settembre 2026 e gennaio 2027.
24. Riepilogo **fiscale 2026**: prende solo i primi.
25. Riepilogo **di stagione**: li prende entrambi.
26. Il filtro senza anno **non risponde elenco vuoto** — e la trappola
    `Number(null) === 0` del §14, e ha un test dedicato.

### Concorrenza

27. **Doppio incasso** simultaneo sulla stessa rata: due righe, nessuna persa,
    saldo corretto.
28. **Doppio storno** simultaneo: uno solo riesce, il secondo dice perche.
29. **Doppia riconciliazione**: idem.
30. **Due movimenti simultanei sullo stesso conto**: entrambi presenti, saldo
    corretto. E il difetto che oggi il read-modify-write dal browser non regge.

### Multi-tenant

31. Movimento di un altro club: **404 o «Accesso negato»**, mai i dati.
32. Conto di un altro club come bersaglio: rifiutato.
33. Causale di un altro club: rifiutata.
34. Documento di un altro club: rifiutato.
35. L'export **non contiene una riga** di un altro club.

### Permessi

36. Cinque ruoli veri contro la matrice del §30, **azione per azione**.
37. Un collaboratore che apre la prima nota **vede i movimenti**, non zeri.
38. Un collaboratore che tenta uno storno riceve un **403 con il motivo**, non
    un errore generico.
39. Un allenatore non vede la prima nota, e la voce di menu **non c'e**.
40. **`DELETE /api/v1/simplified_payments/:id` da un collaboratore: rifiutato.**
    E il collaudo di D-1, e va scritto **prima** della correzione.

### Export

41. Mille movimenti esportati: tutte le colonne del §27, nessuna riga persa.
42. Un importo con la virgola decimale e una nota con un ritorno a capo
    **non spezzano** una riga — e il motivo per cui `csv.ts` esiste.
43. Il file si apre in Excel italiano **senza chiedere niente**.

### Classificazione

44. Un rendiconto con causali non classificate **dichiara quante righe sono
    `unspecified`** invece di nasconderle nel totale.
45. Cambiare la classificazione di una causale **non cambia** i movimenti
    passati.

---

## 38 — Prestazioni

### Il dataset

200 atleti · 2 stagioni · 3 conti (cassa, banca, transito) · 1.000+ movimenti ·
un bando con maturazioni e liquidazioni · 10 sponsor · 15 rapporti di lavoro
sportivo con compensi · 2.000 incassi.

### Le soglie

| Misura | Soglia |
|---|---|
| Prima nota, prima pagina | < 800 ms |
| Prima nota, filtro per conto e anno | < 500 ms |
| Dashboard economica | < 1 s |
| Riepilogo gestionale di un anno | < 2 s |
| Export di 1.000 movimenti | < 5 s |
| Saldo di un conto | < 200 ms |

### Cosa cercare, perche sappiamo gia dov'e

La ricognizione ha misurato il punto di partenza, e non e buono:

- **~17 round trip HTTP** per disegnare `/movements`, di cui 14 sono `GET` sulla
  **stessa singola riga** `clubs` — una per colonna. Ognuna riporta comunque
  `settings`, la colonna piu grande;
- **due letture morte** (`suppliers`, `supplier_payments`) che tornano sempre
  vuote;
- **nessuna paginazione**: la pagina rende tutte le righe, e scarica l'intera
  tabella `invoices` e `receipts` a ogni apertura;
- **tre passaggi completi** in JavaScript sulle stesse righe (normalizzazione
  con due deduplicazioni a chiavi diverse, somma, report), piu un `sort` con
  `localeCompare` su date ISO;
- **costo di inserimento lineare nello storico**: aggiungere il movimento numero
  5.000 riscrive 5.000 righe e un blob JSON.

Il collaudo misura **prima e dopo**, e la Wave dichiara il guadagno o il suo
assenza. Una prima nota che nasce con una tabella e un indice su
`(organization_id, entry_date)` dovrebbe far sparire quasi tutto questo — ma va
misurato, non affermato.

---

## 39 — Cosa la Wave 4 non fa

| Cosa | Perche |
|---|---|
| **Trasmissione allo SdI** | Classe D: serve un intermediario accreditato, un canale e un conservatore. E una **capability separata con una decisione contrattuale a monte**, non una lane. Il tracciato esiste gia e non e mai stato accettato dallo SdI: prima va collaudato |
| **Motore IVA** (liquidazioni, saldo per cassa, detraibilita) | Classe C. Si modella il dato, non la regola |
| **Dichiarazione 730 calcolata** | V1.1. Dipende dal flag `deductible` e da una validazione professionale |
| **Ciclo passivo fornitori** | Non e contabilita: e un modulo acquisti. POST-V1 |
| **Open banking, CAMT, MT940** | Non prima che un club abbia riconciliato a mano per una stagione |
| **Piano dei conti / partita doppia** | Nessuna norma lo chiede a una ASD |
| **Chiusura dei periodi** | V1.1, e per una ragione precisa: bloccare un periodo prima che i movimenti siano affidabili blocca i dati sbagliati (§26) |
| **Un ruolo tesoriere** | Nessuno l'ha chiesto. La separazione «registra / storna» ottiene lo stesso |
| **XLSX** | Il CSV con `;` e BOM si apre in Excel con un doppio clic |
| **Riscrivere voucher o lavoro sportivo** | Sono i due domini migliori del prodotto. Si collegano, non si toccano |

---

## Riferimenti

- Ownership dei domini: [`CLAUDE.md`](../../CLAUDE.md) §2
- ADR-0036 (rata e incasso), ADR-0037 (contributo non e pagamento), ADR-0038
  (sedi), ADR-0044 (numerazione), ADR-0047 (ricevuta e fattura), ADR-0052
  (profilo fiscale e tipi di operazione), ADR-0053 (tracciato non trasmesso),
  ADR-0068 (le entrate sono cassa), ADR-0072 (regole versionate per anno),
  ADR-0073 (il motore propone e spiega), ADR-0074 (registro delle uscite),
  ADR-0077 (permessi propri) — [18 — Decision log](18-decision-log.md)
- Gap: [30 — Golee/EasyGame gap audit](30-golee-easygame-gap-audit.md), §4.5,
  §4.6, §4.7 (**non il §3**, che non e aggiornato)
- Il precedente dell'anno versionato: `src/lib/sport-work/rules/`
- Il proprietario del tracciato CSV: `src/lib/csv.ts`
