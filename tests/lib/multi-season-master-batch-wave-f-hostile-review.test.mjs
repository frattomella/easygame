import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { generateInstallmentPreview } from "../../src/lib/payment-plan-utils.ts";

/**
 * MASTER BATCH — Wave F, revisione ostile: le correzioni ai difetti
 * Critical/High trovati dai cinque revisori in sola lettura.
 *
 * Iniziale: Critical 2 (B: categorie/gruppi numerazione della scheda atleta
 * senza perimetro di stagione; E: bomba d'archivio con metadati falsificabili),
 * High 5 (A: perimetro mancante su trial-history, activityStartAt che nasconde
 * presenze vere; B: gruppi numerazione della scheda senza perimetro di stagione;
 * D: data esatta di un piano riusabile che invecchia in silenzio; E: intestazioni
 * e piè di pagina mai importati e mai dichiarati), Medium 10, Low 7.
 * Finale: Critical 0, High 0, Medium e Low dichiarati (docs/knowledge-base/16-technical-debt.md).
 */

/* ── Reviewer B — Critical + High: categorie e gruppi numerazione della scheda atleta ── */

test("Critical (Reviewer B): la scheda atleta legge le categorie dal registro season-scoped, non da getClubCategories", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.doesNotMatch(source, /getClubCategories\(/, "getClubCategories non filtra per stagione: il selettore Categorie offriva anche le squadre di stagioni chiuse");
  assert.match(source, /apiRequest<any\[\]>\(`\/api\/v1\/categories\?organization_id=\$\{encodeURIComponent\(clubId\)\}`\)/);
});

test("High (Reviewer B): i gruppi numerazione della scheda atleta sono filtrati per stagione", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.match(source, /filterCollectionBySeason\("jersey_groups", tutteLeVoci, stagioniPerGruppi\.activeSeasonId,/);
});

/* ── Reviewer A — High: perimetro su trial-history, activityStartAt onesto ── */

test("High (Reviewer A): la rotta trial-history applica il perimetro di sede/categoria dell'atleta", () => {
  const source = readFileSync("src/app/api/v1/athletes/[id]/trial-history/route.ts", "utf8");
  assert.match(source, /athleteWithinAccessScope\(organizationId, context\.params\.id, scope\)/);
  assert.match(source, /status: 403/);
});

test("High (Reviewer A): senza una prova, activityStartAt non usa la nascita della riga come taglio", () => {
  const source = readFileSync("src/app/athletes/[id]/page.tsx", "utf8");
  assert.doesNotMatch(source, /activityStartAt\s*=\s*trialHistory\?\.activityStartAt \|\| athleteRecord\.created_at/);
  assert.match(source, /const activityStartAt = trialHistory\?\.activityStartAt \|\| null;/);
});

/* ── Reviewer D — High: una data esatta in un piano riusabile non invecchia in silenzio ── */

test("High (Reviewer D): una rata con scadenza gia passata blocca la conferma con un avviso esplicito", () => {
  const preview = generateInstallmentPreview(
    {
      installmentSchedule: [
        { id: "vecchia", amountType: "fixed", amount: 100, dueAfterDays: 0, dueDate: "2020-01-01" },
      ],
    },
    100,
    { startDate: "2026-09-01", now: "2026-09-21" },
  );
  assert.ok(
    preview.warnings.some((riga) => riga.includes("scadenza gia passata")),
    "una rata con data esatta nel passato deve produrre un avviso che blocca la conferma",
  );
});

test("High (Reviewer D): una rata futura non produce l'avviso di scadenza passata", () => {
  const preview = generateInstallmentPreview(
    {
      installmentSchedule: [
        { id: "futura", amountType: "fixed", amount: 100, dueAfterDays: 0, dueDate: "2027-01-01" },
      ],
    },
    100,
    { startDate: "2026-09-01", now: "2026-09-21" },
  );
  assert.ok(!preview.warnings.some((riga) => riga.includes("scadenza gia passata")));
});

/* ── Reviewer E — Critical + High: bomba d'archivio, intestazioni/piè di pagina ── */

test("Critical (Reviewer E): il vaglio della bomba d'archivio decomprime per davvero, non legge i metadati dichiarati", () => {
  const source = readFileSync("src/lib/server/docx-import.ts", "utf8");
  assert.doesNotMatch(source, /_data\?\.uncompressedSize/, "i metadati dello zip sono scritti da chi ha costruito l'archivio: non si contano piu");
  assert.match(source, /nodeStream\("nodebuffer"\)/, "il conteggio deve venire da un flusso decompresso per davvero");
});

test("High (Reviewer E): intestazioni e piè di pagina non importati sono dichiarati, non spariscono in silenzio", () => {
  const source = readFileSync("src/lib/server/docx-import.ts", "utf8");
  assert.match(source, /word\\\/\(header\|footer\)\\d\*\\\.xml/);
  assert.match(source, /Intestazione o piè di pagina del documento non importati/);
});

/* ── Debito dichiarato: nessuna azione qui, solo il fatto (Medium/Low, vedi 16-technical-debt.md) ── */

test("Debito dichiarato: D-RD-47 (concorrenza jersey_assignments) resta accurato dopo la revisione ostile", () => {
  const source = readFileSync("docs/knowledge-base/16-technical-debt.md", "utf8");
  assert.match(source, /D-RD-47/);
});
