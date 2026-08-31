-- ===========================================================================
-- La sede di un incasso: il rendiconto per sede mostrava zero euro
-- ===========================================================================
--
-- ## Il difetto, misurato
--
-- Su un club con due sedi, `EasyGame FC` del database di sviluppo:
--
--     tutte le sedi : 9 righe, 430,02 EUR
--     Scauri        : 0 righe,   0,00 EUR
--     Santi Cosma   : 0 righe,   0,00 EUR
--
-- **Tutte** le righe avevano `site_id` nullo. Dei cinque rami della vista solo
-- il primo — i movimenti propri — portava una sede; gli altri scrivevano
-- `NULL` in quella posizione, scritto nel SQL. Ma gli incassi delle famiglie
-- stanno tutti nel secondo ramo: nessun euro pagato da una famiglia poteva
-- quindi avere una sede, mai.
--
-- Il filtro per sede e un'uguaglianza stretta, quindi selezionare una sede
-- svuotava il rendiconto. Un club che chiede «come e andata Scauri quest'anno»
-- riceveva zero incassi e qualche uscita manuale, senza nessun avviso, e
-- consegnava lo stesso CSV al commercialista. Le cifre per sede non sommavano
-- al totale del club, e non potevano.
--
-- ## Perche la sede c'era gia, e non veniva letta
--
-- `financial_accounts.site_id` esiste, e validata in scrittura contro le sedi
-- del club, e ogni riga proiettata porta gia il suo `financial_account_id` — i
-- tre rami uniscono gia quella tabella, per leggerne il **nome**. La sede era
-- a un campo di distanza e nessuno la prendeva.
--
-- I due rami storici restano senza sede: il vecchio blob non dice su quale
-- conto sia passato il denaro, e inventarla sarebbe peggio che dichiararla
-- assente.
--
-- ## Cosa NON cambia qui
--
-- Che una riga senza sede debba comparire in **ogni** vista per sede — la
-- regola di ADR-0038, «sede vuota = presente ovunque, non in nessun luogo» —
-- e un fatto del filtro, non della vista, e si corregge in
-- `src/lib/server/accounting.ts` e nel suo gemello in memoria.
-- ===========================================================================

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
/*
  **Un documento annullato non presta il suo numero.**

  Il ramo dei movimenti propri univa i documenti senza filtrare
  l annullamento — a differenza del ramo degli incassi, che lo filtra da
  sempre. Un movimento manuale che cita una ricevuta annullata ne stampava il
  numero in prima nota, come se il documento fosse ancora valido.
*/
LEFT JOIN "invoices" inv
  ON inv.id = e.document_id
 AND inv.organization_id = e.organization_id
 AND inv.cancelled_at IS NULL
 AND lower(COALESCE(e.document_kind, '')) IN ('invoice', 'fattura')
