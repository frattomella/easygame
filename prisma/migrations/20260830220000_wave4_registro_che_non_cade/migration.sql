-- ===========================================================================
-- Un numero fuori scala non deve spegnere la contabilita di un club.
-- ===========================================================================
--
-- ## Il difetto, che e lo stesso di due migrazioni fa e non era stato chiuso
--
-- easygame_blob_timestamp ed easygame_blob_number intercettavano il fallimento
-- della **conversione**. Nessuno intercettava il ::int che veniva subito dopo:
-- oltre 21.474.836,47 euro i centesimi non entrano in un intero, e Postgres
-- non tronca -- alza "integer out of range" e **l'intera query cade**. Cioe
-- esattamente il guasto che quella migrazione era stata scritta per finire,
-- riproposto un centesimo piu in la.
--
-- E non riguardava soltanto il blob storico. Lo stesso cast era applicato a
-- payment_transactions.amount, sport_work_outbound_transactions.net_amount e
-- funding_settlements.amount, e nessun vincolo ne limitava la grandezza:
-- payment_transactions_amount_check vieta lo zero, non l'infinito. Un
-- Date.now() finito nel campo dell'importo -- 1,7 mila miliardi -- e quel club
-- perdeva prima nota, rendiconto, export e saldi. Senza nessun dato storico.
--
-- ## Le due meta della correzione
--
-- *La prevenzione:* i tre importi di dominio dichiarano ora quanto possono
-- valere. Un movimento che il registro non puo rappresentare non deve poter
-- **nascere**; ed e un CHECK, non un controllo applicativo, perche la prima
-- volta e nato da una scrittura che l'applicazione non ha visto.
--
-- *La tolleranza:* easygame_centesimi restituisce NULL invece di alzare -- per
-- il fuori scala, per NaN e per gli infiniti, che Postgres accetta volentieri
-- come double precision e rifiuta come int. Se un giorno un vincolo verra
-- aggirato, si perdera **una riga**, non un anno di contabilita.
--
-- ## E la data, che le due letture leggevano diversa
--
-- Tre divergenze fra la vista e la sua dichiarazione in TypeScript, tutte
-- sulla stessa colonna:
--
--   1. il **ripiego**. COALESCE(date, created_at) sceglie fra i due valori
--      **grezzi**, quindi una date sporca ma presente vinceva su un created_at
--      buono: SQL scartava la riga, TypeScript la teneva. Ora si sceglie fra i
--      due valori **letti**;
--   2. le parole. Postgres risolve 'now', 'today', 'epoch', 'infinity';
--      JavaScript no. E 'now' rendeva falsa la dichiarazione IMMUTABLE della
--      funzione;
--   3. il **giorno**. '09/03/2026' e il 3 settembre per Postgres e il 9 marzo
--      per JavaScript, e '2026-03-09T12:00:00+02:00' era mezzogiorno per uno e
--      le dieci per l'altro -- due ore che a cavallo di dicembre spostano
--      l'anno fiscale.
--
-- Non c'era un'interpretazione giusta da scegliere fra le due. C'e una forma
-- sola che non ha bisogno di essere interpretata -- ISO 8601 -- e il resto non
-- e una data: ora entrambe le letture accettano quella e rifiutano tutto il
-- resto, e l'offset, quando c'e, lo onorano tutte e due allo stesso modo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. I centesimi che non alzano mai
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION easygame_centesimi(valore double precision)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  centesimi double precision;
BEGIN
  IF valore IS NULL THEN
    RETURN NULL;
  END IF;
  /* NaN non e uguale a se stesso, ed e il modo portabile di riconoscerlo. */
  IF valore <> valore THEN
    RETURN NULL;
  END IF;
  IF valore = 'Infinity'::double precision
     OR valore = '-Infinity'::double precision THEN
    RETURN NULL;
  END IF;

  centesimi := abs(floor(valore * 100::double precision + 0.5));
  IF centesimi > 2147483647::double precision THEN
    RETURN NULL;
  END IF;

  RETURN centesimi::int;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION easygame_centesimi(double precision) IS
  'I centesimi di un importo, o NULL se non si possono rappresentare. '
  'Una riga sola fuori scala non deve poter spegnere la prima nota di un club.';


-- ---------------------------------------------------------------------------
-- 1-bis. E la terza funzione, che era rimasta indietro
-- ---------------------------------------------------------------------------
--
-- easygame_blob_number e chiamata da entrambi i rami storici della vista e non
-- era stata ricreata: restava senza search_path fissato mentre le altre due lo
-- avevano. Nessuna delle tre tocca una tabella, quindi non c e un exploit --
-- ma una correzione a due terzi si legge come una correzione.

CREATE OR REPLACE FUNCTION easygame_blob_number(valore text)
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN valore::double precision;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. La data storica: la sola forma su cui le due letture concordano
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION easygame_blob_timestamp(valore text)
RETURNS timestamp(3)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  ripulito text;
  esito timestamp(3);
