-- ===========================================================================
-- La prima nota diventa **una lettura sola**, e la fa il database.
-- ===========================================================================
--
-- ## Il difetto che questa migrazione chiude
--
-- `listAccountingEntries` leggeva **tutto** il registro a ogni chiamata: tutti
-- i movimenti propri, tutti gli incassi, tutti i compensi, tutte le
-- liquidazioni, tutto il blob storico. Poi filtrava in memoria, ordinava in
-- memoria e affettava cinquanta righe.
--
-- Su un club medio non si vedeva. Su 35.000 righe:
--
--   * prima nota          ~3,6 s   (soglia 800 ms)
--   * rendiconto        ~2m 08 s   (soglia 2 s)
--   * export            ~3m 37 s   (soglia 5 s)
--
-- Il rendiconto e l'export non erano lenti per conto proprio: **sfogliavano**
-- quella funzione, quaranta e ottanta volte, e ognuna delle ottanta
-- ricostruiva il registro intero per restituire cinquecento righe. Il costo era
-- O(N x pagine), e nessuna cache lo avrebbe curato: sarebbe stato un cerotto
-- sopra una domanda posta male.
--
-- ## La risposta, e perche una vista e non una tabella
--
-- Una **tabella** che materializzasse incassi, compensi e contributi sarebbe la
-- seconda contabilita che il committente ha vietato: due fonti per lo stesso
-- numero, e nessun modo di tenerle allineate. Una **vista** non ha quel
-- problema, e per un motivo strutturale: non contiene niente. E la stessa
-- lettura di prima, scritta una volta e messa dove gli indici lavorano.
--
-- Non si puo scrivere, non si puo disallineare, non ha un suo stato. Se domani
-- un incasso viene stornato, la vista lo sa nello stesso istante in cui lo sa
-- `payment_transactions`, perche **e** `payment_transactions`.
--
-- ## Cosa la vista aggiunge rispetto alla proiezione in TypeScript
--
-- Niente di semantico, ed e il punto. Verso, importo, descrizione e origine
-- sono le stesse regole di `src/lib/accounting/projection.ts`, tradotte. Che le
-- due letture dicano davvero la stessa cosa non e affidato alla buona volonta:
-- lo verifica `scripts/wave-4-registro-riconciliazione.mjs` contro il database
-- vero, riga per riga.
--
-- ## Il vincolo Cedi Platform (ADR-0007)
--
-- Una vista SQL standard non e un accoppiamento all'hosting: e il contrario. Il
-- giorno in cui la logica di dominio si sposta fuori da Next.js, questa
-- definizione si porta dietro cosi com'e, mentre una proiezione scritta in
-- TypeScript andrebbe riscritta.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Gli indici che mancavano
-- ---------------------------------------------------------------------------
--
-- I tre domini proiettati hanno un indice su `organization_id` e nessuno sulla
-- **data**, che e l'asse su cui la prima nota ordina e filtra sempre. Senza,
-- ogni lettura di un anno e una scansione completa della tabella.

CREATE INDEX IF NOT EXISTS "payment_transactions_org_paid_at_idx"
  ON "payment_transactions" ("organization_id", "paid_at");

CREATE INDEX IF NOT EXISTS "funding_settlements_org_settled_at_idx"
  ON "funding_settlements" ("organization_id", "settled_at");

-- La causale non e indicizzata da nessuna parte, e il filtro per causale e uno
-- dei quattro che la pagina offre.
CREATE INDEX IF NOT EXISTS "accounting_entries_org_operation_code_idx"
  ON "accounting_entries" ("organization_id", "operation_type_code");


-- ---------------------------------------------------------------------------
-- 2. Il registro unico
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS "accounting_ledger_lines";

CREATE VIEW "accounting_ledger_lines" AS

