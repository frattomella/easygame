# Contabilita — proprieta dei file e contratto della proiezione

> Questo documento fa parte della **barriera** della Wave 4. E stato scritto
> prima che le lane si aprissero, e vale per tutte.

---

## 1. Il principio, e la sua conseguenza operativa

> Un movimento di prima nota **non e mai la fonte** di un numero che un altro
> dominio possiede. E la sua **proiezione datata e classificata**. Se i due
> divergono, ha ragione il dominio.

Conseguenza diretta: **`accounting_entries` non contiene incassi, compensi,
contributi o pagamenti sponsor.** Contiene solo cio che prima viveva nelle
colonne JSON `clubs.transactions` e `clubs.transfers` — il movimento di cassa
registrato a mano e il giroconto — piu i loro storni.

Un vincolo di database e un invariante applicativo lo difendono entrambi:
`WRITABLE_SOURCE_DOMAINS` ammette `MANUAL`, `INTERNAL_TRANSFER` e `REVERSAL`, e
nient'altro.

---

## 2. Chi possiede cosa

| Grandezza | Proprietario canonico | Chi puo solo leggere |
|---|---|---|
| Quanto e **dovuto** da una famiglia | `payments.amount` | tutti |
| Quanto e stato **incassato** da una famiglia | somma delle righe valide di `payment_transactions` — `src/lib/payments/installment-ledger.ts` | tutti |
| Lo **stato** di una rata | non e un dato: `resolveLedgerState` | tutti |
| Quanto e **maturato** verso una persona | `sport_work_compensation_installments.accrued_amount` | tutti |
| Quanto le e stato **pagato** | `sport_work_outbound_transactions` — `src/lib/server/sport-work-ledger.ts` | tutti |
| Contributi, franchigie, costo del club | congelati sulla riga di registro | **nessuno li ricalcola** |
| Quanto e **maturato** da un bando | `funding_accruals.accrued_amount` | tutti |
| Quanto l'ente ha **versato** | somma di `funding_settlement_lines.amount` | tutti |
| Numero di un documento fiscale | `document_number_sequences` via `allocateDocumentNumber` | **nessuno lo digita** |
| Cio che un documento diceva quel giorno | `invoices.snapshot` / `receipts.snapshot` | tutti |
| **Il fatto finanziario manuale** | `accounting_entries` — `src/lib/server/accounting.ts` | tutti |
| **Il saldo di un conto** | **nessuno**: e derivato, `deriveAccountBalanceCents` | — |
| **La classificazione di una causale** | `fiscal_operation_types` — `src/lib/server/fiscal-config.ts` | tutti |
| **Lo stato di un socio** | **nessuno**: e derivato da `membership_events` | — |

Le prime dieci righe erano **gia vere** prima della Wave 4. La Wave ne aggiunge
quattro, e non ne riscrive nessuna.

---

## 3. Proprieta dei file, per lane

Un file ha **una** lane. Se una lane ha bisogno di toccarne uno che non le
appartiene, la modifica passa da chi lo possiede — o aspetta.

| Lane | File propri |
|---|---|
| **BARRIERA** (chiusa) | `prisma/schema.prisma`, `prisma/migrations/20260829130000_wave4_accounting/`, `src/lib/accounting/model.ts`, `src/lib/accounting/permissions.ts`, questo documento |
| **W4-A** — causali e conti | `src/lib/server/financial-accounts.ts`, `src/lib/server/fiscal-config.ts`, `src/lib/fiscal/operation-types.ts`, `src/app/api/v1/accounting/accounts/**`, `src/app/api/v1/fiscal/operation-types/**` |
| **W4-B** — prima nota | `src/lib/server/accounting.ts`, `src/lib/accounting/projection.ts`, `src/app/api/v1/accounting/entries/**`, `src/app/movements/**` |
| **W4-C** — agganci dei domini | `src/lib/server/payment-transactions.ts`, `src/lib/server/sport-work-ledger.ts`, `src/lib/server/sport-work-agenda.ts`, `src/lib/server/funding.ts` |
| **W4-D** — rendiconto | `src/lib/accounting/reporting.ts`, `src/app/reports/**` |
| **W4-E** — fiscalita | `src/lib/fiscal/**`, `src/lib/server/fiscal-documents.ts`, `src/lib/fiscal/fatturapa.ts` |
| **W4-F** — libro soci | `src/lib/server/members.ts`, `src/lib/members/**`, `src/app/soci/**` |
| **W4-G** — export | `src/lib/accounting/export.ts` (sopra `src/lib/csv.ts`, che **non si riscrive**) |
| **W4-H** — sponsor e controparti | `src/lib/server/sponsors.ts`, `src/lib/fiscal/fiscal-recipient.ts` |

**File condivisi, e la regola per toccarli**: `src/lib/accounting/model.ts` e
`permissions.ts` appartengono alla barriera. Aggiungere un valore a un catalogo
chiuso e ammesso; cambiarne la semantica no, perche altre lane l'hanno gia data
per acquisita.

---

## 4. Il contratto della proiezione

Ogni riga che **non** nasce in `accounting_entries` e una proiezione, e passa da
`asProjectedLine` prima di essere mostrata.

Una riga proiettata:

- porta `sourceDomain` diverso da `MANUAL` / `INTERNAL_TRANSFER` / `REVERSAL`;
- porta `sourceId`, cioe l'id nella tabella del dominio proprietario;
- e **sempre** `canEdit: false`, `canDelete: false`, `canReverse: false`;
- non e mai `canReconcile: true`, perche la riconciliazione vive su una riga
  propria.

**Perche `canReverse: false` anche per chi ha il permesso di stornare.** Uno
storno che partisse dalla prima nota scriverebbe nel dominio proprietario
aggirando i suoi permessi e i suoi invarianti: un compenso si storna dove i
compensi si erogano, e li c'e `sport_work.pay`. Il permesso `accounting.reverse`
governa lo storno delle righe **proprie**.

---

## 5. Idempotenza

Ogni integrazione dominio → prima nota e idempotente: **lo stesso evento
sorgente, una sola rappresentazione finanziaria.**

Dove la rappresentazione e una riga in tabella, la difesa e un indice unico
parziale su `(organization_id, source_domain, source_event_key)`, e non un
controllo applicativo: due richieste simultanee superano qualunque «leggi, poi
scrivi».

Dove la rappresentazione e una proiezione, l'idempotenza e strutturale — non c'e
niente da scrivere, quindi non c'e niente da duplicare. **E la ragione principale
per cui la proiezione e stata preferita alla materializzazione.**

---

## 6. Cosa non nasce, e perche

| Tentazione | Verdetto |
|---|---|
| Una tabella che materializzi incassi, compensi e contributi | **No.** E la seconda contabilita |
| Un piano dei conti / partita doppia | **No.** Nessuna norma lo chiede a una ASD |
| Una tabella `counterparties` | **No.** Duplicherebbe atleti, soci, persone e sponsor |
| Un ruolo `treasurer` | **No.** La separazione «registra / storna» ottiene lo stesso |
| Un motore IVA | **No.** Classe C: si modella il dato, non la regola |
| Un secondo sistema di rate per i soci | **No.** Il socio diventa una controparte pagabile del sistema che esiste |
