-- Wave 4 / la barriera: la catena finanziaria prende un pavimento.
--
-- Un commit solo, prima che le lane si aprano, perche queste cose non si
-- possono decidere una per volta: lo schema, i vincoli che lo difendono, il
-- travaso dei conti che oggi vivono in un blob JSON.
--
-- **Il principio che governa tutto cio che segue**, e che va letto prima delle
-- tabelle: una riga di prima nota non e mai la fonte di un numero che un altro
-- dominio possiede. E la sua proiezione datata e classificata. Se i due
-- divergono, ha ragione il dominio.
--
-- Da qui discende cosa **non** c'e qui dentro: nessuna tabella che
-- materializzi incassi, compensi o contributi. Quelli hanno gia un
-- proprietario canonico, e copiarli sarebbe la seconda contabilita che il
-- committente ha vietato.

-- ==========================================================================
-- 1. I CONTI FINANZIARI
-- ==========================================================================
--
-- Esistevano a meta: `clubs.bank_accounts` era un blob JSON, e
-- `sport_work_outbound_transactions.bank_account_id` era una colonna vera che
-- puntava a quegli id **senza foreign key**.
--
-- Il difetto che conta non e la forma, e il saldo: `current_balance` non era
-- calcolato, era mutato a mano dal browser con una seconda chiamata HTTP non
-- transazionale. Un incasso registrato dalla scheda atleta non toccava nessun
-- saldo; due utenti in contemporanea e l'ultimo vinceva.
--
-- Qui il saldo **non e una colonna**. E la somma dei movimenti.
CREATE TABLE "financial_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "iban" TEXT,
    "bank_name" TEXT,
    "site_id" TEXT,
    -- Il saldo che il blob dichiarava il giorno del travaso, con la sua data.
    -- E l'unico modo onesto di conservarlo: i movimenti che l'hanno prodotto
    -- nessuno puo ricostruirli.
    "opening_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "opening_balance_at" TIMESTAMP(3),
    "legacy_account_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_accounts_organization_id_name_key"
    ON "financial_accounts"("organization_id", "name");
CREATE INDEX "financial_accounts_organization_id_idx"
    ON "financial_accounts"("organization_id");
CREATE INDEX "financial_accounts_organization_id_is_archived_idx"
    ON "financial_accounts"("organization_id", "is_archived");

ALTER TABLE "financial_accounts"
    ADD CONSTRAINT "financial_accounts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- I tre tipi, e non uno di piu. `CLEARING` non e un vezzo: il denaro incassato
-- online non e in banca il giorno dell'incasso, e il versamento arriva dopo, al
-- netto delle commissioni. Senza un conto di transito, o il saldo banca e
-- sbagliato per giorni, o le commissioni spariscono.
ALTER TABLE "financial_accounts"
    ADD CONSTRAINT "financial_accounts_kind_check"
    CHECK ("kind" IN ('CASH', 'BANK', 'CLEARING'));

-- Un conto travasato dal blob non si travasa due volte.
CREATE UNIQUE INDEX "financial_accounts_legacy_unico"
    ON "financial_accounts"("organization_id", "legacy_account_id")
    WHERE "legacy_account_id" IS NOT NULL;

-- ==========================================================================
-- 2. LA PRIMA NOTA
-- ==========================================================================
--
-- Qui vive **solo** cio che oggi sta in `clubs.transactions` e
-- `clubs.transfers`: il movimento di cassa registrato a mano e il giroconto.
--
-- La domanda del brief era «EXTEND MOVEMENTS o NEW ACCOUNTING MODULE», e
-- presupponeva che ci fosse qualcosa da estendere. Non c'era: nessuna tabella
-- `movements`, nessuna rotta, nessun modulo proprietario. Cinque colonne JSON
-- su `clubs` e un aggregatore da 1.556 righe che gira nel browser.
--
-- La scelta e stata la terza: **una tabella per cio che oggi e un blob, e una
-- proiezione per il resto**. E il modello che il lavoro sportivo usa gia, con
-- successo.
CREATE TABLE "accounting_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "season_id" TEXT,
    "direction" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "financial_account_id" UUID NOT NULL,
    "operation_type_id" UUID,
    "operation_type_code" TEXT,
    "activity_scope_snapshot" TEXT NOT NULL DEFAULT 'unspecified',
    "operation_type_label_snapshot" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "payment_method" TEXT,
    "counterparty_kind" TEXT,
    "counterparty_id" TEXT,
    "counterparty_label" TEXT,
    "source_domain" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "source_event_key" TEXT,
    "document_kind" TEXT,
    "document_id" UUID,
    "site_id" TEXT,
    "reconciliation_status" TEXT NOT NULL DEFAULT 'unreconciled',
    "value_date" TIMESTAMP(3),
    "bank_reference" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" UUID,
    "transfer_group_id" UUID,
    "reversal_of_id" UUID,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" UUID,
    "reversal_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_entries_organization_id_entry_date_idx"
    ON "accounting_entries"("organization_id", "entry_date");
