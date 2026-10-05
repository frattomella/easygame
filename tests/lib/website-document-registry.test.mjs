import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  createSection,
  duplicateBlock,
  duplicateSection,
  insertBlock,
  isHiddenEverywhere,
  locateBlock,
  mergeSavedDocument,
  moveBlock,
  moveSectionBy,
  removeBlock,
  resetResponsiveToken,
  setResponsiveToken,
  toggleBlockVisibility,
  updateSection,
} from "../../src/lib/website/document/operations.ts";
import { emptyHistory, recordHistory, stepHistory, COALESCE_MS, HISTORY_LIMIT } from "../../src/lib/website/document/history.ts";
import { checkDocumentForPublish, normalizePageDocument } from "../../src/lib/website/document/validate.ts";
import { emptyPageDocument } from "../../src/lib/website/document/types.ts";
import {
  BLOCK_DEFINITIONS,
  createBlock,
  getBlockDefinition,
  isBlockAllowedOnPage,
  listPalette,
  normalizeBlockProps,
} from "../../src/lib/website/registry/index.ts";
import { collectPageRequests } from "../../src/lib/website/datasources/requests.ts";
import { resolveResponsive, responsiveSource, sectionGridClasses, visibilityClasses } from "../../src/lib/website/style-classes.ts";

/**
 * **ADR-0200 — il documento di una pagina e il registry dei blocchi.**
 *
 * Il documento e SITE → PAGE → SECTION → BLOCK e si cambia solo con
 * operazioni pure: qui si prova che duplicare copia con identificativi nuovi,
 * che un blocco si sposta anche fra sezioni, che togliere colonne non perde
 * blocchi, che gli scostamenti per dispositivo si scrivono e si ripristinano.
 * Il registry e uno: ogni definizione ha predefiniti validi per il suo schema,
 * controlli che nominano props esistenti, un'icona che l'editor sa disegnare.
 */

const twoSections = () => {
  const a = createBlock("heading", { text: "Uno" });
  const b = createBlock("rich-text");
  const c = createBlock("button");
  const first = createSection("two", [[a, b], []]);
  const second = createSection("one", [[c]]);
  return { doc: { schemaVersion: 1, sections: [first, second] }, a, b, c, first, second };
};

test("duplicare una sezione copia tutto con identificativi nuovi, subito dopo l'originale", () => {
  const { doc, first } = twoSections();
  const { doc: next, newId } = duplicateSection(doc, first.id);
  assert.equal(next.sections.length, 3);
  assert.equal(next.sections[1].id, newId);
  assert.notEqual(newId, first.id);
  const ids = next.sections.flatMap((section) => [section.id, ...section.columns.flatMap((column) => [column.id, ...column.blocks.map((block) => block.id)])]);
  assert.equal(new Set(ids).size, ids.length, "nessun identificativo ripetuto");
});

test("un blocco si sposta in un'altra sezione; nella stessa colonna l'indice si legge dopo averlo tolto", () => {
  const { doc, a, second } = twoSections();
  const moved = moveBlock(doc, a.id, { sectionId: second.id, columnId: second.columns[0].id, index: 0 });
  const location = locateBlock(moved, a.id);
  assert.equal(location.section.id, second.id);
  assert.equal(location.blockIndex, 0);
  assert.equal(moved.sections[0].columns[0].blocks.length, 1);

  const unknown = moveBlock(doc, a.id, { sectionId: "nessuna", columnId: "x", index: 0 });
  assert.equal(unknown, doc, "una destinazione che non esiste lascia il documento com'e");
});

test("ridurre le colonne di una sezione non perde i blocchi", () => {
  const { doc, first } = twoSections();
  const withBlockInSecond = insertBlock(doc, { sectionId: first.id, columnId: first.columns[1].id }, createBlock("spacer"));
  const narrowed = updateSection(withBlockInSecond, first.id, { layout: "one" });
  assert.equal(narrowed.sections[0].columns.length, 1);
  assert.equal(narrowed.sections[0].columns[0].blocks.length, 3);
});

test("duplicare, nascondere ed eliminare un blocco", () => {
  const { doc, b } = twoSections();
  const { doc: duplicated, newId } = duplicateBlock(doc, b.id);
  assert.equal(locateBlock(duplicated, newId).blockIndex, locateBlock(duplicated, b.id).blockIndex + 1);
  const hidden = toggleBlockVisibility(duplicated, b.id);
  assert.equal(isHiddenEverywhere(locateBlock(hidden, b.id).block.hidden), true);
  const onlyMobile = toggleBlockVisibility(duplicated, b.id, "mobile");
  assert.deepEqual(locateBlock(onlyMobile, b.id).block.hidden, { desktop: false, tablet: false, mobile: true });
  assert.equal(locateBlock(removeBlock(duplicated, b.id), b.id), null);
});

