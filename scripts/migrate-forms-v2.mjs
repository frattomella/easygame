#!/usr/bin/env node
/**
 * Travaso dei moduli online dalla prima versione alla Modulistica V2.
 *
 * **Cosa fa.** Legge `clubs.document_templates`, prende gli oggetti di tipo
 * `online_form` e `online_form_submission`, e li scrive nelle tabelle
 * `form_templates`, `form_template_versions` e `form_submissions`.
 *
 * **Cosa non fa, di proposito.**
 *
 * - non cancella nulla da `clubs.document_templates`. Il travaso e una copia:
 *   se qualcosa va storto si rilancia, e finche non lo si cancella a mano il
 *   dato di partenza e ancora li. La cancellazione e una decisione separata,
 *   da prendere dopo aver verificato il risultato;
 * - non tocca i file. Gli allegati dei moduli legacy stanno nella tabella
 *   `assets` e ci restano: la compilazione migrata li cita con un riferimento
 *   `asset:<id>` che `resolveSubmissionFileUrl` sa gia risolvere. Travasare
 *   dei binari e un'operazione a se, con un rischio suo;
 * - non scrive niente in modalita predefinita. Senza `--apply` stampa e basta.
 *
 * **Idempotente.** Un modulo si riconosce dallo slug pubblico, che e unico;
 * una compilazione da un identificativo derivato dal suo contenuto. Rilanciare
 * lo script non duplica nulla.
 *
 * Uso:
 *   node scripts/migrate-forms-v2.mjs                  # anteprima
 *   node scripts/migrate-forms-v2.mjs --apply          # scrive
 *   node scripts/migrate-forms-v2.mjs --club <uuid>    # un solo club
 *
 * **Richiede autorizzazione esplicita**: e una scrittura sul database e la
 * guardia di `scripts/db-guard.mjs` non copre gli script invocati a mano
 * (vedi CLAUDE.md, sezione 8).
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const loadEnvFile = (fileName) => {
  const filePath = path.join(projectRoot, fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const clubFilter = (() => {
  const index = args.indexOf("--club");
  return index >= 0 ? String(args[index + 1] || "").trim() : "";
})();

/* ------------------------------------------------------- conversione */

/**
 * I tipi di campo della prima versione che nella seconda non esistono piu.
 *
 * Nessuno di questi perde una funzione: un divisore e una sezione senza
 * titolo, un link video e un testo breve, un consenso e una casella da
 * spuntare obbligatoria con una descrizione.
 */
const LEGACY_FIELD_TYPES = {
  image: "file_upload",
  video: "short_text",
  divider: "section",
  consent: "checkbox",
};

const KNOWN_FIELD_TYPES = new Set([
  "short_text",
  "long_text",
  "number",
  "date",
  "email",
  "phone",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "checkbox",
  "file_upload",
  "signature",
  "section",
]);

const asText = (value) => String(value ?? "").trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const HEX_SUFFIX = /-[0-9a-f]{12}$/;

/** Un identificativo stabile a partire da un testo: stesso testo, stesso id. */
const derivedUuid = (...parts) => {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};

const convertField = (legacyField, index) => {
  const record = isRecord(legacyField) ? legacyField : {};
  const rawType = asText(record.type);
  const type = KNOWN_FIELD_TYPES.has(rawType)
    ? rawType
    : LEGACY_FIELD_TYPES[rawType] || "short_text";

  const options = asArray(record.options).map(asText).filter(Boolean);
  const hasOptions =
    type === "single_choice" || type === "multiple_choice" || type === "dropdown";

  return {
    id: asText(record.id) || `f_legacy_${index}`,
    type,
    label: asText(record.label) || (type === "section" ? "Sezione" : "Domanda"),
    description: asText(record.description),
    required: type === "section" ? false : Boolean(record.required),
    placeholder: asText(record.placeholder),
    options: hasOptions ? options : [],
    /*
      Nessun campo legacy dichiarava a quale dato EasyGame corrispondesse:
      quell'informazione non esisteva. Si lascia vuoto e la si assegna a mano
      nel builder, dove si vede l'etichetta accanto al dato.
    */
    binding: "",
  };
};

