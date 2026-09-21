import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **N3, il lato delle superfici: chi scrive una categoria passa dalla
 * primitiva.**
 *
 * `tests/lib/categoria-omonima-sede-visibile.test.mjs` misura la **regola**;
 * questa misura che le schermate la usino. La distinzione conta perche il
 * difetto che `D-INT-3` descrive non e una regola sbagliata: e una regola che
 * non arriva a schermo. Una primitiva scritta, provata e non cablata e
 * esattamente la forma di difetto che CLAUDE.md §11.8 nomina — l'RSVP completo
 * che nessuna schermata sapeva accendere.
 *
 * **Il vincolo che rende non banale il cablaggio**: senza i **gruppi**
 * (`buildCategoryGroups`) l'indice non ha modo di sapere in quale sede vive una
 * categoria, e `label` restituisce il nome nudo. Cablare la primitiva senza
 * portare i gruppi sarebbe stato un cambiamento che non cambia niente — e
 * avrebbe superato una prova scritta male.
 */

const leggi = (percorso) => readFileSync(percorso, "utf8");

const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * Le superfici operative del mandato, e per ognuna la prova che **la sede puo
 * arrivarci**: l'indice costruito con i gruppi, non solo con il catalogo.
 */
const SUPERFICI = [
  {
    nome: "bacheca dell'allenatore (allenamenti, gare, appello, convocazioni)",
    file: "src/components/trainer/trainer-dashboard-context.tsx",
    /* Un solo punto: di qui esce `displayCategory` per quattordici schermate. */
    usa: /etichettaDiCategoria\(/,
    gruppi: /buildCategoryGroups\(\{/,
  },
  {
    nome: "gare: convocazioni, filtri e statistiche",
    file: "src/app/matches/page.tsx",
    usa: /categoryDisplay\.label\(/,
    gruppi: /buildCategoryGroups\(\{/,
  },
  {
    nome: "elenco atleti: l'azione massiva che cambia categoria",
    file: "src/app/athletes/page.tsx",
    usa: /categoryDisplay\.label\(category\.id\)/,
    gruppi: /buildCategoryDisplayIndex\(\{ categories, groups: categoryGroups \}\)/,
  },
  {
    nome: "scheda atleta: editor delle appartenenze (ADR-0194: la squadra, con la sua sede)",
    file: "src/lib/categories/placement.ts",
    usa: /display\.label\(categoryId\)/,
    gruppi: /buildCategoryDisplayIndex\(\{ categories: configurate, groups, sites \}\)/,
  },
  {
    nome: "scheda atleta: chip in testata",
    file: "src/components/athletes/profile/v2/AthleteRecordHeader.tsx",
    usa: /<CategoryLabel/,
    gruppi: /groups: categoryGroups/,
  },
  {
    nome: "calendario: filtro per categoria",
    file: "src/app/calendar/page.tsx",
    usa: /categoryDisplay\.label\(voce\.id\)/,
    gruppi: /groups: gruppi/,
  },
];

for (const superficie of SUPERFICI) {
  test(`la sede arriva a: ${superficie.nome}`, () => {
    const codice = senzaCommenti(leggi(superficie.file));

    assert.match(
      codice,
      superficie.usa,
      `${superficie.file} non chiede l'etichetta alla primitiva`,
    );
    assert.match(
      codice,
      superficie.gruppi,
      `${superficie.file} costruisce l'indice **senza i gruppi**: la sede non ` +
        "puo comparire, e il cablaggio non cambia niente",
    );
  });
}

/* ------------------------------------------------------------------ */
/* La scheda atleta porta davvero i gruppi fino ai suoi pannelli       */
/* ------------------------------------------------------------------ */

test("la scheda atleta legge i gruppi del club e li passa ai pannelli", () => {
  const codice = senzaCommenti(leggi("src/app/athletes/[id]/page.tsx"));

  assert.match(
    codice,
    /getClubData\(effectiveClubId, "category_groups"\)/,
    "senza questa lettura la sede non esiste in questa pagina",
  );
  /* Il cassetto di modifica riceve i gruppi come oggetto; le sezioni come prop. */
  assert.match(codice, /groups: clubCategoryGroups/);
  assert.match(codice, /categoryGroups=\{clubCategoryGroups\}/);
  /*
    **Costruiti, non grezzi** (ADR-0185): `clubs.category_groups` porta solo
    `siteId`, e passato com'era la scheda scriveva «Pulcini (site-1787…)». La
    pagina deve passare dai gruppi costruiti sul catalogo sedi, come le altre
    schermate.
  */
  assert.match(
    codice,
    /buildCategoryGroups\(\{\s*categories: clubCategoryOptions,\s*sites: clubSites,\s*groups: clubCategoryGroupsRaw,/,
    "la scheda atleta deve costruire i gruppi con buildCategoryGroups, non passare il JSON grezzo",
  );
});

test("la bacheca dell'allenatore legge sedi e gruppi", () => {
  const codice = senzaCommenti(
    leggi("src/components/trainer/trainer-dashboard-context.tsx"),
  );

  assert.match(codice, /"\/api\/v1\/club_sites"/);
  assert.match(codice, /"\/api\/v1\/category_groups"/);
});

/* ------------------------------------------------------------------ */
/* E il ruolo puo leggerle davvero                                     */
/* ------------------------------------------------------------------ */

test("l'allenatore puo leggere sedi e gruppi, o la bacheca chiederebbe un 403", async () => {
  /*
    E la prova che tiene insieme le due meta. Aggiungere due letture alla
    bacheca senza dichiararle nel perimetro dell'allenatore avrebbe prodotto
    due 403 e **due righe di audit «negato» a ogni caricamento** — che e
    esattamente il difetto che questa dashboard ha gia avuto sette volte
    insieme (D-2, D-5), e che il commento in cima al blocco di caricamento
    racconta.

    Le due risorse sono configurazione — nomi di sedi, coppie categoria/sede —
    e non allargano nessun insieme di atleti: chi l'allenatore vede continua a
    deciderlo il server sulle appartenenze.
  */
  const { canAccessClubResource } = await import(
    "../../src/lib/access-roles.ts"
  );

  for (const risorsa of ["club_sites", "category_groups"]) {
    assert.equal(
      canAccessClubResource("trainer", risorsa, "read"),
      true,
      `l'allenatore deve poter leggere «${risorsa}»`,
    );

    /* Il controspecchio: leggere non e scrivere. */
    assert.equal(
      canAccessClubResource("trainer", risorsa, "update"),
      false,
      `l'allenatore non deve poter riconfigurare «${risorsa}»`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Nessuna copia della regola                                          */
/* ------------------------------------------------------------------ */

test("nessuna superficie riscrive in casa la regola della sede", () => {
  /*
    `D-INT-3` lo dice espressamente: la sede si accosta **in un punto solo, non
    in dieci schermate**. Questa prova e la guardia contro l'undicesima copia.
  */
  for (const superficie of SUPERFICI) {
    const codice = senzaCommenti(leggi(superficie.file));

    assert.doesNotMatch(
      codice,
      /\$\{[^}]*categoryName[^}]*\}\s*\(\$\{[^}]*siteName/,
      `${superficie.file} costruisce a mano «Nome (Sede)»`,
    );
  }
});

test("gruppo operativo e disambiguazione si leggono con lo stesso separatore", () => {
  /*
    `buildCategoryGroupLabel` scrive `Pulcini · Roma` perche il gruppo *e* la
    coppia (ADR-0038). La disambiguazione per sede scrive «Pulcini · Scauri»
    con **lo stesso** separatore (ADR-0185): cio che distingue le due non e la
    punteggiatura ma *quando* la sede compare — sempre sul gruppo, solo dove il
    nome ne nomina due sulla categoria. Un separatore solo, definito una volta.
  */
  const clubSites = leggi("src/lib/club-sites.ts");

  assert.match(
    clubSites,
    /return site \? `\$\{category\}\$\{CATEGORY_GROUP_SEPARATOR\}\$\{site\}` : category;/,
    "il gruppo operativo continua a nominarsi con il separatore",
  );
  assert.match(
    clubSites,
    /export const CATEGORY_GROUP_SEPARATOR = CATEGORY_SITE_SEPARATOR;/,
    "il separatore del gruppo e quello del dominio, non una seconda costante",
  );

  const display = leggi("src/lib/categories/display.ts");
  assert.match(
    display,
    /const label = site \? `\$\{name\}\$\{CATEGORY_SITE_SEPARATOR\}\$\{site\}` : name;/,
    "la disambiguazione usa il separatore del dominio",
  );
  assert.doesNotMatch(
    display,
    /\|\| siteId;/,
    "un siteId non e mai un ripiego di etichetta",
  );
});