CREATE INDEX "accounting_entries_organization_id_fiscal_year_idx"
    ON "accounting_entries"("organization_id", "fiscal_year");
CREATE INDEX "accounting_entries_org_account_date_idx"
    ON "accounting_entries"("organization_id", "financial_account_id", "entry_date");
CREATE INDEX "accounting_entries_org_reconciliation_idx"
    ON "accounting_entries"("organization_id", "reconciliation_status");
CREATE INDEX "accounting_entries_org_source_idx"
    ON "accounting_entries"("organization_id", "source_domain", "source_id");
CREATE INDEX "accounting_entries_transfer_group_id_idx"
    ON "accounting_entries"("transfer_group_id");
CREATE INDEX "accounting_entries_reversal_of_id_idx"
    ON "accounting_entries"("reversal_of_id");
CREATE INDEX "accounting_entries_operation_type_id_idx"
    ON "accounting_entries"("operation_type_id");

ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- **`RESTRICT` e non `CASCADE`, ed e il punto.** Un conto con movimenti non si
-- cancella: si archivia. Cancellarlo porterebbe via il denaro che ci e passato,
-- ed e esattamente il difetto D-1 con un altro nome.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_financial_account_id_fkey"
    FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una causale usata da un movimento non si cancella. Si disattiva: la riga
-- passata deve poter continuare a dire da cosa nasceva.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_operation_type_id_fkey"
    FOREIGN KEY ("operation_type_id") REFERENCES "fiscal_operation_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "accounting_entries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------- gli invarianti
--
-- Sono qui e non solo nel servizio perche il servizio si puo aggirare: uno
-- script, una console, una rotta futura scritta da qualcun altro. Un vincolo
-- di database e l'unica regola che vale anche per chi non ha letto il codice.

-- **Il segno lo dice il verso.** L'importo e sempre positivo, e una riga da
-- zero euro non e un movimento: e una riga che qualcuno ha dimenticato di
-- compilare, e che sporcherebbe ogni conteggio.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_importo_check"
    CHECK ("amount_cents" > 0);

ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_verso_check"
    CHECK ("direction" IN ('IN', 'OUT'));

-- Un anno fuori scala e un dato che non si potra piu attribuire a nessun
-- esercizio. Lo stesso vincolo che il lavoro sportivo ha gia.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_anno_check"
    CHECK ("fiscal_year" BETWEEN 2000 AND 2200);

-- **L'anno fiscale non si digita: e l'anno solare della data del fatto.**
-- Scriverlo diverso vorrebbe dire mettere un movimento di gennaio 2027 nel
-- riepilogo del 2026, e il vincolo esiste perche nessuna riga possa farlo,
-- nemmeno per errore di un chiamante.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_anno_coerente_check"
    CHECK ("fiscal_year" = EXTRACT(YEAR FROM "entry_date"));

ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_riconciliazione_check"
    CHECK ("reconciliation_status" IN ('unreconciled', 'reconciled', 'disputed'));

-- Il catalogo chiuso delle origini. Le righe di questa tabella nascono
-- `MANUAL`, `INTERNAL_TRANSFER` o `REVERSAL`; gli altri valori esistono perche
-- la proiezione dei domini parli la stessa lingua, e perche un giorno una
-- migrazione possa portarne qui una senza inventare una stringa.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_origine_check"
    CHECK ("source_domain" IN (
        'MANUAL',
        'INTERNAL_TRANSFER',
        'REVERSAL',
        'ATHLETE_PAYMENT',
        'FUNDING_SETTLEMENT',
        'SPORT_WORK_PAYOUT',
        'SPONSOR_PAYMENT',
        'REFUND'
    ));

-- **Un giroconto ha due gambe, sempre.** Il gruppo e cio che le tiene insieme:
-- senza, il rendiconto non saprebbe che quei due movimenti sono lo stesso
-- fatto, e li conterebbe come un'entrata e un'uscita vere.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_giroconto_check"
    CHECK (
        ("source_domain" = 'INTERNAL_TRANSFER' AND "transfer_group_id" IS NOT NULL)
        OR ("source_domain" <> 'INTERNAL_TRANSFER' AND "transfer_group_id" IS NULL)
    );