test("spostare una sezione oltre i bordi non fa niente", () => {
  const { doc, first, second } = twoSections();
  assert.equal(moveSectionBy(doc, first.id, -1), doc);
  assert.deepEqual(moveSectionBy(doc, first.id, 1).sections.map((section) => section.id), [second.id, first.id]);
});

test("gli scostamenti per dispositivo: si scrivono, si ereditano, si ripristinano", () => {
  let style = setResponsiveToken(undefined, "desktop", "paddingTop", "lg");
  style = setResponsiveToken(style, "mobile", "paddingTop", "sm");
  assert.equal(resolveResponsive(style.responsive, "paddingTop", "tablet"), "lg");
  assert.equal(resolveResponsive(style.responsive, "paddingTop", "mobile"), "sm");
  assert.equal(responsiveSource(style.responsive, "paddingTop", "tablet"), "desktop");
  assert.equal(responsiveSource(style.responsive, "paddingTop", "mobile"), "mobile");

  /* Scrivere il valore che si erediterebbe comunque non crea uno scostamento. */
  const same = setResponsiveToken(style, "tablet", "paddingTop", "lg");
  assert.equal(same.responsive.tablet, undefined);

  const reset = resetResponsiveToken(style, "mobile", "paddingTop");
  assert.equal(reset.responsive.mobile, undefined);
  assert.equal(resolveResponsive(reset.responsive, "paddingTop", "mobile"), "lg");
});

test("le classi: colonne che si riducono su tablet e mobile, visibilita per dispositivo", () => {
  const grid = sectionGridClasses(4, undefined);
  assert.match(grid, /grid-cols-1/);
  assert.match(grid, /md:grid-cols-2/);
  assert.match(grid, /lg:grid-cols-4/);
  assert.equal(visibilityClasses(undefined), "");
  assert.notEqual(visibilityClasses({ mobile: true }), "");
});

test("salvataggio in volo: se l'operatore ha scritto nel frattempo vince il locale, altrimenti il server", () => {
  const sent = emptyPageDocument();
  const saved = { ...emptyPageDocument(), sections: [] };
  assert.equal(mergeSavedDocument(sent, sent, saved), saved);
  const local = { ...sent, sections: [createSection("one")] };
  assert.equal(mergeSavedDocument(sent, local, saved), local);
});

test("cronologia: digitare e un passo, una modifica dopo l'annullamento apre un ramo, il limite tiene", () => {
  let history = emptyHistory();
  history = recordHistory(history, "a", "block:1:title", 1000);
  history = recordHistory(history, "ab", "block:1:title", 1000 + COALESCE_MS - 1);
  assert.equal(history.past.length, 1, "la digitazione si fonde nella prima voce");
  history = recordHistory(history, "abc", "op:2", 5000);
  assert.equal(history.past.length, 2);

  const undone = stepHistory(history, "undo", () => "abcd");
  assert.equal(undone.restore, "abc");
  assert.deepEqual(undone.history.future, ["abcd"]);
  const redone = stepHistory(undone.history, "redo", () => "abc");
  assert.equal(redone.restore, "abcd");

  const branched = recordHistory(undone.history, "x", "op:3", 9000);
  assert.equal(branched.future.length, 0);

  assert.equal(stepHistory(history, "undo", () => null), null, "una voce non piu applicabile non si applica");

  let long = emptyHistory();
  for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) long = recordHistory(long, index, `op:${index}`, index * 10_000);
  assert.equal(long.past.length, HISTORY_LIMIT);
});

test("il documento si ripulisce: tipi sconosciuti tolti, identificativi doppi rifatti, blocchi fuori pagina tolti", () => {
  const { doc: clean, issues } = normalizePageDocument(
    {
      sections: [
        {
          id: "s1",
          layout: "one",
          columns: [
            {
              id: "c1",
              blocks: [
                { id: "b1", type: "heading", props: { text: "Ciao" } },
                { id: "b1", type: "rich-text", props: {} },
                { id: "b3", type: "non-esiste", props: {} },
                { id: "b4", type: "article-body", props: {} },
              ],
            },
          ],
        },
      ],
    },
    "standard",
  );
  const blocks = clean.sections[0].columns[0].blocks;
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "rich-text"]);
  assert.notEqual(blocks[0].id, blocks[1].id);
  assert.equal(issues.length, 2);
});

