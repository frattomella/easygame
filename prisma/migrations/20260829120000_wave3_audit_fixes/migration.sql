-- Wave 3 / remediation dell'audit di fine Wave.
--
-- Due vincoli che l'audit ostile ha dimostrato mancanti, entrambi con uno
-- scenario concreto e non con un sospetto.

-- ---------------------------------------------------- l'unicita del lotto
--
-- **Il difetto.** L'indice era
-- `(organization_id, batch_id, subject_kind, subject_id)`, **senza il
-- modello**. Due lotti che riusano lo stesso `batch_id` su modelli diversi
-- collidevano: la seconda generazione risolveva, rendeva la pagina, e poi
-- l'`upsert` restituiva **la riga del primo modello**. La rotta la metteva fra
-- i prodotti e rispondeva 201: chi chiamava credeva di aver generato una cosa
-- e ne aveva ottenuta un'altra.
--
-- Non serviva malizia. `buildSubmissionDocumentBatchId` produce
-- `form:<submission_id>` nello **stesso spazio dei nomi** dei lotti scelti dal
-- client: bastava che qualcuno occupasse quella cella prima dell'approvazione
-- di un modulo.
DROP INDEX IF EXISTS "generated_documents_organization_id_batch_id_subject_kind_s_key";

CREATE UNIQUE INDEX "generated_documents_organization_id_batch_id_template_id_s_key"
    ON "generated_documents" ("organization_id", "batch_id", "template_id", "subject_kind", "subject_id");

-- ------------------------------------------------ l'adozione dal catalogo
--
-- **Il difetto.** Il controllo «gia adottata» era una lettura seguita da una
-- scrittura: due `POST` ravvicinati — un doppio clic sul pulsante «Adotta» —
-- producevano **due** modelli con la stessa voce di catalogo, entrambi
-- pubblicati. L'elenco ne mostrava uno solo, e l'altro restava li senza che
-- nessuno sapesse spiegarlo.
--
-- L'indice e **parziale**: `catalog_key` e nullo per tutti i modelli scritti
-- dal club, e quelli devono restare liberi di chiamarsi come vogliono.
DROP INDEX IF EXISTS "document_templates_v2_organization_id_catalog_key_idx";

CREATE UNIQUE INDEX "document_templates_v2_organization_id_catalog_key_key"
    ON "document_templates_v2" ("organization_id", "catalog_key")
    WHERE "catalog_key" IS NOT NULL;