LEFT JOIN "receipts" rec
  ON rec.id = e.document_id
 AND rec.organization_id = e.organization_id
 AND rec.cancelled_at IS NULL
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
  easygame_centesimi(pt.amount),
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
  /*
    **Un incasso di sponsorizzazione non e la quota di una famiglia.**

    Tutti gli incassi uscivano come 'ATHLETE_PAYMENT', quindi in prima nota
    4.200 euro di sponsorizzazioni comparivano come «Incasso quota» con
    controparte «Sponsor». E il filtro «Incasso sponsor» — che l'interfaccia
    offre, perche disegna un'opzione per ogni valore di `SOURCE_DOMAINS` —
    non poteva **mai** restituire niente: quel valore non era prodotto da
    nessuna riga.

    L'origine la dice la controparte congelata sulla riga.
  */
  CASE
    WHEN pt.reverses_transaction_id IS NOT NULL THEN 'REVERSAL'
    WHEN pt.amount < 0 THEN 'REFUND'
    WHEN upper(btrim(COALESCE(pt.counterparty_kind, ''))) IN ('SPONSOR', 'SUPPLIER')
      THEN 'SPONSOR_PAYMENT'
    ELSE 'ATHLETE_PAYMENT'
  END,
  pt.id::text,
  CASE WHEN d.invoice_number IS NOT NULL THEN 'invoice'
       WHEN d.receipt_number IS NOT NULL THEN 'receipt' END,
  COALESCE(d.invoice_id, d.receipt_id),
  COALESCE(d.invoice_number, d.receipt_number),
  fa.site_id,
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
WHERE easygame_centesimi(pt.amount) <> 0

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
  easygame_centesimi(sw.net_amount),
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
  fa.site_id,
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
WHERE easygame_centesimi(sw.net_amount) <> 0

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
  easygame_centesimi(fs.amount),
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
  fa.site_id,
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
WHERE easygame_centesimi(fs.amount) <> 0

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
  COALESCE(easygame_blob_timestamp(t.value ->> 'date'), easygame_blob_timestamp(t.value ->> 'created_at')),
  EXTRACT(YEAR FROM COALESCE(
    easygame_blob_timestamp(t.value ->> 'date'),
    easygame_blob_timestamp(t.value ->> 'created_at')))::int,
  NULL::text,
  CASE WHEN lower(COALESCE(t.value ->> 'type', t.value ->> 'direction', 'income'))
            IN ('expense', 'uscita', 'out') THEN 'OUT' ELSE 'IN' END,
  easygame_centesimi(easygame_blob_number(t.value ->> 'amount')),
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
  COALESCE(easygame_blob_timestamp(t.value ->> 'date'), easygame_blob_timestamp(t.value ->> 'created_at')),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''),
                 NULLIF(btrim(t.value ->> 'title'), ''),
                 'Movimento storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transactions) = 'array'
       THEN c.transactions ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE COALESCE(
        easygame_blob_timestamp(t.value ->> 'date'),
        easygame_blob_timestamp(t.value ->> 'created_at')) IS NOT NULL
  AND easygame_centesimi(easygame_blob_number(t.value ->> 'amount')) <> 0

UNION ALL

-- Un giroconto storico e **una** riga sola nel blob, non due, e il blob non
-- dice fra quali conti sia passato il denaro in una forma che si possa
-- credere. Resta una riga, e la descrizione dice che e una gamba sola: chi
-- legge «trasferito in uscita 500, in entrata 0» deve poter capire perche.
SELECT
  'legacy-transfer:' || (t.ord - 1)::text,
  'legacy'::text,
  c.id,
  COALESCE(easygame_blob_timestamp(t.value ->> 'date'), easygame_blob_timestamp(t.value ->> 'created_at')),
  EXTRACT(YEAR FROM COALESCE(
    easygame_blob_timestamp(t.value ->> 'date'),
    easygame_blob_timestamp(t.value ->> 'created_at')))::int,
  NULL::text,
  'OUT'::text,
  easygame_centesimi(easygame_blob_number(t.value ->> 'amount')),
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
  COALESCE(easygame_blob_timestamp(t.value ->> 'date'), easygame_blob_timestamp(t.value ->> 'created_at')),
  lower(COALESCE(NULLIF(btrim(t.value ->> 'description'), ''), 'Giroconto storico'))
FROM "clubs" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transfers) = 'array'
       THEN c.transfers ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
WHERE COALESCE(
        easygame_blob_timestamp(t.value ->> 'date'),
        easygame_blob_timestamp(t.value ->> 'created_at')) IS NOT NULL
  AND easygame_centesimi(easygame_blob_number(t.value ->> 'amount')) <> 0;


COMMENT ON VIEW "accounting_ledger_lines" IS
  'La prima nota, in una lettura sola: i movimenti propri piu la proiezione di '
  'incassi, compensi, liquidazioni e movimenti storici. Sola lettura per '
  'costruzione: non contiene niente, quindi non puo disallinearsi dai domini '
  'che possiedono i numeri. Vedi src/lib/accounting/OWNERSHIP.md.';

