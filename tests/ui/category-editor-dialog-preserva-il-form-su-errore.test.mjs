import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **"Crea categoria" non deve piu perdere tutto dopo un errore di
 * validazione** (issue UAT: date/anni non validi → notifica di errore
 * corretta, ma il form si svuotava).
 *
 * Causa: l'effetto che inizializza `formData` da `initialData`/
 * `initialAssignedTrainerIds`/`initialSiteIds` ripartiva a ogni cambio di
 * **riferimento** di quelle prop — e `src/app/categories/page.tsx` le
 * ricostruisce (nuovi array letterali) a ogni render, incluso il re-render
 * che `showToast` innesca per mostrare l'errore. Il dialogo restava aperto,
 * ma il suo stato veniva sovrascritto con quello iniziale (vuoto, in
 * creazione) proprio mentre l'utente doveva correggere un campo.
 *
 * Nessun renderer React in questa suite (coerente con
 * `training-schedule-automation-panel.test.mjs` e le altre prove statiche di
 * questa cartella): la prova e sulla sorgente, e verifica che il reset ora
 * dipenda dal **bersaglio** (dialogo aperto + quale categoria), non dal
 * riferimento delle prop.
 */
const sorgente = readFileSync(
  new URL(
    "../../src/components/forms/CategoryEditorDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("il reset del form non dipende piu da initialAssignedTrainerIds/initialSiteIds per riferimento", () => {
  // L'effetto di reset deve restare agganciato solo a `isOpen` e
  // `initialData`: le liste di riferimento non devono piu poterlo far
  // ripartire quando il dialogo e gia aperto sullo stesso bersaglio.
  assert.match(
    sorgente,
    /\}, \[isOpen, initialData\]\);/,
    "la dependency list dell'effetto di reset deve essere [isOpen, initialData]",
  );
});

test("il reset avviene solo quando il dialogo si apre su un bersaglio diverso", () => {
  assert.match(sorgente, /resetTargetRef/);
  assert.match(sorgente, /if \(!isOpen\)/);
  assert.match(sorgente, /resetTargetRef\.current === targetKey/);
  // Un re-render a dialogo gia aperto sullo stesso bersaglio deve uscire
  // presto, senza chiamare setFormData.
  assert.match(
    sorgente,
    /if \(resetTargetRef\.current === targetKey\) \{\s*\n\s*return;/,
  );
});

test("la chiave del bersaglio si azzera alla chiusura, cosi una riapertura riparte comunque da capo", () => {
  assert.match(sorgente, /resetTargetRef\.current = null;/);
});

test("il salvataggio fallito (result === false) non chiama onClose ne resetta il form", () => {
  const submitBody = sorgente.slice(
    sorgente.indexOf("const handleSubmit"),
    sorgente.indexOf("return (", sorgente.indexOf("const handleSubmit")),
  );

  const resultCheckIndex = submitBody.indexOf("if (result === false)");
  const closeCallIndex = submitBody.indexOf("onClose();");
  assert.ok(resultCheckIndex > -1, "manca il controllo result === false");
  assert.ok(
    resultCheckIndex < closeCallIndex,
    "onClose() deve restare dopo il controllo di fallimento, non prima",
  );
});

test("AddCategoryForm.tsx duplicato e morto (stesso difetto, nessun importatore) e' stato rimosso", () => {
  assert.throws(() =>
    readFileSync(
      new URL(
        "../../src/components/forms/AddCategoryForm.tsx",
        import.meta.url,
      ),
    ),
  );
});
