import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AUDIENCE_CRITERION_KINDS,
  AUDIENCE_CRITERION_LABELS,
  normalizeAudienceCriteria,
} from "../../src/lib/audience/criteria.ts";
import {
  audienceCriterionNeedsSelection,
  eventAudienceLabel,
  eventAudienceOptions,
  isEventAudienceKind,
  readSelectableEvent,
  EVENT_AUDIENCE_KINDS,
} from "../../src/components/communications/audience-events.ts";

/**
 * **Un criterio che nessuno puo scegliere non esiste** (W5-14, CLAUDE.md §11.8).
 *
 * `event_convocated` e `event_no_rsvp` erano dichiarati nel dominio, risolti dal
 * motore del pubblico, elencati fra le capability completate della Wave 5 — e
 * assenti da entrambe le schermate che avrebbero dovuto offrirli: la
 * comunicazione massiva ne conosceva sette, la bacheca quattro, e nessuna
 * caricava gli eventi come opzioni. Il codice mancante non era il difetto: il
 * difetto era il codice **irraggiungibile**.
 *
 * Questo file diventa rosso se tornano a sparire, e presidia le tre cose che
 * l'assenza aveva nascosto: quali criteri le schermate offrono, quale
 * identificativo di evento mandano, e chi decide se un criterio pretende una
 * selezione.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const SCHERMATE = [
  "app/communications/page.tsx",
  "app/communications/bacheca/page.tsx",
];

// --- i due criteri sono selezionabili -------------------------------------

test("i criteri di evento esistono ancora nel dominio", () => {
  for (const kind of EVENT_AUDIENCE_KINDS) {
    assert.ok(
      AUDIENCE_CRITERION_KINDS.includes(kind),
      `${kind} non e piu un criterio del motore del pubblico`,
    );
    assert.ok(
      AUDIENCE_CRITERION_LABELS[kind],
      `${kind} non ha un'etichetta da mostrare`,
    );
  }
});

test("entrambe le schermate offrono i criteri di evento", () => {
  for (const schermata of SCHERMATE) {
    const sorgente = leggi(schermata);

    const elenco = /const CRITERI_OFFERTI = \[([\s\S]*?)\] as const/.exec(
      sorgente,
    );
    assert.ok(
      elenco,
      `${schermata}: i criteri offerti devono stare in un elenco solo, non sparsi fra un tipo e una tendina`,
    );

    for (const kind of EVENT_AUDIENCE_KINDS) {
      assert.ok(
        elenco[1].includes(`"${kind}"`),
        `${schermata}: ${kind} («${AUDIENCE_CRITERION_LABELS[kind]}») non e selezionabile`,
      );
    }
  }
});

test("entrambe le schermate caricano gli eventi da un punto solo", () => {
  for (const schermata of SCHERMATE) {
    const sorgente = leggi(schermata);

    assert.ok(
      sorgente.includes("loadSelectableEvents"),
      `${schermata}: senza il caricamento degli eventi il criterio resta una voce vuota`,
    );
    assert.ok(
      sorgente.includes("eventAudienceOptions"),
      `${schermata}: gli eventi devono diventare opzioni scegliibili`,
    );
    assert.equal(
      sorgente.includes("/api/v1/events"),
      false,
      `${schermata}: la rotta degli eventi si chiama da audience-events.ts, non da una seconda strada nella pagina`,
    );
  }
});

// --- l'identificativo mandato e quello della riga -------------------------

test("l'opzione porta l'identificativo della riga, non quello storico", () => {
  /*
    E il difetto che non fallirebbe mai a schermo: `toEventLegacyShape` espone
    `id` come `legacy_id || row.id`, mentre `club_event_participant.event_id`
    punta alla riga. Mandare il primo produce zero destinatari **senza nessun
    errore**.
  */
  const evento = readSelectableEvent({
    id: "gara-2019-legacy",
    eventId: "riga-42",
    row: { id: "riga-42", rsvp_required: true, starts_at: "2026-09-06T15:00:00.000Z" },
    kind: "match",
    title: "Derby",
    startsAt: "2026-09-06T15:00:00.000Z",
    rsvpRequired: true,
  });

  assert.equal(evento.id, "riga-42");
  assert.notEqual(evento.id, "gara-2019-legacy");
});

