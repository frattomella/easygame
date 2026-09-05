import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **`events.manage` aveva il server e non aveva il pulsante** (PP-03 §11.1).
 *
 * La chiave e concessa a `trainer` nel catalogo, e il server la esegue: una
 * revisione ostile ha misurato che creare e spostare un evento di una
 * **propria** categoria rispondono 200, e che farlo su una categoria altrui
 * risponde 403. L'area allenatore offriva pero soltanto «Annulla» e
 * «Ripristina»: due dei tre verbi erano irraggiungibili per il ruolo che li
 * possiede, e `AddTrainingForm` / `AddMatchForm` vivono in `/training` e
 * `/matches`, che stanno in `MANAGEMENT_PATH_PREFIXES`.
 *
 * E l'errore n. 8 di [CLAUDE.md §11](../../CLAUDE.md) nella sua forma
 * canonica: la capability e completa e nessuna schermata sa accenderla.
 *
 * Le prove sono sul sorgente perche la proprieta e proprio quella — **il
 * pulsante esiste, e chiama la scrittura di dominio**. La meta comportamentale
 * sta nelle sonde (`pp-03-scrittura-evento-condiviso-probe.mjs`, 15/15) e nel
 * collaudo a schermo, dove l'allenatore ha creato l'allenamento del 12 settembre
 * e la riga in archivio porta il suo `created_by`.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EDITOR = "components/trainer/trainer-event-editor-dialog.tsx";

test("PP-03 §11.1 · le due pagine del calendario montano l'editor e offrono di creare", () => {
  for (const [pagina, etichetta] of [
    ["components/trainer/trainer-trainings-dashboard-page.tsx", "Nuovo allenamento"],
    ["components/trainer/trainer-matches-dashboard-page.tsx", "Nuova gara"],
  ]) {
    const sorgente = senzaCommenti(leggi(pagina));

    assert.ok(
      sorgente.includes("TrainerEventEditorDialog"),
      `${pagina} non monta l'editor: la chiave resta senza superficie`,
    );
    assert.ok(
      sorgente.includes(etichetta),
      `${pagina} non offre «${etichetta}»`,
    );
    assert.ok(
      sorgente.includes("Modifica"),
      `${pagina} non offre di modificare un evento gia in calendario`,
    );
  }
});

test("PP-03 §11.1 · la creazione e la modifica passano dalla scrittura di dominio", () => {
  const editor = senzaCommenti(leggi(EDITOR));

  assert.ok(
    /from "@\/lib\/events\/client"/.test(editor),
    "la scrittura di un evento passa da `events/client.ts`, cioe da POST/PATCH /api/v1/events (ADR-0098)",
  );
  assert.ok(
    editor.includes("createEvent(") && editor.includes("updateEvent("),
    "l'editor deve usare le due funzioni esistenti, non una seconda strada",
  );
  assert.ok(
    !/apiRequest\(/.test(editor) && !/fetch\(/.test(editor),
    "nessun trasporto proprio: CLAUDE.md §2 vuole un solo client HTTP",
  );
});

test("PP-03 §11.1 · l'editor propone soltanto le categorie assegnate", () => {
  const editor = senzaCommenti(leggi(EDITOR));

  assert.ok(
    editor.includes("assignedCategories"),
    "l'elenco delle squadre deve essere il perimetro di chi guarda, non tutte quelle del club",
  );
  assert.ok(
    !editor.includes("categories.map") || editor.includes("categorieAmmesse"),
    "l'elenco completo del club non deve arrivare al menu a tendina",
  );
});

test("PP-03 §11.1 · l'editor mostra per intero il messaggio del server", () => {
  /*
    Il server dice **quale** confine e stato toccato — «non e di una tua
    categoria», «il campo e chiuso», «questo evento ha gia una storia».
    Riscriverlo con una frase generica toglierebbe a chi compila l'unica
    informazione utile, e a schermo si e visto che e quella che risolve il
    dubbio.
  */
  const editor = senzaCommenti(leggi(EDITOR));

  assert.ok(
    /setErrore\(\s*String\(problema\?\.message/.test(editor),
    "il messaggio del server deve arrivare a schermo intero",
  );
});

test("PP-03 §11.1 · la modifica di un evento condiviso non ne perde le altre categorie", () => {
  /*
    `toEventColumns` ricompone `category_ids` da cio che riceve: se la modifica
    mandasse la sola primaria, un allenamento congiunto perderebbe le altre
    squadre — cioe proprio l'appropriazione che §7 ha chiuso lato server,
    rifatta dal browser in buona fede.
  */
  const editor = senzaCommenti(leggi(EDITOR));

  assert.ok(
    editor.includes("inModifica") && editor.includes("categoryIds"),
    "in modifica l'elenco delle categorie esistenti va conservato",
  );
});

test("PP-03 §11.1 · la leva del club dice cosa governa davvero", () => {
  const permessi = senzaCommenti(
    leggi("components/permissions/trainer-permissions-page.tsx"),
  );

  const voce = permessi.slice(
    permessi.indexOf('key: "manageTrainingStatus"'),
    permessi.indexOf('key: "manageTrainingStatus"') + 400,
  );

  assert.ok(
    /creare/i.test(voce),
    "la descrizione parlava solo di annullare e ripristinare, e adesso la chiave governa quattro verbi",
  );
});
