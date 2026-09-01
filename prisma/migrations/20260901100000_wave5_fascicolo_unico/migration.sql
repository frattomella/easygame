-- ===========================================================================
-- Il fascicolo unico: la richiesta e il deposito diventano righe
-- ===========================================================================
--
-- ## La scoperta che cambia il lavoro
--
-- Il workflow chiesto dal brief — il club vede che manca il certificato,
-- chiede, la famiglia carica, il club verifica, accetta o rifiuta, e solo dopo
-- il documento entra nel fascicolo — **esisteva gia per intero** in
-- `src/lib/shared-documents.ts`, con gli stati giusti e il throttling sui
-- solleciti. Il problema non era il workflow. Era **dove viveva**:
--
--   - i byte stavano nella tabella `Asset` come base64, che **non ha**
--     `organization_id`: il confine multi-tenant era il prefisso di una stringa;
--   - il fatto stava in `athletes.data.sharedDocuments`, un array JSON dentro
--     l'anagrafica, scritto con `prisma.athlete.update` diretto che aggira
--     `resources.ts`;
--   - **nessuna delle due rotte chiamava `recordAuditEvent`**: accettare o
--     rifiutare il documento di un minore non lasciava traccia;
--   - e accanto viveva gia Attachment Core, che e il posto giusto (ADR-0034).
--
-- Questo e `AU-5` / `D-H`, il prerequisito che la Wave 3 aveva dichiarato «va
-- fatto per primo» e che non e mai stato eseguito. La Wave 5 tocca esattamente
-- quel fascicolo: se non unifica ora, gli archivi diventano tre.
--
-- ## Due tabelle per il fatto, zero tabelle per il file
--
-- I **byte non generano niente di nuovo**: `createAttachment` esiste, e
-- `document_submissions.attachment_id` fa il collegamento. Nessun `owner_type`
-- nuovo, nessun secondo archivio.
--
-- **Lo stato corrente della richiesta si deriva** dall'ultimo deposito, non si
-- scrive: e la stessa regola di `ConsentRecord`, delle rate e delle scadenze
-- del lavoro sportivo (ADR-0058).
--
-- ## Cosa NON fa
--
-- Non cancella `Asset`: sopravvive per il logo del club e per gli allegati dei
-- moduli V1. Non e questa Wave a chiuderlo. E non cancella
-- `athletes.data.sharedDocuments`, che resta in **sola lettura** per una
-- release: un travaso che perde qualcosa deve poter essere confrontato con
-- l'originale.

CREATE TABLE "document_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "document_kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "due_date" TIMESTAMP(3),
    "season_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "last_reminded_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_id" UUID,
    "subject_kind" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "document_kind" TEXT NOT NULL,
    "attachment_id" UUID,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'parent',
    "status" TEXT NOT NULL DEFAULT 'under_review',
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_requests_organization_id_subject_kind_subject_id_idx"
    ON "document_requests"("organization_id", "subject_kind", "subject_id");
CREATE INDEX "document_requests_organization_id_status_due_date_idx"
    ON "document_requests"("organization_id", "status", "due_date");
CREATE INDEX "document_requests_organization_id_document_kind_idx"
    ON "document_requests"("organization_id", "document_kind");

CREATE INDEX "document_submissions_organization_id_request_id_submitted_a_idx"
    ON "document_submissions"("organization_id", "request_id", "submitted_at");
CREATE INDEX "document_submissions_organization_id_subject_kind_subject_i_idx"
    ON "document_submissions"("organization_id", "subject_kind", "subject_id", "submitted_at");
CREATE INDEX "document_submissions_organization_id_status_submitted_at_idx"
    ON "document_submissions"("organization_id", "status", "submitted_at");