-- ....................................................... i movimenti propri
--
-- Le righe di `accounting_entries`: il movimento di cassa registrato a mano, le
-- due gambe di un giroconto e i loro storni. Sono le uniche che si scrivono.
SELECT
  -- L identificativo e prefissato per dominio: due domini non possono
  -- collidere, e chi legge una riga sa da dove viene senza guardare altro.
  ('accounting-entry:' || e.id::text)             AS id,
  'entry'::text                                 AS row_kind,
  e.organization_id                             AS organization_id,
  e.entry_date                                  AS entry_date,
  e.fiscal_year                                 AS fiscal_year,
  e.season_id                                   AS season_id,
  e.direction                                   AS direction,
  e.amount_cents                                AS amount_cents,
  e.currency                                    AS currency,
  e.financial_account_id::text                  AS financial_account_id,
  fa.name                                       AS financial_account_name,
  e.operation_type_code                         AS operation_type_code,
  -- L'etichetta congelata vince su quella corrente: correggere una causale non
  -- deve riscrivere come si leggevano i movimenti di ieri.
  COALESCE(e.operation_type_label_snapshot, ot.label)
                                                AS operation_type_label,
  e.activity_scope_snapshot                     AS activity_scope,
  e.description                                 AS description,
  e.notes                                       AS notes,
  e.payment_method                              AS payment_method,
  e.counterparty_kind                           AS counterparty_kind,
  e.counterparty_id                             AS counterparty_id,
  e.counterparty_label                          AS counterparty_label,
  e.source_domain                               AS source_domain,
  e.source_id                                   AS source_id,
  e.document_kind                               AS document_kind,
  e.document_id::text                           AS document_id,
  COALESCE(inv.invoice_number, rec.receipt_number)
                                                AS document_number,
  e.site_id                                     AS site_id,
  e.reconciliation_status                       AS reconciliation_status,
  e.value_date                                  AS value_date,
  e.bank_reference                              AS bank_reference,
  e.transfer_group_id::text                     AS transfer_group_id,
  e.reversal_of_id::text                        AS reversal_of_id,
  e.reversed_at                                 AS reversed_at,
  e.reversal_reason                             AS reversal_reason,
  e.created_by::text                            AS created_by,
  e.created_at                                  AS created_at,
  lower(concat_ws(' ',
    e.description, e.counterparty_label,
    COALESCE(e.operation_type_label_snapshot, ot.label),
    e.operation_type_code, e.notes, e.bank_reference))
                                                AS search_text
FROM "accounting_entries" e
LEFT JOIN "financial_accounts" fa
  ON fa.id = e.financial_account_id
LEFT JOIN "fiscal_operation_types" ot
  ON ot.id = e.operation_type_id
-- Il numero del documento porta il suo `organization_id` anche se la riga e
-- gia stata verificata: e la regola del repository, e vale perche un documento
-- di un altro club referenziato per errore non deve comparire col suo numero.
LEFT JOIN "invoices" inv
  ON inv.id = e.document_id
 AND inv.organization_id = e.organization_id
 AND lower(COALESCE(e.document_kind, '')) IN ('invoice', 'fattura')
LEFT JOIN "receipts" rec
  ON rec.id = e.document_id
 AND rec.organization_id = e.organization_id
 AND lower(COALESCE(e.document_kind, '')) IN ('receipt', 'ricevuta')

UNION ALL

