import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * **I nomi diversi che portano alla stessa riga.**
 *
 * Sei risorse del registro generico sono in realta tre nomi doppi: due voci di
 * `RESOURCE_CONFIG`, **un solo delegato Prisma**, la stessa tabella. I nomi
 * storici restano per non cambiare contratto a chi li usa gia, ed e una scelta
 * legittima.
 *
 * Il costo di quella scelta e stato pagato: ogni guardia del registro confronta
 * una **stringa**, e una guardia che ne nomina uno solo lascia l'altro aperto.
 * Due revisioni indipendenti hanno misurato lo stesso caso —
 * `PATCH /api/v1/club_event_participants/:id` negato, `PATCH
 * /api/v1/training_attendance/:id` **riuscito**, con presenza, risposta della
 * famiglia e convocazione scritte in una chiamata sola.
 *
 * ## Cosa tiene ferma questa prova
 *
 * Che la mappa degli alias in `src/lib/resource-aliases.ts` **copra tutti** i
 * delegati condivisi che esistono davvero in `RESOURCE_CONFIG`. Non e una
 * regola sullo stile: e la premessa di ogni guardia che passa da
 * `canonicalResourceName`. Aggiungere un settimo alias senza dichiararlo qui
 * fa fallire questa prova, e non il prodotto in produzione.
 *
 * **Perche si legge il sorgente e non si importa il modulo.** Perche
 * `resources.ts` e un modulo server che apre il client Prisma: importarlo da un
 * test unitario vorrebbe dire una connessione. Qui interessa una proprieta
 * della **dichiarazione**, che nel sorgente e per intero.
 */

const sorgente = readFileSync("src/lib/server/resources.ts", "utf8");
const mappa = readFileSync("src/lib/resource-aliases.ts", "utf8");

/** Le voci `nome: { kind: "model", delegate: "x" }` di `RESOURCE_CONFIG`. */
const delegatiPerRisorsa = () => {
  const per = new Map();
  const re = /^ {2}([a-z_0-9]+): \{\n {4}kind: "model",\n {4}delegate: "([A-Za-z]+)",/gm;

  let trovato;
  while ((trovato = re.exec(sorgente))) {
    const [, risorsa, delegato] = trovato;
    per.set(delegato, [...(per.get(delegato) || []), risorsa]);
  }

  return per;
};

/** Le coppie `alias: "canonico"` dichiarate nella mappa. */
const aliasDichiarati = () => {
  const dichiarati = new Map();
  const corpo = mappa.split("CANONICAL_RESOURCE_BY_ALIAS")[1] || "";
  const re = /^ {2}([a-z_0-9]+): "([a-z_0-9]+)",$/gm;

  let trovato;
  while ((trovato = re.exec(corpo))) {
    dichiarati.set(trovato[1], trovato[2]);
  }

  return dichiarati;
};

test("ogni delegato condiviso ha i suoi alias dichiarati", () => {
  const per = delegatiPerRisorsa();
  const dichiarati = aliasDichiarati();

  assert.ok(per.size > 0, "nessuna risorsa di modello letta: il lettore e rotto");
  assert.ok(dichiarati.size > 0, "nessun alias letto: il lettore e rotto");

  const condivisi = [...per.entries()].filter(([, nomi]) => nomi.length > 1);
  assert.ok(
    condivisi.length > 0,
    "nessun delegato condiviso: se e vero, questa prova non serve piu e va tolta con il suo motivo",
  );

  for (const [delegato, nomi] of condivisi) {
    /*
      Per ogni gruppo: uno solo e il canonico, e tutti gli altri devono
      ricondursi a lui. Quale sia il canonico lo decide la mappa; qui si
      pretende solo che il gruppo **collassi a un nome solo**.
    */
    const canonici = new Set(
      nomi.map((nome) => dichiarati.get(nome) || nome),
    );

    assert.equal(
      canonici.size,
      1,
      `il delegato ${delegato} e servito da ${nomi.join(", ")}, che non si riconducono a un nome solo: ` +
        "dichiara gli alias in src/lib/resource-aliases.ts, altrimenti ogni guardia che confronta una stringa ne coprira uno solo",
    );

    const canonico = [...canonici][0];
    assert.ok(
      nomi.includes(canonico),
      `il nome canonico ${canonico} del delegato ${delegato} non e una risorsa dichiarata`,
    );
  }
});

test("le guardie del registro confrontano il nome canonico", () => {
  /*
    Non e un controllo di stile: sono le tre guardie che una revisione ha
    misurato aperte sull'alias. Se una di loro torna a confrontare `resource`
    grezzo, questa prova lo dice prima che lo dica una sonda.
  */
  const attese = [
    {
      cosa: "la guardia di dominio",
      riga: "DOMAIN_OWNED_MODEL_RESOURCES.has(canonicalResourceName(resource))",
    },
    {
      cosa: "il filtro del gruppo operativo dell'allenatore",
      riga:
        "TRAINER_DASHBOARD_FILTERED_RESOURCES.has(canonicalResourceName(resource))",
    },
    {
      cosa: "il perimetro di sede e categoria",
      riga: "const resource = canonicalResourceName(nomeRichiesto);",
    },
  ];

  for (const { cosa, riga } of attese) {
    assert.ok(
      sorgente.includes(riga),
      `${cosa} non passa piu dal nome canonico: cercata la riga \`${riga}\``,
    );
  }
});