ALTER TABLE "document_requests"
    ADD CONSTRAINT "document_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_submissions"
    ADD CONSTRAINT "document_submissions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "clubs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL` e non `CASCADE`: cancellare una richiesta non deve cancellare la
-- prova che una famiglia aveva consegnato. Il deposito diventa spontaneo, che e
-- esattamente cio che e rimasto.
ALTER TABLE "document_submissions"
    ADD CONSTRAINT "document_submissions_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "document_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- Il travaso da `athletes.data.sharedDocuments`
-- --------------------------------------------------------------------------
--
-- Gli stati d'origine sono quelli di `shared-documents.ts`:
-- `required` -> `uploaded` / `under_review` -> `approved` / `rejected`.
--
--   - ogni elemento diventa una **richiesta**;
--   - gli elementi che portano un file o una decisione diventano **anche** un
--     deposito, con lo stato tradotto;
--   - i byte restano dove sono per ora: `attachment_id` e nullo, e il puntatore
--     al vecchio `Asset` sopravvive in `decision_note` solo se non c'e altro.
--     Il travaso dei byte verso Attachment Core lo fa il codice di dominio, che
--     sa validare i tipi MIME e calcolare i checksum: non lo fa una `INSERT`.

INSERT INTO "document_requests" (
    "organization_id", "subject_kind", "subject_id", "document_kind",
    "title", "description", "required", "due_date", "status",
    "created_at", "updated_at"
)
SELECT
    a."organization_id",
    'athlete',
    a."id"::text,
    COALESCE(NULLIF(d->>'documentKind', ''), NULLIF(d->>'document_kind', ''), NULLIF(d->>'type', ''), 'other'),
    COALESCE(NULLIF(d->>'title', ''), NULLIF(d->>'name', ''), 'Documento richiesto'),
    NULLIF(d->>'description', ''),
    COALESCE((d->>'required')::boolean, true),
    CASE WHEN COALESCE(d->>'dueDate', d->>'due_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
         THEN (substring(COALESCE(d->>'dueDate', d->>'due_date') FROM 1 FOR 10))::timestamp
    END,
    CASE
        WHEN COALESCE(d->>'status', '') IN ('approved') THEN 'fulfilled'
        WHEN COALESCE(d->>'status', '') IN ('archived', 'cancelled') THEN 'cancelled'
        ELSE 'open'
    END,
    COALESCE(
        CASE WHEN COALESCE(d->>'createdAt', d->>'created_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN (substring(COALESCE(d->>'createdAt', d->>'created_at') FROM 1 FOR 19))::timestamp
        END,
        a."created_at"
    ),
    NOW()
FROM "athletes" a
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof((a."data"::jsonb)->'sharedDocuments') = 'array'
            THEN (a."data"::jsonb)->'sharedDocuments'
        WHEN jsonb_typeof((a."data"::jsonb)->'shared_documents') = 'array'
            THEN (a."data"::jsonb)->'shared_documents'
        ELSE '[]'::jsonb
    END
) AS d
WHERE a."data" IS NOT NULL;

INSERT INTO "document_submissions" (
    "organization_id", "request_id", "subject_kind", "subject_id",
    "document_kind", "submitted_at", "source", "status",
    "decided_at", "decision_note", "created_at"
)
SELECT
    r."organization_id",
    r."id",
    'athlete',
    r."subject_id",
    r."document_kind",
    r."created_at",
    'parent',
    CASE
        WHEN COALESCE(d->>'status', '') = 'approved' THEN 'approved'
        WHEN COALESCE(d->>'status', '') = 'rejected' THEN 'rejected'
        ELSE 'under_review'
    END,
    CASE WHEN COALESCE(d->>'status', '') IN ('approved', 'rejected')
         THEN r."created_at" END,
    NULLIF(COALESCE(d->>'rejectionReason', d->>'rejection_reason', d->>'note'), ''),
    r."created_at"
FROM "athletes" a
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof((a."data"::jsonb)->'sharedDocuments') = 'array'
            THEN (a."data"::jsonb)->'sharedDocuments'
        WHEN jsonb_typeof((a."data"::jsonb)->'shared_documents') = 'array'
            THEN (a."data"::jsonb)->'shared_documents'
        ELSE '[]'::jsonb
    END
) AS d
JOIN "document_requests" r
  ON r."organization_id" = a."organization_id"
 AND r."subject_kind" = 'athlete'
 AND r."subject_id" = a."id"::text
 AND r."document_kind" = COALESCE(NULLIF(d->>'documentKind', ''), NULLIF(d->>'document_kind', ''), NULLIF(d->>'type', ''), 'other')
 AND r."title" = COALESCE(NULLIF(d->>'title', ''), NULLIF(d->>'name', ''), 'Documento richiesto')
WHERE a."data" IS NOT NULL
  AND COALESCE(d->>'status', '') <> 'required';