const convertForm = (legacyForm) => {
  const record = isRecord(legacyForm) ? legacyForm : {};
  const title = asText(record.title) || "Modulo online";
  const legacySlug = asText(record.publicSlug || record.public_slug);

  return {
    legacyId: asText(record.id),
    title,
    description: asText(record.description),
    status: ["published", "archived"].includes(asText(record.status))
      ? asText(record.status)
      : "draft",
    /*
      Lo slug legacy si conserva com'e: i link gia mandati alle famiglie
      devono continuare a rispondere. Non ha il suffisso esadecimale dei
      moduli nuovi, ed e proprio per questo che lo script lo segnala.
    */
    publicSlug: legacySlug || `modulo-${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    slugIsGuessable: Boolean(legacySlug) && !HEX_SUFFIX.test(legacySlug),
    schema: {
      title,
      description: asText(record.description),
      fields: asArray(record.fields).map(convertField),
      settings: {
        successMessage:
          asText(record.settings?.successMessage) ||
          "Modulo inviato correttamente. Grazie!",
        closeAt: asText(record.settings?.closeAt),
        collectRespondentEmail: Boolean(record.settings?.collectEmail),
        notifyOnSubmit: record.settings?.notifyClubOnSubmit !== false,
      },
    },
    createdAt: asText(record.createdAt || record.created_at),
    updatedAt: asText(record.updatedAt || record.updated_at),
  };
};

const convertSubmission = (legacySubmission, fields) => {
  const record = isRecord(legacySubmission) ? legacySubmission : {};
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const rawAnswers = isRecord(record.answers) ? record.answers : {};

  const files = asArray(record.files)
    .map((rawFile) => {
      const file = isRecord(rawFile) ? rawFile : {};
      const assetId = asText(file.assetId || file.asset_id);
      if (!assetId) return null;

      return {
        fieldId: asText(file.fieldId || file.field_id),
        fieldLabel: asText(file.fieldLabel || file.field_label),
        fileName: asText(file.fileName || file.file_name) || "allegato",
        mimeType: asText(file.mimeType || file.mime_type) || "application/octet-stream",
        sizeBytes: Number(file.size) || 0,
        reference: `asset:${assetId}`,
      };
    })
    .filter(Boolean);

  const fileFieldIds = new Set(files.map((file) => file.fieldId));

  /*
    Il route pubblico della prima versione scriveva l'URL del file dentro le
    risposte. Nella seconda un allegato non e una risposta: si toglie, cosi
    la compilazione migrata non porta un URL al posto di un valore.
  */
  const answers = {};
  for (const [fieldId, value] of Object.entries(rawAnswers)) {
    const field = fieldById.get(fieldId);
    if (!field) continue;
    if (field.type === "section") continue;
    if (field.type === "file_upload" || field.type === "signature") continue;
    if (fileFieldIds.has(fieldId)) continue;
    answers[fieldId] = value;
  }

  const legacyStatus = asText(record.status);
  const status =
    legacyStatus === "approved"
      ? "approved"
      : legacyStatus === "rejected"
        ? "rejected"
        : "pending";

  return {
    legacyId: asText(record.id),
    status,
    answers,
    files,
    respondentName: asText(record.respondentName || record.respondent_name),
    respondentEmail: asText(record.respondentEmail || record.respondent_email),
    submittedAt: asText(record.submittedAt || record.submitted_at),
  };
};

/* ------------------------------------------------------------- travaso */

const prisma = new PrismaClient();

const run = async () => {
  const clubs = await prisma.club.findMany({
    where: clubFilter ? { id: clubFilter } : undefined,
    select: { id: true, name: true, document_templates: true },
  });

  let formsSeen = 0;
  let formsWritten = 0;
  let submissionsSeen = 0;
  let submissionsWritten = 0;
  const warnings = [];

  for (const club of clubs) {
    const items = asArray(club.document_templates);
    const legacyForms = items.filter(
      (item) => isRecord(item) && item.type === "online_form",
    );
    if (!legacyForms.length) continue;

    const legacySubmissions = items.filter(
      (item) => isRecord(item) && item.type === "online_form_submission",
    );

    for (const legacyForm of legacyForms) {
      formsSeen += 1;
      const form = convertForm(legacyForm);

      if (form.slugIsGuessable) {
        warnings.push(
          `${club.name}: «${form.title}» conserva il link legacy /forms/${form.publicSlug}, che non ha suffisso casuale. Ripubblicandolo dal builder ne riceve uno nuovo.`,
        );
      }

      const existing = await prisma.formTemplate.findUnique({
        where: { public_slug: form.publicSlug },
        select: { id: true, organization_id: true, published_version: true },
      });

      const templateId = existing?.id || derivedUuid(club.id, form.legacyId || form.publicSlug);
      const isPublished = form.status === "published";
      const versionId = derivedUuid(templateId, "v1");

      const related = legacySubmissions.filter(
        (submission) =>
          asText(submission.formId || submission.form_id) === form.legacyId,
      );

      console.log(
        `${apply ? "scrivo" : "vedrei"}  ${club.name} · «${form.title}» (${form.status}) · ${form.schema.fields.length} campi · ${related.length} compilazioni`,
      );

      if (apply && !existing) {
        await prisma.formTemplate.create({
          data: {
            id: templateId,
            organization_id: club.id,
            title: form.title,
            description: form.description || null,
            status: form.status,
            public_slug: form.publicSlug,
            public_enabled: true,
            draft: form.schema,
            published_version: isPublished ? 1 : 0,
            published_at: isPublished
              ? new Date(form.updatedAt || Date.now())
              : null,
          },
        });
        formsWritten += 1;
      }

      /*
        Una versione serve comunque: anche un modulo mai pubblicato puo avere
        raccolto risposte, e ogni compilazione deve citare la versione con cui
        e stata compilata. Se il modulo era in bozza si crea la versione 1
        senza dichiarare il modulo pubblicato.
      */
      const needsVersion = related.length > 0 || isPublished;

      if (apply && needsVersion) {
        await prisma.formTemplateVersion.upsert({
          where: { id: versionId },
          update: {},
          create: {
            id: versionId,
            organization_id: club.id,
            template_id: templateId,
            version: 1,
            schema_json: form.schema,
            published_at: new Date(form.updatedAt || form.createdAt || Date.now()),
          },
        });
      }

      for (const legacySubmission of related) {
        submissionsSeen += 1;
        const submission = convertSubmission(
          legacySubmission,
          form.schema.fields,
        );
        const submissionId = derivedUuid(
          templateId,
          submission.legacyId || JSON.stringify(submission.answers),
          submission.submittedAt,
        );

        if (!apply) continue;

        const already = await prisma.formSubmission.findUnique({
          where: { id: submissionId },
          select: { id: true },
        });
        if (already) continue;

        await prisma.formSubmission.create({
          data: {
            id: submissionId,
            organization_id: club.id,
            template_id: templateId,
            version_id: versionId,
            source: "public",
            status: submission.status,
            subjects: [],
            answers: submission.answers,
            files: submission.files,
            respondent_name: submission.respondentName || null,
            respondent_email: submission.respondentEmail || null,
            submitted_at: new Date(submission.submittedAt || Date.now()),
          },
        });
        submissionsWritten += 1;
      }
    }
  }

  console.log("");
  console.log(`moduli trovati:        ${formsSeen}`);
  console.log(`moduli scritti:        ${apply ? formsWritten : "(anteprima)"}`);
  console.log(`compilazioni trovate:  ${submissionsSeen}`);
  console.log(
    `compilazioni scritte:  ${apply ? submissionsWritten : "(anteprima)"}`,
  );

  if (warnings.length) {
    console.log("");
    console.log("Da sapere:");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (!apply) {
    console.log("");
    console.log(
      "Nessuna scrittura eseguita. Rilancia con --apply per travasare davvero.",
    );
  }
};

run()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