-- Uno storno e una riga che punta a un'altra riga: senza il riferimento non
-- compensa niente, e con il riferimento su una riga che non e uno storno il
-- collegamento non vuol dire nulla. Il gemello del vincolo del lavoro sportivo.
ALTER TABLE "accounting_entries"
    ADD CONSTRAINT "accounting_entries_storno_coerente_check"
    CHECK (
        ("source_domain" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL)
        OR ("source_domain" <> 'REVERSAL' AND "reversal_of_id" IS NULL)
    );

-- **Niente doppio storno.** Stornare due volte la stessa riga produrrebbe un
-- movimento che nessuno ha mai fatto: il saldo del conto si muoverebbe di un
-- importo intero in piu. E il gemello di `sport_work_storno_unico` e di
-- `payment_transactions_storno_unico`.
CREATE UNIQUE INDEX "accounting_entries_storno_unico"
    ON "accounting_entries"("reversal_of_id")
    WHERE "reversal_of_id" IS NOT NULL;

-- **Idempotenza: lo stesso fatto, una sola rappresentazione finanziaria.**
--
-- E la condizione che il brief impone a ogni integrazione dominio -> prima
-- nota, ed e qui e non nel servizio perche due richieste simultanee superano
-- qualunque controllo scritto come «leggi, poi scrivi».
CREATE UNIQUE INDEX "accounting_entries_evento_unico"
    ON "accounting_entries"("organization_id", "source_domain", "source_event_key")
    WHERE "source_event_key" IS NOT NULL;

-- ==========================================================================
-- 3. IL REGISTRO DEGLI EVENTI DEL SOCIO
-- ==========================================================================
--
-- L'anagrafica del socio non si tocca: resta in `clubs.members`. Questo le
-- nasce accanto, ed e la differenza fra un elenco e un libro — un elenco dice
-- com'e il socio oggi, un libro sa dire chi era socio il 12 marzo 2026.
--
-- Non e solo una preferenza: la decommercializzazione di un'entrata dipende
-- dalla qualifica della controparte **al momento dell'operazione**. Se il
-- modello conserva solo lo stato corrente, quella classificazione non e piu
-- ricostruibile a posteriori, ed e esattamente cio che un verificatore chiede.
CREATE TABLE "membership_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "member_id" TEXT NOT NULL,
    "member_label" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "resolution_reference" TEXT,
    "resolution_date" TIMESTAMP(3),
    "reason" TEXT,
    "membership_number" TEXT,
    "notes" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "membership_events_org_member_date_idx"
    ON "membership_events"("organization_id", "member_id", "effective_date");
CREATE INDEX "membership_events_org_type_idx"
    ON "membership_events"("organization_id", "event_type");

ALTER TABLE "membership_events"
    ADD CONSTRAINT "membership_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_events"
    ADD CONSTRAINT "membership_events_tipo_check"
    CHECK ("event_type" IN (
        'ADMISSION',
        'RESIGNATION',
        'EXPULSION',
        'LAPSE',
        'REINSTATEMENT'
    ));

-- **Un socio si ammette una volta sola.** Una riammissione dopo una cessazione
-- e un evento diverso e ha il suo tipo: due ammissioni per la stessa persona
-- vorrebbero dire due date di ingresso, e il libro non saprebbe quale usare.
CREATE UNIQUE INDEX "membership_events_ammissione_unica"
    ON "membership_events"("organization_id", "member_id")
    WHERE "event_type" = 'ADMISSION';

-- **Il numero di tessera non si digita, e non si ripete.** Prima era un campo
-- di testo libero: due segreterie potevano assegnare lo stesso numero e nessuno
-- se ne accorgeva.
CREATE UNIQUE INDEX "membership_events_numero_unico"
    ON "membership_events"("organization_id", "membership_number")
    WHERE "membership_number" IS NOT NULL;

