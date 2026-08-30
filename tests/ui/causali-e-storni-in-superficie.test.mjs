import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **Le correzioni che non arrivavano sulla superficie che le usa.**
 *
 * Tre difetti della stessa famiglia, trovati da una revisione di conferma:
 * il dominio era corretto, e il pezzo di interfaccia che avrebbe dovuto
 * mostrarlo non lo faceva. Nessuno dei tre poteva fallire un test di dominio,
 * e nessuno dei tre poteva fallire il typecheck — sono tutti **omissioni**
 * dentro una firma che le tollera.
 *
 * 1. la tendina delle causali era passata a **uno** dei due punti in cui la
 *    finestra di incasso e montata. La `prop` e facoltativa e vale `[]` per
 *    difetto, quindi TypeScript taceva: sulla scheda «Iscrizione» — la
 *    superficie da cui la segreteria incassa davvero — la tendina offriva solo
 *    «Non classificato» e **dichiarava** che il club non aveva configurato le
 *    causali;
 * 2. `reversed` era mappato sulle righe degli incassi di uno sponsor e non
 *    letto in nessuna riga: uno storno compariva verde accanto alla sua
 *    compensazione rossa, sotto un «Incassato» che non contava ne l'uno ne
 *    l'altra;
 * 3. la scheda «Pagamenti» dell'elenco sponsor leggeva la vecchia collezione
 *    JSON, che da questa Wave non riceve piu niente.
 *
 * Sono controlli sulla **sorgente** perche il difetto vive li: non in cio che
 * una funzione calcola, ma in cio che una schermata dimentica di chiedere.
 */

const leggi = (percorso) => readFileSync(percorso, "utf8");

test("ogni punto che monta la finestra di incasso le passa le causali", () => {
  const superfici = [
    "src/components/payments/AthletePaymentLedger.tsx",
    "src/components/athletes/enrollment/AthleteEnrollmentTab.tsx",
  ];

  for (const percorso of superfici) {
    const sorgente = leggi(percorso);
    assert.ok(
      sorgente.includes("<RegisterPaymentDialog"),
      `${percorso} monta la finestra`,
    );
    assert.ok(
      sorgente.includes("operationTypeChoices="),
      `${percorso} deve passare le causali: senza, la tendina dichiara il falso`,
    );
    assert.ok(
      sorgente.includes("useCausaliIncasso"),
      `${percorso} deve leggerle dal gancio condiviso, non da una copia propria`,
    );
  }
});

test("le causali si rileggono quando cambia il club attivo", () => {
  const sorgente = leggi("src/components/payments/use-causali-incasso.ts");
  assert.ok(
    /\}, \[clubId\]\)/.test(sorgente),
    "le dipendenze erano `[]`, e cambiando societa restavano le causali della precedente",
  );
});

test("uno storno si dichiara in tutte e due le schermate di uno sponsor", () => {
  for (const percorso of [
    "src/app/sponsors/[id]/page.tsx",
    "src/app/sponsors/page.tsx",
  ]) {
    const sorgente = leggi(percorso);
    assert.ok(
      /payment\.reversed/.test(sorgente),
      `${percorso} deve leggere \`reversed\`, non solo mapparlo`,
    );
    assert.ok(
      sorgente.includes("Stornato"),
      `${percorso} deve dirlo a chi guarda`,
    );
  }
});

test("l'elenco degli sponsor legge gli incassi dalla stessa fonte del residuo", () => {
  const sorgente = leggi("src/app/sponsors/page.tsx");
  assert.ok(
    !/getClubData\([^)]*"sponsor_payments"/.test(sorgente),
    "la vecchia collezione JSON non riceve piu niente: leggerla mostrava una scheda ferma",
  );
  assert.ok(
    !/deleteClubDataItem\([^)]*"sponsor_payments"/.test(sorgente),
    "un incasso non si cancella: si storna, come gia dice la scheda dello sponsor",
  );
  assert.ok(
    /riga\.collections/.test(sorgente),
    "gli incassi arrivano con il residuo che spiegano",
  );
});

test("una tendina non offre un movimento che il gestore non registra", () => {
  const sorgente = leggi("src/app/sponsors/page.tsx");
  assert.ok(
    !/<option value="uscita">/.test(sorgente),
    'scegliendo «Uscita» il totale incassato dallo sponsor **saliva**: il gestore registrava sempre un incasso',
  );
});

test("nessuna schermata promette credenziali che nessuno invia", () => {
  for (const percorso of [
    "src/app/athletes/[id]/page.tsx",
    "src/app/staff/[id]/page.tsx",
    "src/app/soci/[id]/page.tsx",
  ]) {
    const sorgente = leggi(percorso);
    assert.ok(
      !/showToast\(\s*"success",\s*"Credenziali inviate/.test(sorgente),
      `${percorso}: il gestore non chiama niente, e il messaggio verde diceva il contrario`,
    );
  }
});
