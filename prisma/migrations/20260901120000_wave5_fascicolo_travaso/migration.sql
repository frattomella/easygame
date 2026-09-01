-- ===========================================================================
-- Il travaso finisce: i byte in Attachment Core, e il legame con l'archivio
-- ===========================================================================
--
-- La migrazione `20260901100000_wave5_fascicolo_unico` ha portato il **fatto**
-- — richiesta e deposito — dentro le due tabelle nuove, e ha lasciato indietro
-- due cose che qui si chiudono.
--
-- ## 1. L'identificativo storico
--
-- Le righe travasate sono nate con un `id` nuovo, e le due rotte storiche
-- confrontano ancora l'identificativo che il documento aveva dentro
-- `athletes.data.sharedDocuments`. Senza un legame, un documento **gia
-- travasato** risultava «solo storico» — cioe in sola lettura — per sempre: il
-- travaso lo aveva salvato e nessuno riusciva piu a toccarlo.
--
-- La colonna `legacy_id` e la stessa soluzione gia adottata per gli eventi
-- (ADR-0098): un riferimento antico deve continuare a ritrovare la sua riga.
--
-- ## 2. I byte
--
-- Stavano nella tabella `Asset` come base64, e `Asset` **non ha**
-- `organization_id`: il confine multi-tenant era il prefisso di una stringa in
-- `path`. Attachment Core li vuole come `bytea`, con `checksum`, `mime_type` e
-- `size_bytes` — cioe con le tre cose che permettono di accorgersi che un file
-- e cambiato, di servirlo con il tipo giusto e di applicargli un limite.
--
-- **`Asset` sopravvive**: porta ancora il logo del club e gli allegati dei
-- moduli V1. Non e questa Wave a chiuderlo, ed e la ragione per cui W5-41
-- resta `EXTEND` e non `DONE`. Le righe travasate **non si cancellano**: un
-- travaso che perde qualcosa deve poter essere confrontato con l'originale.
--
-- ## Il conteggio, che e il gate di questa lane
--
--     SELECT count(*) FROM assets
--      WHERE bucket IN ('shared-documents', 'parent-documents');
--     SELECT count(*) FROM attachments WHERE owner_type = 'athlete'
--       AND category = 'shared_document';
--
-- Il secondo deve valere il primo meno gli `Asset` senza contenuto, che non
-- sono un file: sono una riga che ne cita uno mai caricato.

-- --------------------------------------------------------------------------
-- 1. L'identificativo storico
-- --------------------------------------------------------------------------

ALTER TABLE "document_requests" ADD COLUMN "legacy_id" TEXT;
ALTER TABLE "document_submissions" ADD COLUMN "legacy_id" TEXT;

CREATE INDEX "document_requests_organization_id_legacy_id_idx"
    ON "document_requests"("organization_id", "legacy_id");
CREATE INDEX "document_submissions_organization_id_legacy_id_idx"
    ON "document_submissions"("organization_id", "legacy_id");

/*
  Si riaggancia con la stessa chiave con cui il travaso precedente aveva
  inserito: soggetto, tipo di documento e titolo. Non e una chiave elegante ed e
  l'unica che le due esecuzioni condividono; la colonna che nasce qui esiste
  proprio perche non serva mai piu.
*/
UPDATE "document_requests" r
SET "legacy_id" = v."legacy_id"
FROM (
    SELECT
        a."organization_id",
        a."id"::text AS subject_id,
        COALESCE(NULLIF(d->>'documentKind', ''), NULLIF(d->>'document_kind', ''), NULLIF(d->>'type', ''), 'other') AS document_kind,
        COALESCE(NULLIF(d->>'title', ''), NULLIF(d->>'name', ''), 'Documento richiesto') AS title,
        NULLIF(d->>'id', '') AS legacy_id
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
    WHERE a."data" IS NOT NULL
) AS v
WHERE r."legacy_id" IS NULL
  AND r."organization_id" = v."organization_id"
  AND r."subject_kind" = 'athlete'
  AND r."subject_id" = v.subject_id
  AND r."document_kind" = v.document_kind
  AND r."title" = v.title
  AND v.legacy_id IS NOT NULL;

