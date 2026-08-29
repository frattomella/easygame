/**
 * Il travaso dei modelli di documento: da `clubs.document_templates` alle
 * tabelle della Wave 3.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *          scripts/migrate-document-templates.mjs [--dry-run] [--club=<uuid>]
 *
 * **E una copia, non uno spostamento.** La colonna JSON resta dov'e, esattamente
 * come e stato fatto per i moduli online (ADR-0039, debito `D28`): il dato di
 * partenza sopravvive finche qualcuno non decide di cancellarlo, e quella e una
 * decisione a se. Se il travaso avesse un difetto, il modello originale e
 * ancora li.
 *
 * **Idempotente.** Un modello gia travasato porta `legacy:<id>` in
 * `editorial_notes`, e alla seconda esecuzione viene saltato. Rieseguire lo
 * script non produce doppioni.
 *
 * ## Le due forme che trova nella colonna, e perche sono due
 *
 * La stessa colonna e stata scritta da due posti diversi con due forme diverse:
 *
 * - `/modulistica` scriveva `{ id, title, description, content }`;
 * - il CRUD generico su `document_templates` scriveva
 *   `{ id, name, payload: { title, content }, organization_id, ... }`.
 *
 * Un modello creato dall'API compariva quindi nella pagina senza titolo e senza
 * testo. Il travaso le riconosce entrambe: e proprio la ragione per cui questa
 * roba esce da un array JSON.
 *
 * ## Cosa succede a un modello che non si puo pubblicare
 *
 * Niente di brutto, e soprattutto niente di silenzioso. Un modello che nomina
 * segnaposto fuori catalogo — `{{fiscalCode}}`, `{{first_name}}`: sono quelli
 * che il vecchio «generatore IA» scriveva — **non viene pubblicato**: arriva
 * come **bozza**, con il motivo scritto in `editorial_notes`. Il club lo apre,
 * legge cosa non va e decide. Pubblicarlo lo avrebbe reso generabile con dei
 * campi bianchi per sempre.
 *
 * **Scrive** su `document_templates_v2` e `document_template_versions`. Non
 * tocca `clubs`.
 */

import { PrismaClient } from "@prisma/client";

import { getDocumentTemplatesFromClub } from "../src/lib/document-templates.ts";
import { validateTemplateDraft } from "../src/lib/documents/template-model.ts";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_CLUB =
  (args.find((arg) => arg.startsWith("--club=")) || "").split("=")[1] || "";

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (!DRY_RUN && DB_ENV !== "development" && DB_ENV !== "staging") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const asText = (value) => String(value ?? "").trim();

/**
 * Estrae titolo, descrizione e contenuto da una delle due forme.
 *
 * Restituisce `null` per cio che non e un modello di stampa: le voci di tipo
 * `online_form` le ha gia tolte `getDocumentTemplatesFromClub`, ma restano le
 * righe senza contenuto, che sono gusci vuoti creati e mai compilati.
 */
const readLegacyTemplate = (item) => {
  if (!item || typeof item !== "object") return null;

  const payload =
    item.payload && typeof item.payload === "object" ? item.payload : {};

  const id = asText(item.id);
  const title = asText(item.title || payload.title || item.name);
  const description = asText(item.description || payload.description);
  const content = String(item.content ?? payload.content ?? "");

  if (!id || !title) return null;
  if (!content.trim()) return null;

  return { id, title, description, content };
};

const main = async () => {
  const clubs = await prisma.club.findMany({
    where: ONLY_CLUB ? { id: ONLY_CLUB } : undefined,
    select: { id: true, name: true, document_templates: true },
  });

  let clubsSeen = 0;
  let found = 0;
  let migrated = 0;
  let published = 0;
  let asDraft = 0;
  let skipped = 0;
  let ignored = 0;

  for (const club of clubs) {
    const legacy = getDocumentTemplatesFromClub(club.document_templates);
    if (!legacy.length) continue;

    clubsSeen += 1;

    for (const item of legacy) {
      const template = readLegacyTemplate(item);
      if (!template) {
        ignored += 1;
        continue;
      }

      found += 1;

      const marker = `legacy:${template.id}`;
      const already = await prisma.documentTemplate.findFirst({
        where: {
          organization_id: club.id,
          editorial_notes: { contains: marker },
        },
        select: { id: true },
      });

      if (already) {
        skipped += 1;
        continue;
      }

      /*
        Il soggetto: `athlete` per tutti. E l'unico che il risolutore sa
        compilare, ed e quello che i modelli esistenti descrivono. Dedurlo dai
        segnaposto sarebbe indovinare — e un modello che nomina solo il club
        resta comunque valido come modello «atleta», perche le chiavi del club
        valgono per qualunque soggetto.
      */
      const validation = validateTemplateDraft({
        title: template.title,
        content: template.content,
        subjectKind: "athlete",
      });

      const notes = validation.ok
        ? marker
        : [
            marker,
            "Non pubblicato dal travaso della Wave 3:",
            ...validation.issues.map((issue) => `- ${issue.message}`),
          ].join("\n");

      if (DRY_RUN) {
        migrated += 1;
        if (validation.ok) published += 1;
        else asDraft += 1;
        console.log(
          `  ${validation.ok ? "PUBBLICA" : "BOZZA   "} ${club.name} — ${template.title}${
            validation.ok ? "" : ` (${validation.issues[0].message})`
          }`,
        );
        continue;
      }

      const created = await prisma.documentTemplate.create({
        data: {
          organization_id: club.id,
          title: template.title,
          description: template.description || null,
          subject_kind: "athlete",
          draft_content: template.content,
          status: "draft",
          published_version: 0,
          editorial_notes: notes,
        },
      });

      migrated += 1;

      if (!validation.ok) {
        asDraft += 1;
        continue;
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.documentTemplateVersion.create({
          data: {
            organization_id: club.id,
            template_id: created.id,
            version: 1,
            title: template.title,
            content_html: template.content,
            placeholder_keys: validation.placeholderKeys,
            sensitivity: validation.sensitivity,
            subject_kind: "athlete",
            published_at: now,
          },
        }),
        prisma.documentTemplate.update({
          where: { id: created.id },
          data: {
            published_version: 1,
            published_at: now,
            status: "active",
          },
        }),
      ]);

      published += 1;
    }
  }

  console.log("");
  console.log(`Club con modelli:        ${clubsSeen}`);
  console.log(`Modelli trovati:         ${found}`);
  console.log(`Gusci vuoti ignorati:    ${ignored}`);
  console.log(`Gia travasati, saltati:  ${skipped}`);
  console.log(`Travasati:               ${migrated}`);
  console.log(`  di cui pubblicati:     ${published}`);
  console.log(`  di cui lasciati bozza: ${asDraft}`);
  if (DRY_RUN) console.log("\n(prova a vuoto: niente e stato scritto)");

  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