test("la pubblicazione rifiuta un'immagine senza testo alternativo e due ancore uguali", () => {
  const image = createBlock("image", { image: { mediaId: "m1" } });
  const doc = {
    schemaVersion: 1,
    sections: [createSection("one", [[image]], { anchor: "x" }), createSection("one", [[]], { anchor: "x" })],
  };
  const issues = checkDocumentForPublish(doc, () => "");
  assert.ok(issues.some((issue) => issue.level === "error" && issue.blockId === image.id));
  assert.ok(issues.some((issue) => issue.level === "error" && /ancora/.test(issue.message)));
  assert.equal(checkDocumentForPublish({ schemaVersion: 1, sections: [createSection("one", [[image]])] }, () => "Una foto").length, 0);
});

test("registry: ogni definizione ha predefiniti validi, controlli su props esistenti e un'icona dell'editor", () => {
  const iconsSource = fs.readFileSync(path.join(process.cwd(), "src/components/website/editor/block-icons.tsx"), "utf8");
  for (const definition of BLOCK_DEFINITIONS) {
    const parsed = definition.schema.safeParse(definition.defaults);
    assert.ok(parsed.success, `${definition.type}: i predefiniti non passano lo schema`);
    for (const control of definition.controls) {
      assert.ok(control.key in definition.defaults, `${definition.type}: il controllo «${control.key}» non ha un predefinito`);
    }
    assert.ok(iconsSource.includes(`"${definition.icon}":`), `${definition.type}: l'icona «${definition.icon}» non e nell'editor`);
    const block = createBlock(definition.type);
    assert.equal(block.version, definition.version);
    assert.deepEqual(normalizeBlockProps(block), block.props);
  }
});

test("registry: ogni controllo riceve la forma che sa disegnare (collegamento, bottone, immagine, lista)", () => {
  /*
    Trovato nel collaudo a browser: otto controlli `link` erano legati a props
    `{ label, link }`. L'inspector mostrava «Seleziona» e, salvando, avrebbe
    sostituito il bottone con un collegamento nudo.
  */
  const shapeOk = {
    link: (value) => value && typeof value === "object" && typeof value.kind === "string",
    cta: (value) => value && typeof value === "object" && typeof value.label === "string" && typeof value.link?.kind === "string",
    "media-list": (value) => Array.isArray(value),
    list: (value) => Array.isArray(value),
    "multi-select": (value) => Array.isArray(value),
    "form-list": (value) => Array.isArray(value),
    "stat-keys": (value) => Array.isArray(value),
    toggle: (value) => typeof value === "boolean",
    number: (value) => typeof value === "number",
  };
  for (const definition of BLOCK_DEFINITIONS) {
    const props = normalizeBlockProps({ type: definition.type, version: definition.version, props: {} });
    for (const control of definition.controls) {
      const check = shapeOk[control.type];
      if (!check) continue;
      assert.ok(check(props[control.key]), `${definition.type}.${control.key}: il controllo «${control.type}» non riconosce ${JSON.stringify(props[control.key])}`);
    }
  }
});

test("registry: un blocco di dettaglio vive solo nella sua pagina, la tavolozza lo sa", () => {
  assert.equal(isBlockAllowedOnPage("article-body", "article_detail"), true);
  assert.equal(isBlockAllowedOnPage("article-body", "home"), false);
  const homeTypes = listPalette("home").flatMap((group) => group.blocks.map((block) => block.type));
  assert.ok(homeTypes.includes("hero"));
  assert.ok(!homeTypes.includes("article-body"));
  assert.equal(getBlockDefinition("non-esiste"), null);
  assert.ok(listPalette("home", "sponsor").every((group) => group.blocks.length > 0));
});

test("le richieste di dati di una pagina si deduplicano: due blocchi uguali, una lettura", () => {
  const one = createBlock("match-list", { limit: 5 });
  const two = createBlock("match-list", { limit: 5 });
  const three = createBlock("match-list", { limit: 8 });
  const doc = { schemaVersion: 1, sections: [createSection("one", [[one, two, three]])] };
  assert.equal(collectPageRequests([doc], {}).size, 2);
  const textOnly = { schemaVersion: 1, sections: [createSection("one", [[createBlock("heading")]])] };
  assert.equal(collectPageRequests([textOnly], {}).size, 0);
});