UPDATE "document_submissions" s
SET "legacy_id" = r."legacy_id"
FROM "document_requests" r
WHERE s."legacy_id" IS NULL
  AND s."request_id" = r."id"
  AND r."legacy_id" IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2. I byte, verso Attachment Core
-- --------------------------------------------------------------------------
--
-- Il collegamento fra il documento storico e il suo `Asset` passa da tre
-- strade, e si guardano tutte e tre perche il dato reale le usa tutte:
-- `assetId` esplicito, l'identificativo del documento che **e** quello
-- dell'asset, e l'indirizzo pubblico dentro `fileUrl`.

CREATE TEMPORARY TABLE "travaso_documenti" AS
SELECT
    a."organization_id",
    a."id"::text AS subject_id,
    NULLIF(d->>'id', '') AS legacy_id,
    asset."id" AS asset_id,
    COALESCE(NULLIF(asset."file_name", ''), NULLIF(d->>'fileName', ''), 'documento') AS file_name,
    COALESCE(NULLIF(asset."mime_type", ''), NULLIF(d->>'mimeType', ''), 'application/octet-stream') AS mime_type,
    decode(asset."data_base64", 'base64') AS content
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
JOIN "assets" asset
  ON asset."bucket" IN ('shared-documents', 'parent-documents')
 AND (
      asset."id"::text = COALESCE(d->>'assetId', d->>'asset_id', '')
   OR asset."id"::text = COALESCE(d->>'id', '')
   OR asset."public_url" = COALESCE(d->>'fileUrl', d->>'file_url', d->>'url', '')
 )
WHERE a."data" IS NOT NULL
  AND NULLIF(asset."data_base64", '') IS NOT NULL;

/*
  `md5` e la stessa forma di checksum che `attachments.ts` gia scrive: serve a
  riconoscere che due caricamenti sono lo stesso file, non a garantire niente
  contro un avversario.
*/
INSERT INTO "attachments" (
    "id", "organization_id", "owner_type", "owner_id", "category",
    "file_name", "mime_type", "size_bytes", "checksum",
    "storage_driver", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    t."organization_id",
    'athlete',
    t.subject_id,
    'shared_document',
    t.file_name,
    t.mime_type,
    octet_length(t.content),
    md5(t.content),
    'database',
    NOW(),
    NOW()
FROM "travaso_documenti" t
WHERE NOT EXISTS (
    SELECT 1 FROM "attachments" x
    WHERE x."organization_id" = t."organization_id"
      AND x."owner_type" = 'athlete'
      AND x."owner_id" = t.subject_id
      AND x."checksum" = md5(t.content)
);

INSERT INTO "attachment_blobs" ("attachment_id", "content")
SELECT x."id", t.content
FROM "attachments" x
JOIN "travaso_documenti" t
  ON t."organization_id" = x."organization_id"
 AND t.subject_id = x."owner_id"
 AND md5(t.content) = x."checksum"
WHERE x."category" = 'shared_document'
  AND NOT EXISTS (
      SELECT 1 FROM "attachment_blobs" b WHERE b."attachment_id" = x."id"
  );

-- Il deposito ritrova i suoi byte.
UPDATE "document_submissions" s
SET "attachment_id" = x."id"
FROM "travaso_documenti" t
JOIN "attachments" x
  ON x."organization_id" = t."organization_id"
 AND x."owner_id" = t.subject_id
 AND x."owner_type" = 'athlete'
 AND x."category" = 'shared_document'
 AND x."checksum" = md5(t.content)
WHERE s."attachment_id" IS NULL
  AND s."organization_id" = t."organization_id"
  AND s."subject_kind" = 'athlete'
  AND s."subject_id" = t.subject_id
  AND s."legacy_id" IS NOT DISTINCT FROM t.legacy_id;

DROP TABLE "travaso_documenti";