-- .................................................. gli incassi delle famiglie
--
-- Tre casi, non due. Un incasso e un'entrata; uno **storno** — riga che cita
-- l'originale — e un'uscita ed esce dai totali; un **rimborso** — riga negativa
-- che non cita niente — e un'uscita che nei totali **resta**, perche il denaro
-- e tornato indietro davvero.
SELECT
  'payment-transaction:' || pt.id::text,
  'projected'::text,
  pt.organization_id,
  pt.paid_at,
  EXTRACT(YEAR FROM pt.paid_at)::int,
  NULL::text,
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL THEN 'OUT'
    WHEN pt.amount < 0 THEN 'OUT'
    ELSE 'IN'
  END,
  -- `floor(x + 0.5)` e non `round(x)`: replica `Math.round` di JavaScript, che
  -- sui mezzi arrotonda verso l'alto mentre `round` di Postgres si allontana
  -- da zero. Su un importo negativo le due regole divergono di un centesimo.
  abs(floor(pt.amount * 100::double precision + 0.5))::int,
  COALESCE(pt.currency, 'EUR'),
  pt.financial_account_id::text,
  fa.name,
  pt.operation_type_code,
  ot.label,
  -- Prima cio che e **congelato sulla riga**, e solo in mancanza cio che la
  -- causale dice adesso: invertire l'ordine farebbe cambiare natura al passato
  -- ogni volta che qualcuno corregge una classificazione.
  COALESCE(NULLIF(pt.activity_scope_snapshot, ''), ot.activity_scope, 'unspecified'),
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL THEN 'Storno incasso - '
    WHEN pt.amount < 0 THEN 'Rimborso - '
    ELSE 'Incasso - '
  END || COALESCE(
    NULLIF(btrim(pt.counterparty_label), ''),
    NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
    'Incasso'),
  pt.notes,
  pt.payment_method,
  COALESCE(upper(NULLIF(btrim(pt.counterparty_kind), '')),
           CASE WHEN pt.athlete_id IS NOT NULL THEN 'ATHLETE' END),
  COALESCE(NULLIF(btrim(pt.counterparty_id), ''), pt.athlete_id::text),
  COALESCE(
    NULLIF(btrim(pt.counterparty_label), ''),
    NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
    'Incasso'),
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL THEN 'REVERSAL'
    WHEN pt.amount < 0 THEN 'REFUND'
    ELSE 'ATHLETE_PAYMENT'
  END,
  pt.id::text,
  -- La fattura vince sulla ricevuta quando ci sono entrambe: e il documento con
  -- la numerazione fiscale propria, ed e quello che un commercialista cerca.
  -- Un documento **annullato** non si mostra: dire che un incasso porta un
  -- numero ritirato e peggio che non dirne nessuno.
  CASE WHEN d.invoice_number IS NOT NULL THEN 'invoice'
       WHEN d.receipt_number IS NOT NULL THEN 'receipt' END,
  COALESCE(d.invoice_id, d.receipt_id),
  COALESCE(d.invoice_number, d.receipt_number),
  NULL::text,
  'unreconciled'::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  pt.reverses_transaction_id::text,
  pt.reversed_at,
  NULL::text,
  NULL::text,
  pt.created_at,
  lower(concat_ws(' ',
    CASE
      WHEN pt.reverses_transaction_id IS NOT NULL THEN 'Storno incasso - '
      WHEN pt.amount < 0 THEN 'Rimborso - '
      ELSE 'Incasso - '
    END || COALESCE(
      NULLIF(btrim(pt.counterparty_label), ''),
      NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
      'Incasso'),
    COALESCE(
      NULLIF(btrim(pt.counterparty_label), ''),
      NULLIF(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
      'Incasso'),
    ot.label, pt.operation_type_code, pt.notes))
FROM "payment_transactions" pt
LEFT JOIN "athletes" a
  ON a.id = pt.athlete_id
LEFT JOIN "financial_accounts" fa
  ON fa.id = pt.financial_account_id
LEFT JOIN "fiscal_operation_types" ot
  ON ot.organization_id = pt.organization_id
 AND ot.code = pt.operation_type_code
LEFT JOIN LATERAL (
  SELECT
    (SELECT i.id::text FROM "invoices" i
      WHERE i.transaction_id = pt.id AND i.cancelled_at IS NULL
      ORDER BY i.issue_date DESC LIMIT 1) AS invoice_id,
    (SELECT i.invoice_number FROM "invoices" i
      WHERE i.transaction_id = pt.id AND i.cancelled_at IS NULL
      ORDER BY i.issue_date DESC LIMIT 1) AS invoice_number,
    (SELECT r.id::text FROM "receipts" r
      WHERE r.transaction_id = pt.id AND r.cancelled_at IS NULL
      ORDER BY r.issue_date DESC LIMIT 1) AS receipt_id,
    (SELECT r.receipt_number FROM "receipts" r
      WHERE r.transaction_id = pt.id AND r.cancelled_at IS NULL
      ORDER BY r.issue_date DESC LIMIT 1) AS receipt_number
) d ON TRUE
WHERE abs(floor(pt.amount * 100::double precision + 0.5)) <> 0

UNION ALL

-- ............................................ le uscite del lavoro sportivo
--
-- Per quanto e uscito **davvero dal conto verso la persona**, cioe il netto.
-- Contributo del lavoratore e contributo del club escono anche loro, ma verso
-- l'erario e in un altro giorno: sono un versamento F24, che e un movimento
-- proprio. Sommare il lordo qui farebbe uscire due volte la stessa parte di
-- denaro, e il saldo del conto — che somma `net_amount` — direbbe un'altra
-- cosa.
SELECT
  'sport-work:' || sw.id::text,
  'projected'::text,
  sw.organization_id,
  sw.paid_at,
  EXTRACT(YEAR FROM sw.paid_at)::int,
  NULL::text,
  CASE
    WHEN upper(COALESCE(sw.transaction_type, 'OTHER')) = 'COMPENSATION_REVERSAL'
      OR sw.reversal_of_id IS NOT NULL THEN 'IN'
    ELSE 'OUT'
  END,
  abs(floor(sw.net_amount * 100::double precision + 0.5))::int,
  COALESCE(sw.currency, 'EUR'),
  sw.financial_account_id::text,
  fa.name,
  NULL::text,
  NULL::text,
  'unspecified'::text,
  CASE upper(COALESCE(sw.transaction_type, 'OTHER'))
    WHEN 'COMPENSATION_PAYMENT'    THEN 'Compenso'
    WHEN 'COMPENSATION_REVERSAL'   THEN 'Storno compenso'
    WHEN 'BONUS_PAYMENT'           THEN 'Premio'
    WHEN 'EXPENSE_REIMBURSEMENT'   THEN 'Rimborso spese'
    WHEN 'VAT_INVOICE_PAYMENT'     THEN 'Fattura professionista'
    WHEN 'CONTRIBUTION_PAYMENT'    THEN 'Versamento contributi'
    WHEN 'EXTERNAL_PAYROLL_COST'   THEN 'Costo esterno del personale'
    ELSE 'Uscita'
  END || ' - ' || COALESCE(
    NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Persona'),
  sw.reference,
  sw.payment_method,
  'SPORT_WORK_PERSON'::text,
  sw.person_id::text,
  COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Persona'),
  CASE
    WHEN upper(COALESCE(sw.transaction_type, 'OTHER')) = 'COMPENSATION_REVERSAL'
      OR sw.reversal_of_id IS NOT NULL THEN 'REVERSAL'
    ELSE 'SPORT_WORK_PAYOUT'
  END,
  sw.id::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unreconciled'::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  sw.reversal_of_id::text,
  sw.reversed_at,
  NULL::text,
  NULL::text,
  sw.created_at,
  lower(concat_ws(' ',
    CASE upper(COALESCE(sw.transaction_type, 'OTHER'))
      WHEN 'COMPENSATION_PAYMENT'    THEN 'Compenso'
      WHEN 'COMPENSATION_REVERSAL'   THEN 'Storno compenso'
      WHEN 'BONUS_PAYMENT'           THEN 'Premio'
      WHEN 'EXPENSE_REIMBURSEMENT'   THEN 'Rimborso spese'
      WHEN 'VAT_INVOICE_PAYMENT'     THEN 'Fattura professionista'
      WHEN 'CONTRIBUTION_PAYMENT'    THEN 'Versamento contributi'
      WHEN 'EXTERNAL_PAYROLL_COST'   THEN 'Costo esterno del personale'
      ELSE 'Uscita'
    END || ' - ' || COALESCE(
      NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Persona'),
    COALESCE(NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Persona'),
    sw.reference))
FROM "sport_work_outbound_transactions" sw
LEFT JOIN "sport_work_people" p
  ON p.id = sw.person_id
LEFT JOIN "financial_accounts" fa
  ON fa.id = sw.financial_account_id
-- Netto zero significa che dal conto verso la persona non e uscito niente: la
-- riga non c'e, e il denaro dei contributi lo racconta l'F24.
WHERE abs(floor(sw.net_amount * 100::double precision + 0.5)) <> 0

UNION ALL

-- ................................................ le liquidazioni dei bandi
--
-- Il bonifico dell'ente, e **solo** quello. La maturazione di un voucher fa
-- nascere un credito verso l'ente e non e denaro: metterla qui vorrebbe dire
-- dichiarare incassato cio che il club sta ancora aspettando (ADR-0037).
SELECT
  'funding-settlement:' || fs.id::text,
  'projected'::text,
  fs.organization_id,
  fs.settled_at,
  EXTRACT(YEAR FROM fs.settled_at)::int,
  NULL::text,
  CASE WHEN fs.reversal_of_id IS NOT NULL THEN 'OUT' ELSE 'IN' END,
  abs(floor(fs.amount * 100::double precision + 0.5))::int,
  'EUR'::text,
  fs.financial_account_id::text,
  fa.name,
  NULL::text,
  NULL::text,
  'unspecified'::text,
  CASE WHEN fs.reversal_of_id IS NOT NULL
       THEN 'Storno liquidazione - ' ELSE 'Liquidazione - ' END
    || COALESCE(NULLIF(btrim(fp.name), ''), 'Contributo'),
  COALESCE(NULLIF(btrim(fs.notes), ''), fs.reference),
  fs.method,
  'ENTITY'::text,
  fs.program_id::text,
  COALESCE(NULLIF(btrim(fp.name), ''), 'Contributo'),
  CASE WHEN fs.reversal_of_id IS NOT NULL THEN 'REVERSAL' ELSE 'FUNDING_SETTLEMENT' END,
  fs.id::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unreconciled'::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  fs.reversal_of_id::text,
  fs.reversed_at,
  NULL::text,
  NULL::text,
  fs.created_at,
  lower(concat_ws(' ',
    CASE WHEN fs.reversal_of_id IS NOT NULL
         THEN 'Storno liquidazione - ' ELSE 'Liquidazione - ' END
      || COALESCE(NULLIF(btrim(fp.name), ''), 'Contributo'),
    COALESCE(NULLIF(btrim(fp.name), ''), 'Contributo'),
    COALESCE(NULLIF(btrim(fs.notes), ''), fs.reference)))
FROM "funding_settlements" fs
LEFT JOIN "funding_programs" fp
  ON fp.id = fs.program_id
LEFT JOIN "financial_accounts" fa
  ON fa.id = fs.financial_account_id
WHERE abs(floor(fs.amount * 100::double precision + 0.5)) <> 0

UNION ALL

-- ............................................. i movimenti storici nel blob
--
-- Le righe scritte prima che la prima nota esistesse vivono in
-- `clubs.transactions`, una colonna JSON senza data interrogabile, senza
-- autore e senza causale. Non sono state travasate in tabella, e la ragione
-- non e pigrizia: travasarle avrebbe richiesto di **inventare** per ognuna un
-- conto e una causale che nessuno ha mai dichiarato.
--
-- Il loro effetto sui conti c'e gia, dentro `opening_balance_cents`. Quindi
-- **compaiono** nella prima nota (la storia non si perde) e **non hanno un
-- conto** (il saldo le ha gia dentro, e attribuirle a una cassa le conterebbe
-- due volte).
SELECT
  'legacy-transaction:' || COALESCE(t.value ->> 'id', (t.ord - 1)::text),
  'legacy'::text,
  c.id,
  (t.value ->> 'date')::timestamp(3),
  EXTRACT(YEAR FROM (t.value ->> 'date')::timestamp(3))::int,
  NULL::text,
  CASE WHEN lower(COALESCE(t.value ->> 'type', t.value ->> 'direction', 'income'))
            IN ('expense', 'uscita', 'out') THEN 'OUT' ELSE 'IN' END,
  abs(floor((t.value ->> 'amount')::double precision * 100 + 0.5))::int,
  'EUR'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  -- Non si inventa una causale: compaiono come `unspecified`, che e la verita.
  -- Il rendiconto le contera fra le «non classificate» invece di nasconderle
  -- in un totale, ed e cosi che un club capisce che ha del lavoro da fare.
  'unspecified'::text,
  COALESCE(NULLIF(btrim(t.value ->> 'description'), ''),
           NULLIF(btrim(t.value ->> 'title'), ''),
           'Movimento storico'),
  NULL::text,
  COALESCE(NULLIF(btrim(t.value ->> 'paymentMethod'), ''),
           NULLIF(btrim(t.value ->> 'method'), '')),
  NULL::text,
  NULL::text,
  NULL::text,
  'MANUAL'::text,
  COALESCE(t.value ->> 'id', 'legacy-' || (t.ord - 1)::text),
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unreconciled'::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  (t.value ->> 'date')::timestamp(3),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''),
                 NULLIF(btrim(t.value ->> 'title'), ''),
                 'Movimento storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transactions) = 'array'
       THEN c.transactions ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE (t.value ->> 'date') IS NOT NULL
  AND (t.value ->> 'date') ~ '^\d{4}-\d{2}-\d{2}'
  AND abs(floor(COALESCE((t.value ->> 'amount')::double precision, 0) * 100 + 0.5)) <> 0

UNION ALL

-- Un giroconto storico e **una** riga sola nel blob, non due. Resta una riga
-- qui, con verso `OUT` per convenzione e senza gruppo: non e una gamba di
-- niente, e presentarlo come due meta suggerirebbe un collegamento che nel
-- dato non c'e.
SELECT
  'legacy-transfer:' || COALESCE(t.value ->> 'id', (t.ord - 1)::text),
  'legacy'::text,
  c.id,
  (t.value ->> 'date')::timestamp(3),
  EXTRACT(YEAR FROM (t.value ->> 'date')::timestamp(3))::int,
  NULL::text,
  'OUT'::text,
  abs(floor((t.value ->> 'amount')::double precision * 100 + 0.5))::int,
  'EUR'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unspecified'::text,
  COALESCE(NULLIF(btrim(t.value ->> 'description'), ''), 'Giroconto storico'),
  NULL::text,
  'Giroconto'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'INTERNAL_TRANSFER'::text,
  COALESCE(t.value ->> 'id', 'legacy-transfer-' || (t.ord - 1)::text),
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unreconciled'::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::timestamp(3),
  NULL::text,
  NULL::text,
  (t.value ->> 'date')::timestamp(3),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''), 'Giroconto storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transfers) = 'array'
       THEN c.transfers ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE (t.value ->> 'date') IS NOT NULL
  AND (t.value ->> 'date') ~ '^\d{4}-\d{2}-\d{2}'
  AND abs(floor(COALESCE((t.value ->> 'amount')::double precision, 0) * 100 + 0.5)) <> 0;


COMMENT ON VIEW "accounting_ledger_lines" IS
  'La prima nota, in una lettura sola: i movimenti propri piu la proiezione di '
  'incassi, compensi, liquidazioni e movimenti storici. Sola lettura per '
  'costruzione: non contiene niente, quindi non puo disallinearsi dai domini '
  'che possiedono i numeri. Vedi src/lib/accounting/OWNERSHIP.md.';