-- ==========================================================================
-- 4. LA CAUSALE: I DUE FLAG CHE IL DOCUMENTO 30 CHIAMA «IL PERNO»
-- ==========================================================================
--
-- `fiscal_operation_types` esisteva gia, ed era piu ricca di come il documento
-- 30 la descriveva: aliquota, natura IVA, ambito di attivita, rotta
-- documentale, e un catalogo di nove voci seminabili. G-09 e quindi un EXTEND
-- di poche colonne, non una tabella nuova.
--
-- **I due flag nascono `NULL` e non `false`.** Dire «questa quota non e
-- detraibile» quando nessuno l'ha stabilito e una risposta sbagliata che
-- sembra compilata; un valore non dichiarato si vede che manca.
ALTER TABLE "fiscal_operation_types" ADD COLUMN "direction_hint" TEXT;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "reporting_bucket" TEXT;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "default_description" TEXT;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "deductible" BOOLEAN;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "is_membership_fee" BOOLEAN;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "classified_by" UUID;
ALTER TABLE "fiscal_operation_types" ADD COLUMN "classified_at" TIMESTAMP(3);

ALTER TABLE "fiscal_operation_types"
    ADD CONSTRAINT "fiscal_operation_types_verso_check"
    CHECK ("direction_hint" IS NULL OR "direction_hint" IN ('IN', 'OUT'));

-- ==========================================================================
-- 5. IL CONTO SUGLI ALTRI DOMINI
-- ==========================================================================
--
-- Nessuno di questi domini viene riscritto. Ognuno impara **una cosa sola**:
-- su quale conto il denaro si e mosso. Senza, il saldo di cassa resta una
-- cifra che nessuna somma puo confermare.

ALTER TABLE "payment_transactions" ADD COLUMN "financial_account_id" UUID;
ALTER TABLE "payment_transactions" ADD COLUMN "counterparty_kind" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN "counterparty_id" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN "counterparty_label" TEXT;

CREATE INDEX "payment_transactions_financial_account_id_idx"
    ON "payment_transactions"("financial_account_id");

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_financial_account_id_fkey"
    FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- La controparte generica sulla rata: un socio che versa la quota associativa,
-- uno sponsor che paga una tranche. `athlete_id` resta dov'e, e nessuna riga
-- esistente cambia: non e una migrazione distruttiva, e un secondo modo di
-- dire chi deve.
ALTER TABLE "payments" ADD COLUMN "counterparty_kind" TEXT;
ALTER TABLE "payments" ADD COLUMN "counterparty_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "counterparty_label" TEXT;

-- Il registro delle uscite del lavoro sportivo aveva gia `bank_account_id`, e
-- il servizio lo scriveva: nessuna superficie lo compilava, e i tre metodi
-- dell'agenda non lo accettavano nemmeno nella firma. La colonna resta per le
-- righe vecchie; il riferimento buono ha una foreign key.
ALTER TABLE "sport_work_outbound_transactions" ADD COLUMN "financial_account_id" UUID;

CREATE INDEX "sport_work_outbound_financial_account_id_idx"
    ON "sport_work_outbound_transactions"("financial_account_id");

ALTER TABLE "sport_work_outbound_transactions"
    ADD CONSTRAINT "sport_work_outbound_financial_account_id_fkey"
    FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==========================================================================
-- 6. LA LIQUIDAZIONE DEL BANDO: IL CONTO, E LO STORNO CHE NON C'ERA
-- ==========================================================================
--
-- Un bonifico dell'ente era invisibile nel saldo, e una liquidazione registrata
-- per errore **non aveva rimedio**: l'accrual diventava `settled`, non si
-- riscriveva piu, non si confermava piu, e l'iscrizione non si cancellava piu.
-- L'errore non solo restava: propagava.
ALTER TABLE "funding_settlements" ADD COLUMN "financial_account_id" UUID;
ALTER TABLE "funding_settlements" ADD COLUMN "reversal_of_id" UUID;
ALTER TABLE "funding_settlements" ADD COLUMN "reversed_at" TIMESTAMP(3);
ALTER TABLE "funding_settlements" ADD COLUMN "reversed_by" UUID;
ALTER TABLE "funding_settlements" ADD COLUMN "reversal_reason" TEXT;

CREATE INDEX "funding_settlements_financial_account_id_idx"
    ON "funding_settlements"("financial_account_id");
CREATE INDEX "funding_settlements_reversal_of_id_idx"
    ON "funding_settlements"("reversal_of_id");

ALTER TABLE "funding_settlements"
    ADD CONSTRAINT "funding_settlements_financial_account_id_fkey"
    FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "funding_settlements"
    ADD CONSTRAINT "funding_settlements_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "funding_settlements"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Niente doppio storno, anche qui.
CREATE UNIQUE INDEX "funding_settlements_storno_unico"
    ON "funding_settlements"("reversal_of_id")
    WHERE "reversal_of_id" IS NOT NULL;

