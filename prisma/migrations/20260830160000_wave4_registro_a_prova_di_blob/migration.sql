-- ===========================================================================
-- Una riga sporca nel blob storico non deve spegnere la prima nota del club.
-- ===========================================================================
--
-- ## Il difetto, che una revisione ostile ha misurato
--
-- La vista `accounting_ledger_lines` legge i movimenti storici da
-- `clubs.transactions` / `clubs.transfers`, che sono JSON scritti da versioni
-- del prodotto che nessuno controlla piu, e li converte con due cast nudi:
--
--     (t.value ->> 'amount')::double precision
--     (t.value ->> 'date')::timestamp(3)
--
-- Un cast che fallisce non scarta la riga: fa fallire **l'intera query**. Due
-- riproduzioni contro il database vero:
--
--     {"id":"L8","date":"2026-03-09","amount":"1.234,56"}
--       ERROR: invalid input syntax for type double precision
--
--     {"id":"L9","date":"2026-02-31","amount":10}
--       ERROR: date/time field value out of range
--
-- Da quel momento, per quel club, **non funziona piu niente**: prima nota,
-- rendiconto, export, riquadro dei saldi. Una riga scritta anni fa da una
-- schermata che non esiste piu spegne la contabilita.
--
-- Il guard `~ '^\d{4}-\d{2}-\d{2}'` non era ancorato a destra, quindi
-- `"2026-03-01xyz"` lo superava e faceva esplodere il cast lo stesso; e il 31
-- febbraio lo supera per costruzione, perche una data impossibile ha comunque
-- la forma giusta.
--
-- ## La differenza con la dichiarazione in TypeScript, che era il vero segnale
--
-- `src/lib/accounting/ledger-view.ts` degrada con grazia: `Number(...) || 0`
-- scarta la riga e va avanti. Le due scritture della stessa regola **non
-- coincidevano sull'input sporco**, e la sonda di riconciliazione non lo
-- vedeva perche non seminava nessuna riga malformata. Adesso lo fa.
--
-- ## La forma della correzione
--
-- Due funzioni che provano il cast e restituiscono `NULL` invece di far
-- fallire la transazione. E l'idioma `TRY_CAST` che SQL standard non ha, ed e
-- una decina di righe di PL/pgSQL: molto meno accoppiamento di quello che
-- costerebbe rappresentare qui la stessa tolleranza a mano, e infinitamente
-- meno di una contabilita che si spegne.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Il cast che non fa cadere la query
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION easygame_blob_timestamp(valore text)
RETURNS timestamp(3)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  RETURN valore::timestamp(3);
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION easygame_blob_timestamp(text) IS
  'Converte in data cio che arriva da un blob JSON storico, o restituisce NULL. '
  'Una riga scritta male non deve poter spegnere la prima nota di un club.';

CREATE OR REPLACE FUNCTION easygame_blob_number(valore text)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  RETURN valore::double precision;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION easygame_blob_number(text) IS
  'Converte in numero cio che arriva da un blob JSON storico, o restituisce NULL.';


-- ---------------------------------------------------------------------------
-- 2. Il registro, con i due rami storici rifatti
-- ---------------------------------------------------------------------------
--
-- Rispetto alla prima stesura cambiano tre cose, oltre ai cast:
--
-- 1. la **data di ripiego**. La dichiarazione in TypeScript legge
--    `date` **oppure** `created_at`; l'SQL leggeva solo `date`, e una riga che
--    portava soltanto la seconda spariva da una lettura e non dall'altra. Su un
--    campione di sette righe la differenza valeva 777 euro;
--
-- 2. l'**identificativo**, che adesso e la **posizione** nell'array e non piu
--    il campo `id` del JSON. Due righe del blob con lo stesso `id` producevano
--    due righe della vista con lo stesso identificativo, e l'ordine del
--    registro usa proprio l'identificativo come criterio di spareggio: la
--    pagina 2 poteva ripetere righe della pagina 1. La posizione e unica per
--    costruzione. Il campo `id` del JSON resta, dove c'e, in `source_id`;
--
-- 3. il **verso** di un giroconto storico non e piu una convenzione muta: la
--    riga porta nella descrizione che e una gamba sola, perche chi legge un
--    riquadro «trasferito in uscita 500, in entrata 0» capisca perche.

DROP VIEW IF EXISTS "accounting_ledger_lines";

CREATE VIEW "accounting_ledger_lines" AS

