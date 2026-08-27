import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * UX multi-sede (ADR-0038).
 *
 * La proprieta da difendere non e «c'e un filtro sede»: e che **il club
 * mono-sede non veda niente di tutto questo**. Un menu con una voce sola non
 * informa, occupa spazio e a 375 px lo toglie a cio che serve.
 *
 * Come per le altre invarianti statiche (vedi `responsive-invariants`), questi
 * test non sostituiscono l'apertura della pagina: verificano la classe di
 * difetti che si introduce senza accorgersene, cioe montare il concetto di
 * sede dove non c'e nessuna sede.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const SITE_UI = [
  "components/sites/site-filter.tsx",
  "components/sites/club-sites-section.tsx",
];

test("il filtro sede non si monta se il club non e multi-sede", () => {
  const source = read("components/sites/site-filter.tsx");

  assert.match(
    source,
    /if \(!isMultiSiteClub\(sites\)\) \{\s*return null;/,
    "la decisione sta nel componente, cosi ogni pagina la eredita",
  );
});

test("le pagine che filtrano per sede usano il componente, non una tendina propria", () => {
  for (const file of [
    "app/categories/page.tsx",
    "app/structures/page.tsx",
    "app/athletes/page.tsx",
    "app/training/page.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /<SiteFilter/,
      `${file} deve montare SiteFilter e non una tendina sede propria`,
    );
  }
});

test("la struttura porta la sede, e senza sede resta visibile", () => {
  const utils = read("lib/structures-utils.ts");
  assert.match(utils, /siteId: firstText\(raw\?\.siteId, raw\?\.site_id\)/);

  const page = read("app/structures/page.tsx");
  assert.match(
    page,
    /filterStructuresBySite\(structures, siteFilter\)/,
    "il filtro passa dal modulo proprietario, che tiene la regola sul dato storico",
  );
});

test("nessuna griglia delle schermate sede resta a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of SITE_UI) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
      .filter((line) => !line.includes("TabsList"));

    if (offending.length) {
      offenders.push(`${file}: ${offending[0].trim().slice(0, 80)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

/**
 * Un allenamento **non** porta una sede propria: si allena in una struttura, e
 * la struttura appartiene a una sede. Un secondo campo si disallineerebbe al
 * primo allenamento in trasferta — ed e l'alternativa scartata da ADR-0038.
 */
test("la sede di un allenamento viene dalla sua struttura", () => {
  const source = read("app/training/page.tsx");

  assert.match(
    source,
    /siteIdByStructureId\[String\(training\.structureId\)\]/,
  );
  assert.equal(
    /training\.siteId|training\.site_id/.test(source),
    false,
    "l'allenamento non deve avere un campo sede proprio",
  );
});

test("una sede con strutture collegate non si elimina, si disattiva", () => {
  const source = read("components/sites/club-sites-section.tsx");

  assert.match(
    source,
    /if \(structureCountBySiteId\[site\.id\]\) \{\s*return;/,
    "eliminarla lascerebbe le strutture con un riferimento morto",
  );
  assert.match(source, /disabled=\{disabled \|\| structureCount > 0\}/);
});

/**
 * Le sedi di una categoria si dichiarano **dove si dichiara la categoria**.
 *
 * Prima erano una finestra a parte, raggiungibile da un pulsante nell'elenco:
 * due superfici per la stessa configurazione, e chi creava una categoria nuova
 * doveva ricordarsi di aprire anche la seconda. Ora la spunta sta nel modulo, e
 * il salvataggio della categoria scrive i gruppi (ADR-0055).
 */
test("le sedi di una categoria si spuntano nel modulo della categoria", () => {
  const source = read("components/forms/CategoryEditorDialog.tsx");

  assert.match(source, /Sedi in cui e attiva/);
  assert.match(source, /siteIds: showSites \? formData\.siteIds : \[\]/);
  assert.equal(
    /setCategories|createCategory|categories\.push/.test(source),
    false,
    "spuntare una sede non deve creare una categoria",
  );
});

test("non esiste una seconda superficie per i gruppi operativi", () => {
  assert.equal(
    existsSync(path.join(SRC, "components", "sites", "category-groups-editor.tsx")),
    false,
    "una configurazione, una schermata: la finestra separata e stata rimossa",
  );
});

test("il salvataggio di una categoria scrive i gruppi delle sedi spuntate", () => {
  const source = read("app/categories/page.tsx");

  assert.match(source, /buildCategoryGroupsForSites\(\{/);
  assert.match(
    source,
    /siteIds: Array\.isArray\(categoryData\.siteIds\)/,
    "le spunte del modulo devono arrivare fino ai gruppi",
  );
});

test("togliere una sede archivia il gruppo, non lo cancella", () => {
  const source = read("lib/club-sites.ts");

  assert.match(
    source,
    /const archived: CategoryGroup\[\] = existing[\s\S]{0,400}active: false,/,
    "un gruppo con storico non si porta via",
  );
});

/* ------------------------------- gli elenchi operativi sono per gruppo */

/**
 * La pagina Atleti raggruppa per **gruppo operativo**, non per categoria.
 *
 * Prima l'elenco `Pulcini` portava dentro Scauri e Santi Cosma: una lista che
 * nessuno puo usare per stampare un appello o contare una squadra.
 */
test("la pagina Atleti raggruppa per gruppo operativo", () => {
  const source = read("app/athletes/page.tsx");

  assert.match(source, /const athleteGroups = useMemo\(/);
  assert.match(
    source,
    /groupId:\s*\n?\s*getMembershipGroupId\(/,
    "la riga porta il proprio gruppo, ricavato dalla funzione canonica",
  );
  assert.equal(
    /const categoryAthletes = filteredAthletes\.filter\(/.test(source),
    false,
    "il raggruppamento per sola categoria e stato rimosso",
  );
});

test("l'etichetta porta la sede solo quando ci sono piu squadre", () => {
  const source = read("app/athletes/page.tsx");

  assert.match(
    source,
    /const needsSite = \(groupCountByCategory\.get\(key\) \|\| 0\) > 1;/,
    "il club mono-gruppo non deve vedere il concetto",
  );
});

test("un allenamento si assegna ai gruppi, non alla categoria", () => {
  for (const file of [
    "components/forms/AddTrainingForm.tsx",
    "components/forms/EditTrainingForm.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /<TrainingGroupSelector/, `${file} deve usare i gruppi`);
    assert.match(
      source,
      /categories: categoryIdsFromGroups\(groupOptions, groupIds\)/,
      `${file} deve derivare le categorie dai gruppi`,
    );
  }
});

test("l'appello mostra la squadra dell'allenamento, non tutta la categoria", () => {
  const source = read("app/training/page.tsx");

  assert.match(source, /const trainingGroupIds = readTrainingGroupIds\(training\)/);
  assert.match(
    source,
    /getAthleteGroupIds\(athlete, siteIndex\)\.some\(\(groupId\) =>\s*\n?\s*trainingGroupIds\.includes\(groupId\)/,
  );
});

test("un allenamento senza gruppi dichiarati ricade sulla categoria", () => {
  const source = read("app/training/page.tsx");

  assert.match(
    source,
    /const groupAthletes = trainingGroupIds\.length/,
    "il dato precedente ai gruppi non deve sparire dall'appello",
  );
});

test("il programma settimanale dice quale squadra, non solo quale fascia", () => {
  const source = read("components/dashboard/WeeklyTrainingSchedulePanel.tsx");

  assert.match(source, /<Label>Gruppo<\/Label>/);
  assert.match(source, /const getGroupLabel = React\.useCallback\(/);
  assert.match(
    source,
    /CATEGORY_GROUP_SEPARATOR/,
    "l'etichetta composta usa il separatore del modulo proprietario",
  );
});

test("il secondo componente di programma settimanale non esiste piu", () => {
  assert.equal(
    existsSync(
      path.join(SRC, "components", "dashboard", "WeeklyTrainingSchedule.tsx"),
    ),
    false,
    "era un duplicato non montato con un autosave senza deduplica (D22)",
  );
});

test("un allenatore puo seguire piu squadre senza duplicare l'anagrafica", () => {
  const utils = read("lib/trainer-utils.ts");

  assert.match(utils, /export const getTrainerGroupIds/);
  assert.match(utils, /export const trainerFollowsGroup/);
  assert.match(
    utils,
    /const declared = getTrainerGroupIds\(trainer\);\s*\n\s*if \(declared\.length\)/,
    "senza gruppi dichiarati vale la categoria, come prima",
  );

  const page = read("app/trainers/[id]/page.tsx");
  assert.match(page, /Gruppi seguiti/);
  assert.match(page, /assignableGroups/);
});

test("gli allenatori proposti seguono i gruppi scelti", () => {
  assert.match(
    read("components/forms/AddTrainingForm.tsx"),
    /getAssociatedTrainerIdsForGroups\(/,
  );
});

test("il dato senza sede si colloca in blocco, non scheda per scheda", () => {
  const source = read("app/athletes/page.tsx");

  assert.match(source, /bulk-site-target/);
  assert.match(
    source,
    /Lascia la sede attuale/,
    "un cambio di categoria non deve cancellare una sede che nessuno ha toccato",
  );
});

test("cambiare categoria non scollega l'atleta dalla sua sede", () => {
  const source = read("lib/simplified-db.ts");

  assert.match(
    source,
    /site_id: requestedSiteId,/,
    "la primaria nuova eredita la sede della precedente",
  );
  assert.match(
    source,
    /site_id: membership\.siteId,/,
    "le secondarie tengono la loro",
  );
});

/* ------------------------ arrivare a una squadra (RC Fix 2, punto 13) */

/**
 * Le liste erano gia separate per gruppo — una scheda per squadra, con il
 * proprio conteggio — ma per arrivare a una squadra si poteva solo scegliere
 * la sede e poi scorrere. Su un club con sei categorie in tre sedi sono
 * diciotto schede da attraversare per arrivare a quella che si cercava.
 */
test("si puo scegliere una squadra, non solo una sede", () => {
  const filter = read("components/sites/site-filter.tsx");
  const page = read("app/athletes/page.tsx");

  assert.match(
    filter,
    /export function CategoryGroupFilter/,
    "il filtro gruppo deve stare accanto al filtro sede, non in una pagina",
  );
  assert.match(
    filter,
    /if \(groups\.length < 2\) \{\s*\n?\s*return null;/,
    "con una squadra sola il menu e rumore, come per il filtro sede",
  );
  assert.match(page, /<CategoryGroupFilter/);
});

/**
 * **Sede → Gruppo, oppure direttamente Gruppo.**
 *
 * Con una sede scelta l'elenco delle squadre si restringe a quella sede: le
 * due strade sono la stessa, percorsa in due modi.
 */
test("scegliere la sede restringe le squadre offerte", () => {
  const page = read("app/athletes/page.tsx");

  assert.match(
    page,
    /\.filter\(\(group\) => !siteFilter \|\| group\.siteId === siteFilter\)/,
    "senza questo il menu gruppi offrirebbe squadre di altre citta",
  );
  assert.match(
    page,
    /if \(groupOptions\.some\(\(group\) => group\.id === groupFilter\)\) return;/,
    "cambiare sede non deve lasciare selezionata una squadra di un'altra citta",
  );
});

/**
 * Un gruppo e la coppia (categoria, sede): il filtro si traduce nei due
 * parametri che l'archivio conosce gia, invece di introdurne un terzo. Cosi
 * restringe **anche** la pagina che arriva dal server: un filtro che agisse
 * solo sulle righe gia caricate direbbe «quattro atleti» guardandone duecento
 * su duemila.
 */
test("il filtro gruppo restringe anche la query, non solo cio che e a schermo", () => {
  const page = read("app/athletes/page.tsx");

  assert.match(page, /siteId: selectedGroup\?\.siteId \|\| siteFilter/);
  assert.match(page, /categoryId: selectedGroup\?\.categoryId \|\| ""/);
  assert.match(
    page,
    /const matchesGroup = !groupFilter \|\| athlete\.groupId === groupFilter;/,
    "e nessuna indulgenza sul gruppo: Pulcini · Roma non e Pulcini · Aprilia",
  );
});

/**
 * Un gruppo implicito e una categoria con un altro nome: offrirlo nel menu
 * delle squadre sarebbe una seconda voce che dice la stessa cosa (ADR-0055).
 */
test("i gruppi impliciti non compaiono fra le squadre selezionabili", () => {
  assert.match(
    read("app/athletes/page.tsx"),
    /\.filter\(\(group\) => !group\.implicit\)/,
  );
});