-- ==========================================================================
-- 7. IMPONIBILE E IMPOSTA SUI DOCUMENTI
-- ==========================================================================
--
-- Non esistevano: fatture e ricevute avevano un solo `amount`, e nessuno poteva
-- dire quanta parte fosse IVA.
--
-- Sono un **dato**, non un motore. EasyGame li conserva e li espone; non li usa
-- per liquidazioni periodiche, saldi per cassa o detraibilita, che sono regole
-- di classe C e richiedono una validazione professionale che non c'e stata.
ALTER TABLE "invoices" ADD COLUMN "taxable_amount_cents" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "vat_amount_cents" INTEGER;
ALTER TABLE "receipts" ADD COLUMN "taxable_amount_cents" INTEGER;
ALTER TABLE "receipts" ADD COLUMN "vat_amount_cents" INTEGER;

-- **Una fattura per incasso, e una sola.**
--
-- Le ricevute lo avevano gia (`transaction_id` unique) e le fatture no:
-- l'idempotenza era solo applicativa — leggi, poi scrivi — e due richieste
-- simultanee producevano **due fatture con due numeri** per lo stesso incasso.
-- Su un documento fiscale numerato non e un fastidio: e una doppia numerazione.
CREATE UNIQUE INDEX "invoices_transaction_unico"
    ON "invoices"("transaction_id")
    WHERE "transaction_id" IS NOT NULL;

-- ==========================================================================
-- 8. IL TRAVASO DEI CONTI
-- ==========================================================================
--
-- I conti che oggi vivono in `clubs.bank_accounts` diventano righe. Il saldo
-- dichiarato nel blob diventa **saldo di apertura**, con la data del travaso:
-- e l'unico modo onesto di conservarlo, perche i movimenti che l'hanno
-- prodotto nessuno puo ricostruirli.
--
-- Il nome e la chiave naturale, ed e per questo che il travaso deduplica su di
-- esso: due conti omonimi nello stesso blob sono un errore di compilazione, non
-- due conti.
INSERT INTO "financial_accounts" (
    "id", "organization_id", "name", "kind", "iban", "bank_name",
    "opening_balance_cents", "opening_balance_at", "legacy_account_id",
    "is_archived", "notes", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    c."id",
    conto."name",
    CASE
        WHEN lower(coalesce(conto."kind", conto."type", '')) IN ('cash', 'cassa') THEN 'CASH'
        ELSE 'BANK'
    END,
    nullif(btrim(coalesce(conto."iban", '')), ''),
    nullif(btrim(coalesce(conto."bank_name", '')), ''),
    coalesce(round(conto."current_balance" * 100)::INTEGER, 0),
    CURRENT_TIMESTAMP,
    conto."id",
    coalesce(lower(coalesce(conto."status", 'active')) NOT IN ('active', 'attivo', ''), false),
    'Saldo di apertura travasato da clubs.bank_accounts il giorno della Wave 4.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "clubs" c
CROSS JOIN LATERAL (
    SELECT DISTINCT ON (btrim(voce."name"))
        voce."id",
        btrim(voce."name") AS "name",
        voce."kind",
        voce."type",
        voce."iban",
        voce."bank_name",
        voce."current_balance",
        voce."status"
    FROM jsonb_to_recordset(
        CASE
            WHEN jsonb_typeof(c."bank_accounts") = 'array' THEN c."bank_accounts"
            ELSE '[]'::jsonb
        END
    ) AS voce(
        "id" TEXT,
        "name" TEXT,
        "kind" TEXT,
        "type" TEXT,
        "iban" TEXT,
        "bank_name" TEXT,
        "current_balance" NUMERIC,
        "status" TEXT
    )
    WHERE nullif(btrim(coalesce(voce."name", '')), '') IS NOT NULL
    ORDER BY btrim(voce."name"), voce."id"
) conto;

-- I riferimenti che gia esistevano sul registro del lavoro sportivo puntavano
-- agli id del blob **senza foreign key**: ora che i conti sono righe, quelli
-- che combaciano si agganciano. Quelli che non combaciano restano `NULL`, ed e
-- il comportamento giusto: inventare un conto per una riga vecchia
-- significherebbe attribuire denaro a una cassa che non l'ha mai visto.
UPDATE "sport_work_outbound_transactions" t
SET "financial_account_id" = a."id"
FROM "financial_accounts" a
WHERE a."organization_id" = t."organization_id"
  AND a."legacy_account_id" = t."bank_account_id"
  AND t."bank_account_id" IS NOT NULL
  AND t."financial_account_id" IS NULL;