-- ....................................................... i movimenti propri
SELECT
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
-- Tre casi, non due: incasso, **storno** (cita l'originale, esce dai totali) e
-- **rimborso** (riga negativa che non cita niente, e nei totali resta perche il
-- denaro e tornato indietro davvero).
SELECT
  'payment-transaction:' || pt.id::text,
  'projected'::text,
  pt.organization_id,
  pt.paid_at,
  EXTRACT(YEAR FROM pt.paid_at)::int,
  NULL::text,
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL THEN
      /*
        **Il verso di uno storno lo dice il suo importo, non il fatto di essere
        uno storno.** Il `CASE` guardava solo `reverses_transaction_id`, e lo
        storno di un **rimborso** — che e una riga positiva — usciva come
        uscita: il registro raccontava sessanta euro usciti per trenta rientrati.
        Il segno e l'unica cosa che sa da che parte si e mosso il denaro.
      */
      CASE WHEN pt.amount < 0 THEN 'OUT' ELSE 'IN' END
    WHEN pt.amount < 0 THEN 'OUT'
    ELSE 'IN'
  END,
  abs(floor(pt.amount * 100::double precision + 0.5))::int,
  COALESCE(pt.currency, 'EUR'),
  pt.financial_account_id::text,
  fa.name,
  pt.operation_type_code,
  ot.label,
  COALESCE(NULLIF(pt.activity_scope_snapshot, ''), ot.activity_scope, 'unspecified'),
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL AND pt.amount >= 0
      THEN 'Storno rimborso - '
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
      WHEN pt.reverses_transaction_id IS NOT NULL AND pt.amount >= 0
        THEN 'Storno rimborso - '
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
-- Il **segno** del netto decide il verso, come per gli incassi: il saldo del
-- conto somma `net_amount` con il suo segno, e prendere qui il valore assoluto
-- forzando `OUT` faceva divergere le due letture del doppio dell'importo su
-- ogni riga con netto negativo.
SELECT
  'sport-work:' || sw.id::text,
  'projected'::text,
  sw.organization_id,
  sw.paid_at,
  EXTRACT(YEAR FROM sw.paid_at)::int,
  NULL::text,
  CASE
    WHEN sw.net_amount < 0 THEN 'IN'
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
WHERE abs(floor(sw.net_amount * 100::double precision + 0.5)) <> 0

UNION ALL

-- ................................................ le liquidazioni dei bandi
SELECT
  'funding-settlement:' || fs.id::text,
  'projected'::text,
  fs.organization_id,
  fs.settled_at,
  EXTRACT(YEAR FROM fs.settled_at)::int,
  NULL::text,
  CASE WHEN fs.amount < 0 THEN 'OUT' ELSE 'IN' END,
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
-- Il loro effetto sui conti **non** e ricostruibile: `opening_balance_cents` e
-- il saldo che il vecchio blob `clubs.bank_accounts` **dichiarava** al travaso,
-- non la somma di `clubs.transactions`. Percio queste righe si mostrano — la
-- storia si legge — e non toccano nessun saldo, perche attribuirle a una cassa
-- significherebbe affermare una corrispondenza che il dato non sostiene.
SELECT
  'legacy-transaction:' || (t.ord - 1)::text,
  'legacy'::text,
  c.id,
  easygame_blob_timestamp(COALESCE(t.value ->> 'date', t.value ->> 'created_at')),
  EXTRACT(YEAR FROM easygame_blob_timestamp(
    COALESCE(t.value ->> 'date', t.value ->> 'created_at')))::int,
  NULL::text,
  CASE WHEN lower(COALESCE(t.value ->> 'type', t.value ->> 'direction', 'income'))
            IN ('expense', 'uscita', 'out') THEN 'OUT' ELSE 'IN' END,
  abs(floor(easygame_blob_number(t.value ->> 'amount') * 100 + 0.5))::int,
  'EUR'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
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
  COALESCE(NULLIF(btrim(t.value ->> 'id'), ''), 'legacy-' || (t.ord - 1)::text),
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
  easygame_blob_timestamp(COALESCE(t.value ->> 'date', t.value ->> 'created_at')),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''),
                 NULLIF(btrim(t.value ->> 'title'), ''),
                 'Movimento storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transactions) = 'array'
       THEN c.transactions ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE easygame_blob_timestamp(
        COALESCE(t.value ->> 'date', t.value ->> 'created_at')) IS NOT NULL
  AND abs(floor(COALESCE(easygame_blob_number(t.value ->> 'amount'), 0) * 100 + 0.5)) <> 0

UNION ALL

-- Un giroconto storico e **una** riga sola nel blob, non due, e il blob non
-- dice fra quali conti sia passato il denaro in una forma che si possa
-- credere. Resta una riga, e la descrizione dice che e una gamba sola: chi
-- legge «trasferito in uscita 500, in entrata 0» deve poter capire perche.
SELECT
  'legacy-transfer:' || (t.ord - 1)::text,
  'legacy'::text,
  c.id,
  easygame_blob_timestamp(COALESCE(t.value ->> 'date', t.value ->> 'created_at')),
  EXTRACT(YEAR FROM easygame_blob_timestamp(
    COALESCE(t.value ->> 'date', t.value ->> 'created_at')))::int,
  NULL::text,
  'OUT'::text,
  abs(floor(easygame_blob_number(t.value ->> 'amount') * 100 + 0.5))::int,
  'EUR'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'unspecified'::text,
  COALESCE(NULLIF(btrim(t.value ->> 'description'), ''), 'Giroconto storico')
    || ' (storico, gamba sola)',
  NULL::text,
  'Giroconto'::text,
  NULL::text,
  NULL::text,
  NULL::text,
  'INTERNAL_TRANSFER'::text,
  COALESCE(NULLIF(btrim(t.value ->> 'id'), ''),
           'legacy-transfer-' || (t.ord - 1)::text),
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
  easygame_blob_timestamp(COALESCE(t.value ->> 'date', t.value ->> 'created_at')),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''), 'Giroconto storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transfers) = 'array'
       THEN c.transfers ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE easygame_blob_timestamp(
        COALESCE(t.value ->> 'date', t.value ->> 'created_at')) IS NOT NULL
  AND abs(floor(COALESCE(easygame_blob_number(t.value ->> 'amount'), 0) * 100 + 0.5)) <> 0;


COMMENT ON VIEW "accounting_ledger_lines" IS
  'La prima nota, in una lettura sola: i movimenti propri piu la proiezione di '
  'incassi, compensi, liquidazioni e movimenti storici. Sola lettura per '
  'costruzione: non contiene niente, quindi non puo disallinearsi dai domini '
  'che possiedono i numeri. Vedi src/lib/accounting/OWNERSHIP.md.';
