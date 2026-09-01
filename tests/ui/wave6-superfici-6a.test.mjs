import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Le tre superfici della lane 6A che non sono l'elenco atleti.**
 *
 * - **W6-51** — dalla segreteria non si poteva ne confermare ne rifiutare un
 *   appuntamento. Il dominio sapeva farlo, la rotta rispondeva, il database
 *   aveva la riga: la schermata confrontava i nomi degli **stati** con i nomi
 *   delle **azioni**, quindi i tre rami erano sempre falsi e il dialogo
 *   mostrava solo «Chiudi».
 * - **W6-54 · W6-55** — un club che spegneva «Affittabile» credeva di aver
 *   chiuso le prenotazioni, e la famiglia prenotava lo stesso: quel flag e il
 *   contratto d'affitto della struttura e nessuna riga del percorso famiglia lo
 *   legge. E ogni campo nuovo nasceva con due tariffe a zero, che la famiglia
 *   leggeva come «€ 0,00».
 * - **Sidebar** — compressa mostrava icone mute: nessun tooltip su due barre su
 *   tre, e sulla terza il `title` del browser, che non risponde al fuoco da
 *   tastiera.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------------ W6-51 */

test("W6-51 · la segreteria legge le azioni, non gli stati", () => {
  const pagina = senzaCommenti(leggi("app/secretariat/page.tsx"));

  for (const azione of ["confirm", "reject", "cancel"]) {
    assert.ok(
      pagina.includes(`.actions || []).includes("${azione}")`) ||
        pagina.includes(`.actions || []).some`),
      `la segreteria deve poter disegnare il pulsante "${azione}"`,
    );
  }

  assert.equal(
    /transitions \|\| \[\]\)\.includes\("(confirm|reject|cancel)"\)/.test(pagina),
    false,
    "confrontare `transitions` (stati) con un nome di azione da sempre falso",
  );
});

test("W6-51 · la traduzione stato -> azione vive nel dominio, non nelle schermate", () => {
  const dominio = leggi("lib/appointments/model.ts");
  assert.ok(dominio.includes("export const listAppointmentActions"));
  assert.ok(dominio.includes("export const appointmentActionForStatus"));

  const proiezione = leggi("lib/appointments/projection.ts");
  assert.ok(
    proiezione.includes("actions: listAppointmentActions(status,"),
    "la proiezione del club deve portare entrambe le liste",
  );
  assert.ok(
    proiezione.includes("transitions: listAppointmentTransitions(status,"),
    "`transitions` resta: la dashboard allenatore la legge, e correttamente",
  );

  /*
    Nessuna schermata puo tenere una tabella propria: due tabelle divergono, ed
    e esattamente cosi che il difetto e nato.
  */
  for (const file of [
    "app/secretariat/page.tsx",
    "components/trainer/trainer-appointments-dashboard-page.tsx",
  ]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.equal(
      sorgente.includes("AZIONE_PER_ARRIVO"),
      false,
      `${file} non deve tenere una copia della traduzione`,
    );
  }
});

/* ------------------------------------------------------- W6-54 · W6-55 */

test("W6-54 · la prenotabilita di una struttura e un interruttore suo", () => {
  const modello = leggi("lib/structures-utils.ts");

  assert.ok(
    modello.includes("isBookableByMembers: boolean;"),
    "serve un flag dedicato: `isRentable` e il contratto d'affitto",
  );
  assert.ok(
    /isBookableByMembers:\s*\n?\s*typeof raw\?\.isBookableByMembers === "boolean"/.test(
      modello,
    ),
    "il ripiego deve essere esplicito",
  );
  assert.ok(
    modello.includes(
      ".filter((structure) => structure.isBookableByMembers === true)",
    ),
    "il percorso famiglia deve onorarlo",
  );
});

