import assert from "node:assert/strict";
import test from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il doppio di prova che non filtrava, e nessuno se ne accorgeva.**
 *
 * `matchesWhere` chiude con una regola deliberata: una condizione che non
 * conosce **la considera soddisfatta**, cosi un test fallisce sull'asserzione
 * vera invece che su una finta non-corrispondenza. E la scelta giusta, e ha un
 * prezzo: un operatore mai implementato non si manifesta come errore, si
 * manifesta come **filtro che non filtra**.
 *
 * `array_contains` era esattamente questo. Due vincoli veri ci si appoggiano —
 * «questo modulo si compila una volta sola» (§J) e lo stato dei moduli online
 * di un figlio (§G) — e con il ramo mancante il doppio restituiva **tutte** le
 * righe del club: un test su quei vincoli poteva essere verde su una semantica
 * che la produzione non ha.
 *
 * Lo ha trovato una revisione **dichiarando di non aver letto questo file** e
 * nominandolo come rischio. E stato il sospetto a portarci, non la lettura, ed
 * e la ragione per cui una revisione che dichiara la propria copertura vale
 * piu di una che sembra completa.
 *
 * Qui si tiene ferma la semantica di `@>` di Postgres, che e controintuitiva
 * su due punti: il contenimento e **parziale** (si confrontano le sole chiavi
 * scritte nel filtro) e **non posizionale**.
 *
 * **E non e stata dedotta dalla documentazione: e stata misurata.** I sei casi
 * qui sotto sono stati eseguiti come `jsonb @> jsonb` contro il database di
 * sviluppo, e Postgres risponde come questo doppio su tutti e sei. Un doppio
 * che imita un database va confrontato con il database, o si finisce a provare
 * la propria lettura del manuale.
 */

const righe = () => ({
  formSubmission: [
    {
      id: "invio-marco",
      organization_id: "club",
      subjects: [
        { subject: "athlete", recordId: "marco", label: "Rossi Marco" },
        { subject: "guardian", recordId: "0", label: "Anna" },
      ],
    },
    {
      id: "invio-giulia",
      organization_id: "club",
      subjects: [
        { subject: "athlete", recordId: "giulia", label: "Rossi Giulia" },
        { subject: "guardian", recordId: "0", label: "Anna" },
      ],
    },
    {
      id: "invio-senza-soggetti",
      organization_id: "club",
      subjects: [],
    },
  ],
});

const cerca = async (filtro) => {
  const fake = createFakePrisma(righe());
  const trovate = await fake.client.formSubmission.findMany({
    where: { organization_id: "club", subjects: { array_contains: filtro } },
  });
  return trovate.map((r) => r.id);
};

test("array_contains filtra davvero, e non restituisce tutto", async () => {
  /*
    La prova che conta: con il ramo mancante questa tornava tre righe su tre.
  */
  assert.deepEqual(
    await cerca([{ subject: "athlete", recordId: "marco" }]),
    ["invio-marco"],
  );
});

test("il contenimento e parziale: si guardano le chiavi scritte nel filtro", async () => {
  /*
    L'elemento in archivio porta anche `label`, che il filtro non nomina. In
    Postgres `@>` lo accetta; un confronto per uguaglianza esatta no — ed e la
    forma che il codice di produzione usa.
  */
  assert.deepEqual(await cerca([{ recordId: "giulia" }]), ["invio-giulia"]);
});

test("il contenimento non e posizionale", async () => {
  /*
    Il tutore e il **secondo** elemento dell'array. Cercarlo da solo deve
    trovarlo comunque.
  */
  assert.deepEqual(
    (await cerca([{ subject: "guardian", recordId: "0" }])).sort(),
    ["invio-giulia", "invio-marco"],
  );
});

test("una chiave che non corrisponde esclude la riga", async () => {
  assert.deepEqual(await cerca([{ recordId: "sconosciuto" }]), []);
  assert.deepEqual(
    await cerca([{ subject: "guardian", recordId: "marco" }]),
    [],
    "marco e un atleta, non un tutore: le due chiavi vanno in AND",
  );
});

test("piu elementi cercati devono esserci tutti", async () => {
  assert.deepEqual(
    await cerca([
      { subject: "athlete", recordId: "marco" },
      { subject: "guardian", recordId: "0" },
    ]),
    ["invio-marco"],
  );

  assert.deepEqual(
    await cerca([
      { subject: "athlete", recordId: "marco" },
      { subject: "athlete", recordId: "giulia" },
    ]),
    [],
    "nessuna riga porta entrambi gli atleti",
  );
});

test("un array vuoto in archivio non corrisponde a niente", async () => {
  /*
    E il caso del modulo compilato dal link pubblico, dove `selections` e `[]`:
    il vincolo «una volta sola» non deve poter agganciare quelle righe.
  */
  assert.equal(
    (await cerca([{ subject: "athlete", recordId: "marco" }])).includes(
      "invio-senza-soggetti",
    ),
    false,
  );
});