BEGIN
  IF valore IS NULL THEN
    RETURN NULL;
  END IF;
  ripulito := btrim(valore);
  IF ripulito = '' THEN
    RETURN NULL;
  END IF;

  /*
    Solo ISO 8601. Fuori di qui le due letture non divergono per un difetto
    dell'una: divergono perche stanno interpretando, e interpretano diverso.
  */
  /* L'anno zero non esiste qui e vale 1 a.C. in JavaScript: fuori da entrambe. */
  IF left(ripulito, 4) = '0000' THEN
    RETURN NULL;
  END IF;

  IF ripulito !~ '^\d{4}-\d{2}-\d{2}([T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$' THEN
    RETURN NULL;
  END IF;

  /*
    Quando l'offset c'e, si onora: e cio che fa JavaScript, e il registro parla
    in UTC. Il risultato non dipende dal fuso della sessione, perche l'offset e
    scritto nel dato -- la dichiarazione IMMUTABLE resta vera.
  */
  IF ripulito ~ '(Z|[+-]\d{2}:?\d{2})$' THEN
    esito := (ripulito::timestamptz AT TIME ZONE 'UTC')::timestamp(3);
  ELSE
    esito := ripulito::timestamp(3);
  END IF;

  /*
    **Non basta `isfinite`: l anno 10000 e finito.**

    `timestamp(3)` arrotonda, e `9999-12-31T23:59:59.9996` diventa
    `10000-01-01`. Postgres lo conserva volentieri; il convertitore di Prisma
    poi non lo sa rileggere e alza — quindi una riga sola cosi faceva cadere
    prima nota, rendiconto, export e saldi di quel club, che e esattamente il
    guasto che questa migrazione esiste per finire, raggiunto da una data
    invece che da un importo.
  */
  IF NOT isfinite(esito)
     OR EXTRACT(YEAR FROM esito) < 1
     OR EXTRACT(YEAR FROM esito) > 9999 THEN
    RETURN NULL;
  END IF;

  RETURN esito;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. I tre importi di dominio dichiarano quanto possono valere
-- ---------------------------------------------------------------------------
--
-- 21.474.836,47 euro e il piu grande importo che il registro sa mostrare. Non
-- e una scelta di prodotto: e il limite della colonna, e dirlo nel database e
-- il solo modo di impedire che ci arrivi qualcosa che poi non si puo leggere.

ALTER TABLE "payment_transactions"
  DROP CONSTRAINT IF EXISTS "payment_transactions_amount_scala_check";
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_amount_scala_check"
  CHECK (abs("amount") <= 21474836.47) NOT VALID;

ALTER TABLE "sport_work_outbound_transactions"
  DROP CONSTRAINT IF EXISTS "sport_work_outbound_scala_check";
ALTER TABLE "sport_work_outbound_transactions"
  ADD CONSTRAINT "sport_work_outbound_scala_check"
  CHECK (
    abs(COALESCE("net_amount", 0)) <= 21474836.47
    AND abs(COALESCE("gross_amount", 0)) <= 21474836.47
  ) NOT VALID;

ALTER TABLE "funding_settlements"
  DROP CONSTRAINT IF EXISTS "funding_settlements_scala_check";
ALTER TABLE "funding_settlements"
  ADD CONSTRAINT "funding_settlements_scala_check"
  CHECK (abs("amount") <= 21474836.47) NOT VALID;

/*
  **`NOT VALID` protegge il futuro senza scommettere il deploy sul passato.**

  Un `ADD CONSTRAINT` che valida prende `ACCESS EXCLUSIVE` e legge ogni riga
  gia scritta. La premessa di questa migrazione e che un importo fuori scala
  **possa gia esserci**: se c'e, la validazione fallisce, la migrazione
  fallisce, e — dato che ogni deploy esegue `prisma migrate deploy` — fallisce
  il deploy intero. Il rimedio sarebbe allora peggiore del guasto, perche il
  guasto toglie la contabilita a un club e questo la toglierebbe a tutti.

  Con `NOT VALID` il vincolo vale da subito su ogni scrittura nuova, e le
  righe vecchie restano dove sono — visibili, e non piu riproducibili. La
  validazione si tenta qui sotto, e se non passa lo **dice** invece di
  interrompere: chi legge i log sa che c'e una riga da correggere, e la vista
  intanto la tollera perche `easygame_centesimi` non alza mai.
*/
DO $$
DECLARE
  vincolo record;
BEGIN
  FOR vincolo IN
    SELECT unnest(ARRAY[
      'payment_transactions|payment_transactions_amount_scala_check',
      'sport_work_outbound_transactions|sport_work_outbound_scala_check',
      'funding_settlements|funding_settlements_scala_check'
    ]) AS riga
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        split_part(vincolo.riga, '|', 1),
        split_part(vincolo.riga, '|', 2)
      );
    EXCEPTION WHEN others THEN
      RAISE NOTICE
        'Il vincolo % non e stato validato, e vale comunque su ogni scrittura nuova. Se il motivo e una riga gia fuori scala va corretta; se e altro, lo dice il dettaglio: %',
        split_part(vincolo.riga, '|', 2), SQLERRM;
    END;
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. L'indice che il vincolo unico teneva in piedi
-- ---------------------------------------------------------------------------
--
-- receipts_transaction_id_key faceva due mestieri: l'unicita e la ricerca per
-- incasso. Togliendolo per renderlo parziale e rimasto solo il primo.

CREATE INDEX IF NOT EXISTS "receipts_transaction_id_idx"
  ON "receipts" ("transaction_id");


-- ---------------------------------------------------------------------------
-- 5. Il registro, con i cast resi totali e la data di ripiego corretta
-- ---------------------------------------------------------------------------

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