test("un evento senza riga o senza data non diventa un'opzione", () => {
  assert.equal(readSelectableEvent({ id: "solo-legacy" }), null);
  assert.equal(readSelectableEvent({ row: { id: "riga-1" } }), null);
});

// --- quali eventi si offrono ----------------------------------------------

const evento = (patch) => ({
  id: patch.id,
  kind: patch.kind || "training",
  title: patch.title || "",
  opponent: patch.opponent || "",
  categoryName: patch.categoryName || "",
  startsAt: patch.startsAt || "2026-09-06T15:00:00.000Z",
  rsvpRequired: Boolean(patch.rsvpRequired),
});

test("«senza risposta» offre solo gli eventi con la conferma accesa", () => {
  /*
    Su un evento che non ha mai chiesto una risposta sono silenziosi *tutti* i
    convocati: il criterio restituirebbe lo stesso insieme di «Convocati a un
    evento» facendo credere a chi scrive di aver ristretto qualcosa.
  */
  const eventi = [
    evento({ id: "con-rsvp", rsvpRequired: true }),
    evento({ id: "senza-rsvp", rsvpRequired: false }),
  ];

  assert.deepEqual(
    eventAudienceOptions(eventi, "event_no_rsvp").map((o) => o.id),
    ["con-rsvp"],
  );
  assert.deepEqual(
    eventAudienceOptions(eventi, "event_convocated").map((o) => o.id),
    ["con-rsvp", "senza-rsvp"],
  );
});

test("un evento senza titolo ha comunque un nome riconoscibile", () => {
  const istante = new Date(2026, 8, 6, 15, 30);

  assert.match(
    eventAudienceLabel(
      evento({
        id: "x",
        kind: "match",
        opponent: "Virtus",
        startsAt: istante.toISOString(),
      }),
    ),
    /06 set 15:30 — Gara con Virtus/,
  );

  assert.match(
    eventAudienceLabel(
      evento({ id: "y", categoryName: "Under 14", startsAt: istante.toISOString() }),
    ),
    /Allenamento · Under 14/,
  );
});

// --- chi decide se serve una selezione ------------------------------------

test("la schermata chiede al dominio quali criteri pretendono una selezione", () => {
  /*
    Era la seconda meta del difetto: l'elenco dei criteri «con valori» era
    riscritto nella pagina, quindi un criterio nuovo sarebbe partito come
    `[{ kind }]` e il server lo avrebbe rifiutato. La sonda deve restare
    d'accordo con `normalizeAudienceCriteria` su **ogni** criterio, compresi
    quelli che nasceranno.
  */
  for (const kind of AUDIENCE_CRITERION_KINDS) {
    const [criterio] = normalizeAudienceCriteria([
      { kind, values: ["__sonda__"] },
    ]);
    assert.equal(
      audienceCriterionNeedsSelection(kind),
      "values" in criterio,
      `${kind}: la schermata e il dominio non sono d'accordo su cosa mandare`,
    );
  }

  for (const kind of EVENT_AUDIENCE_KINDS) {
    assert.equal(
      audienceCriterionNeedsSelection(kind),
      true,
      `${kind} senza evento selezionato e una selezione che qualcuno credeva di aver fatto`,
    );
    assert.equal(isEventAudienceKind(kind), true);
  }

  assert.equal(isEventAudienceKind("all_families"), false);
});

test("nessuna schermata riscrive l'elenco dei criteri con valori", () => {
  for (const schermata of SCHERMATE) {
    const sorgente = leggi(schermata);
    assert.ok(
      sorgente.includes("audienceCriterionNeedsSelection"),
      `${schermata}: la forma del criterio da mandare la decide il dominio`,
    );
  }
});

// --- 375 px ----------------------------------------------------------------

test("l'etichetta di un evento va a capo invece di allargare la pagina", () => {
  for (const schermata of SCHERMATE) {
    const sorgente = leggi(schermata);
    assert.match(
      sorgente,
      /min-w-0 flex-1 break-words/,
      `${schermata}: a 375 px «06 set 15:30 — Gara con Virtus · Under 14» non ci sta su una riga`,
    );
  }
});