test("W6-54 · il divieto vale anche sulla rotta, non solo nella schermata", () => {
  const rotta = leggi(
    "app/api/parent-dashboard/[athleteId]/structures/route.ts",
  );
  assert.ok(
    rotta.includes("structure.isBookableByMembers !== true"),
    "se il divieto vivesse solo nella UI, chi conosce gli identificativi prenoterebbe lo stesso",
  );
});

test("W6-54 · il club ha un comando per dirlo, e non e piu «Affittabile»", () => {
  const pagina = leggi("app/structures/page.tsx");
  assert.ok(pagina.includes("Prenotabile dalle famiglie"));
  assert.ok(pagina.includes("isBookableByMembers: checked"));
  assert.equal(
    pagina.includes("Abilita l&apos;affitto della struttura."),
    false,
    "la descrizione di «Affittabile» deve dire che non riguarda le prenotazioni",
  );
});

test("W6-55 · un campo nuovo non nasce con due tariffe a zero", () => {
  /*
    Si guarda la **creazione del campo**, non «Aggiungi tariffa»: quella riga
    vuota e legittima, perche il club la sta scrivendo in quel momento e la
    compila subito. Il difetto era che due righe a zero comparissero da sole, e
    che la famiglia le leggesse come una tariffa.
  */
  const fabbriche = [
    ["components/structures/StructureFieldsSection.tsx", "const newField = ()"],
    ["app/structures/page.tsx", "const newField"],
  ];

  for (const [file, ancora] of fabbriche) {
    const sorgente = senzaCommenti(leggi(file));
    const inizio = sorgente.indexOf(ancora);
    assert.ok(inizio >= 0, `${file}: fabbrica del campo non trovata`);
    const corpo = sorgente.slice(inizio, inizio + 900);

    assert.equal(
      /price:\s*0/.test(corpo),
      false,
      `${file}: «€ 0,00» non significa gratis, significa che nessuno ha scritto un importo`,
    );
  }

  const modello = leggi("lib/structures-utils.ts");
  assert.ok(
    modello.includes("price.price > 0"),
    "sul percorso famiglia una tariffa senza importo non si mostra",
  );
});

/* ----------------------------------------------------------- SIDEBAR §10 */

const SIDEBAR = [
  "components/dashboard/Sidebar.tsx",
  "components/trainer/TrainerSidebar.tsx",
  "components/parent-dashboard/ParentSidebar.tsx",
];

test("§10 · compressa, ogni voce della barra dice il proprio nome", () => {
  for (const file of SIDEBAR) {
    const sorgente = leggi(file);
    assert.ok(
      sorgente.includes("<SidebarItemTooltip"),
      `${file}: la barra compressa mostra icone mute`,
    );
    assert.ok(
      sorgente.includes("collapsed={collapsed}"),
      `${file}: il tooltip deve esistere solo a barra compressa`,
    );
    assert.ok(
      /aria-label=\{collapsed \? \w+(\.\w+)* : undefined\}/.test(sorgente),
      `${file}: senza nome accessibile un lettore di schermo legge solo l'indirizzo`,
    );
  }
});

test("§10 · nessuna barra si affida al tooltip del browser", () => {
  for (const file of SIDEBAR) {
    const sorgente = senzaCommenti(leggi(file));
    assert.equal(
      /<Link[\s\S]{0,400}?title=\{/.test(sorgente),
      false,
      `${file}: \`title\` non risponde al fuoco da tastiera, quindi non e una risposta`,
    );
  }
});

test("§10 · il tooltip della barra e uno solo per tutte e tre", () => {
  const componente = leggi("components/navigation/sidebar-item-tooltip.tsx");
  assert.ok(componente.includes('from "@/components/ui/tooltip"'));
  assert.ok(
    componente.includes("if (!collapsed) return children;"),
    "a barra aperta il tooltip ripeterebbe un'etichetta gia scritta accanto",
  );

  for (const file of SIDEBAR) {
    const sorgente = leggi(file);
    assert.equal(
      sorgente.includes('from "@/components/ui/tooltip"'),
      false,
      `${file}: la primitiva si usa dal componente condiviso, non da tre copie`,
    );
  }
});
