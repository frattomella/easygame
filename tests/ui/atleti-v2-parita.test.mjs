import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Parita V1 → V2 dell'elenco Atleti e di «Nuovo atleta»**
 * (`docs/redesign/audit/wave-a-atleti.md` §2–3, `MIGRATION-BRIEF.md`).
 *
 * L'audit e il contratto: **niente sparisce**. Questo file elenca le capacita
 * che l'audit ha inventariato — etichette, azioni, endpoint, guardie — e le
 * cerca nei sorgenti V2. Non apre la pagina: fissa che una capacita non
 * possa sparire senza che qualcuno lo scriva qui.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const strip = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ELENCO = "app/athletes/page.tsx";
const MODELLO = "components/athletes/v2/athlete-grid-model.ts";
const COLONNE = "components/athletes/v2/athletes-grid-columns.tsx";
const CONTESTO = "components/athletes/v2/athletes-context-controls.tsx";
const CASSETTO = "components/athletes/v2/bulk-category-drawer.tsx";
const IMPORT = "components/forms/AthleteImportDialog.tsx";
const NUOVO = "app/athletes/new/page.tsx";
const FORM = "components/forms/AthleteCreateForm.tsx";

const elenco = strip(read(ELENCO));
const v2 = [ELENCO, MODELLO, COLONNE, CONTESTO, CASSETTO]
  .map((f) => strip(read(f)))
  .join("\n");

/* ═══════════════════════════════════════════ /athletes — l'elenco (§2) */

test("§2.1 · l'elenco e il DataGrid del sistema, con una riga per appartenenza", () => {
  assert.match(elenco, /<DataGrid<Athlete>/, "ogni elenco e il DataGrid");
  assert.match(elenco, /module="atleti"/);
  assert.match(
    elenco,
    /getRowId=\{athleteRowKey\}/,
    "la chiave di riga porta il gruppo: una tessera, una riga",
  );
  assert.match(
    read(MODELLO),
    /export const athleteRowKey = \(row: Pick<Athlete, "id" \| "groupId">\) =>\s*`\$\{row\.id\}\|\$\{row\.groupId\}`/,
  );
  assert.match(
    elenco,
    /rowMemberships\.map\(\(membership\) =>/,
    "una riga per appartenenza (ADR-0055)",
  );
});

test("§2.1 · le colonne della V1 ci sono tutte, con le stesse etichette di esportazione", () => {
  const colonne = strip(read(COLONNE));
  for (const id of [
    "atleta",
    "categoria",
    "anno",
    "stato",
    "certificato",
    "iscrizione",
    "maglia",
  ]) {
    assert.match(colonne, new RegExp(`id: "${id}",`), `manca la colonna ${id}`);
  }
  for (const label of [
    "Atleta",
    "Categoria",
    "Anno di nascita",
    "Stato",
    "Certificato medico",
    "Iscrizione",
    "Numero maglia",
  ]) {
    assert.ok(
      colonne.includes(`label: "${label}"`),
      `manca l'etichetta ${label}`,
    );
  }
  assert.match(
    colonne,
    /id: "atleta",[\s\S]{0,200}locked: true/,
    "l'identita non si nasconde",
  );
  assert.match(
    colonne,
    /id: "iscrizione",[\s\S]{0,200}hidden: true/,
    "Iscrizione parte nascosta come nella V1",
  );
  assert.match(
    colonne,
    /id: "maglia",[\s\S]{0,200}hidden: true/,
    "Numero maglia parte nascosto come nella V1",
  );
  assert.equal(
    /id: "eta"/.test(colonne),
    false,
    "«Eta» resta fuori: la V1 la teneva nascosta e non selezionabile",
  );

  /* Le celle: identita, chip, pillole. */
  assert.match(colonne, /<IdentityCell/);
  assert.match(
    colonne,
    /* ADR-0186: la primaria si scrive con l\x27indice della pagina (sede accanto dove serve), a partire dall\x27identificativo. */
    /Categoria primaria: \$\{\s*row\.primaryCategoryId\s*\?\s*categoryLabel\(\{/,
  );
  assert.ok(
    colonne.includes("Secondaria"),
    "l'appartenenza secondaria si vede",
  );
  assert.ok(colonne.includes("Primaria"), "l'appartenenza primaria si vede");
  assert.match(
    colonne,
    /<StatusPill status=\{ATHLETE_STATUS_PILL\[row\.status\]\} \/>/,
  );
  assert.match(colonne, /athleteCertificateStatus\(row\.medicalCertExpiry\)/);
  assert.match(
    colonne,
    /ENROLMENT_STATUS\.active\s*:\s*ENROLMENT_STATUS\.incomplete/,
  );

  /* I valori esportati della V1. */
  /* ADR-0185: l'etichetta della categoria la scrive l'indice canonico della pagina. */
  assert.ok(colonne.includes("`${categoryLabel(row)} (secondaria)`"));
  assert.ok(colonne.includes('" (scaduto)"'));
  assert.ok(colonne.includes('"Completa" : "Da completare"'));
});

test("§2.1 · i conteggi per stato deduplicano per persona e sopra la soglia arrivano dal server", () => {
  assert.match(elenco, /const totaleAtletiDistinti = React\.useMemo\(/);
  assert.match(elenco, /const conteggiPerStato = React\.useMemo\(/);
  assert.match(
    elenco,
    /<HeaderStat\s+value=\{formatInteger\(listMeta\.total\)\}/,
  );
  assert.match(
    elenco,
    /<HeaderStat value=\{formatInteger\(archiveTotal\)\} label="tesserati" \/>/,
  );
});

test("§2.2 · le azioni di riga: apri scheda, sospendi, disattiva, attiva, elimina", () => {
  assert.match(elenco, /label: "Apri scheda",\s*primary: true/);
  for (const [label, stato] of [
    ["Sospendi", '"suspended"'],
    ["Disattiva", '"inactive"'],
    ["Attiva", '"active"'],
  ]) {
    assert.match(
      elenco,
      new RegExp(
        `label: "${label}",[\\s\\S]{0,260}updateAthleteStatus\\(athlete\\.id, ${stato}\\)`,
      ),
      `manca l'azione di riga ${label}`,
    );
  }
  assert.match(
    elenco,
    /label: "Elimina",\s*tone: "danger",[\s\S]{0,120}deleteAthlete\(athlete\.id, athlete\.name\)/,
  );
  assert.ok(
    elenco.includes(
      'Atleta: stato aggiornato a "${ATHLETE_STATUS_LABELS[newStatus]}"',
    ),
  );
  assert.ok(
    elenco.includes("Errore nell'aggiornamento dello stato dell'atleta"),
  );
  assert.match(
    elenco,
    /updateClubAthlete\(clubId, athleteId, \{ status: newStatus \}\)/,
  );
});

test("§2.2 · l'intestazione: nuovo atleta, report categorie, importa", () => {
  assert.match(
    elenco,
    /<PageHeader[\s\S]{0,80}eyebrow="Persone"[\s\S]{0,40}title="Atleti"/,
  );
  assert.ok(
    elenco.includes(
      'description="Gestisci gli atleti tesserati del tuo club."',
    ),
  );
  assert.match(
    elenco,
    /variant="primary"[\s\S]{0,200}Nuovo atleta/,
    "una sola azione primaria",
  );
  assert.match(
    elenco,
    /const buildNewAthleteHref = \(clubId\?: string \| null\) =>/,
  );
  assert.match(
    elenco,
    /router\.push\("\/reports\?report=categories"\)/,
    "Report categorie",
  );
  assert.ok(elenco.includes("Report categorie"));
  assert.ok(elenco.includes("Importa atleti"));
  assert.match(
    elenco,
    /onImport: \(\) => setShowImportAthletesModal\(true\)/,
    "Importa… nel menu Esporta della griglia",
  );
});

test("§2.2 · il Report di gruppo, disabilitato — cioe assente — senza categoria", () => {
  assert.match(
    elenco,
    /const canReport =\s*Boolean\(group\?\.categoryId\) && key !== UNCATEGORIZED_CATEGORY_ID;/,
  );
  assert.match(
    elenco,
    /\/reports\?report=categories&categoryId=\$\{encodeURIComponent\(group\?\.categoryId \|\| ""\)\}/,
  );
  assert.match(
    elenco,
    /defaultGrouped/,
    "raggruppamento per categoria×sede acceso di default",
  );
  assert.match(
    elenco,
    /keyOf: \(athlete\) => athlete\.groupId \|\| UNCATEGORIZED_CATEGORY_ID/,
  );
});

test("§2.2 · le azioni di massa: attiva, sospendi, disattiva, cambia categoria, elimina", () => {
  for (const [label, action] of [
    ["Attiva", "activate"],
    ["Sospendi", "suspend"],
    ["Disattiva", "deactivate"],
    ["Elimina", "delete"],
  ]) {
    assert.match(
      elenco,
      new RegExp(`label: "${label}",[\\s\\S]{0,200}action: "${action}"`),
      `manca l'azione di massa ${label}`,
    );
  }
  assert.match(
    elenco,
    /label: "Cambia categoria",[\s\S]{0,200}hidden: !categories\.length/,
    "senza categorie l'azione e assente, non spenta",
  );
  assert.match(elenco, /<BulkCategoryDrawer/);
  assert.match(
    elenco,
    /selectedIds=\{selectedRowIds\}/,
    "la selezione e controllata, cosi si azzera a fine operazione",
  );
  assert.match(
    elenco,
    /const clearAthleteSelection = \(\) => \{\s*setSelectedRowIds\(new Set\(\)\);/,
  );
});

test("§2.3c · il cassetto «Cambia categoria»: squadra, ruolo, politiche e anteprima (ADR-0194)", () => {
  const cassetto = strip(read(CASSETTO));
  assert.match(cassetto, /<Drawer[\s\S]{0,300}width="default"/, "cassetto 480");
  assert.ok(cassetto.includes('title="Cambia categoria"'));
  assert.ok(
    cassetto.includes(
      "Le presenze e lo storico già registrati non verranno modificati.",
    ),
    "il testo dice che la storia non si tocca (§27)",
  );
  assert.match(cassetto, /htmlFor="bulk-category-target" required/);
  assert.doesNotMatch(cassetto, /bulk-site-target|Lascia la sede attuale/, "nessun selettore di sede: la sede e quella della squadra");
  for (const testo of ["Categoria primaria", "Categoria secondaria", "Rimuovila", "Mantienila come categoria secondaria", "Mantieni le altre categorie associate", "Rimuovi tutte le altre categorie"]) {
    assert.ok(cassetto.includes(testo), `manca «${testo}»`);
  }
  assert.match(cassetto, /previewMembershipChange\(athleteIds, command\)/, "l'anteprima la calcola il server");
  assert.match(cassetto, /applyMembershipChange\(athleteIds, command, preview\.batchId, expected\)/, "e si applica lo stesso comando con lo stesso batchId e le firme dell'anteprima");
  assert.ok(cassetto.includes("Conferma cambio"));
  assert.match(cassetto, /Continua/);
  assert.match(cassetto, /Annulla/);
  assert.match(cassetto, /disabled=\{!targetId \|\| !athleteIds\.length/, "Continua finche non c'e una squadra");
  assert.match(
    cassetto,
    /options\.length > 8 \? \(\s*<SearchableSelect/,
    "sopra otto opzioni la tendina cerca",
  );
});

test("§2.3d · la conferma di massa: testi della V1, conferma scritta sopra i venti", () => {
  assert.ok(elenco.includes('title="Conferma operazione in blocco"'));
  assert.ok(elenco.includes('confirmLabel="Sì, conferma"'));
  assert.ok(elenco.includes('cancelLabel="No, annulla"'));
  assert.ok(elenco.includes("Stai per eliminare ${athletesCount}"));
  /* ADR-0194: «Cambia categoria» ha la sua anteprima nel cassetto, non la conferma generica. */
  assert.ok(!elenco.includes("Stai per spostare ${athletesCount}"));
  assert.ok(
    elenco.includes(
      "Stai per ${getBulkActionLabel(pendingBulkAction.action)} ${athletesCount}",
    ),
  );
  for (const label of [
    "rendere attivi",
    "disattivare",
    "sospendere",
    "mettere in prestito",
    "eliminare",
  ]) {
    assert.ok(elenco.includes(`"${label}"`), `manca l'etichetta ${label}`);
  }
  assert.match(
    elenco,
    /typedConfirmation=\{bulkTargetCount > 20 \? "ELIMINA" : undefined\}/,
  );
  assert.match(
    elenco,
    /`Elimina \$\{formatInteger\(bulkTargetCount\)\} atleti`/,
  );
  assert.match(
    elenco,
    /<DangerConfirmDialog\s+open=\{pendingBulkAction\?\.action === "delete"\}/,
  );
  assert.match(
    elenco,
    /<ConfirmDialog\s+open=\{Boolean\(pendingBulkAction\) && pendingBulkAction\?\.action !== "delete"\}/,
  );
});

test("§2.3e · la conferma singola: le conseguenze della V1, «Elimina atleta»", () => {
  assert.ok(elenco.includes('title="Eliminare questo atleta?"'));
  assert.ok(elenco.includes('confirmLabel="Elimina atleta"'));
  assert.ok(
    elenco.includes(
      "La scheda e le appartenenze alle categorie vengono rimosse.",
    ),
  );
  assert.ok(
    elenco.includes(
      "Le rate e i movimenti già registrati restano in contabilità.",
    ),
  );
  assert.ok(
    elenco.includes(
      "Se questa persona ha file, consensi, richieste o consegne documentali, l'eliminazione non parte: apri la sua scheda e usa la sezione «Dati personali».",
    ),
  );
  assert.match(elenco, /deleteClubAthlete\(clubId, athleteId\)/);
});

test("§2.4 · viste, filtri e ricerca", async () => {
  const { ATHLETE_VIEWS, ATHLETE_CERTIFICATE_VIEWS, buildAthleteFilters } =
    await import("../../src/components/athletes/v2/athlete-grid-model.ts");
  assert.deepEqual(
    ATHLETE_VIEWS.map((v) => v.label),
    [
      "Attivi",
      "Sospesi",
      "In prestito",
      "Disattivati",
      "Certificato scaduto",
      "Certificato in scadenza",
    ],
  );
  assert.deepEqual(
    ATHLETE_CERTIFICATE_VIEWS.map((v) => v.tone),
    ["red", "amber"],
  );

  const filtri = buildAthleteFilters({
    categoryOptions: [{ value: "c1", label: "Under 15" }],
  });
  assert.deepEqual(
    filtri.map((f) => `${f.id}:${f.type}`),
    [
      "stato:select",
      "categoria:multi",
      "certificato:select",
      "iscrizione:boolean",
    ],
  );
  const senzaStato = buildAthleteFilters({
    categoryOptions: [],
    includeStatus: false,
  });
  assert.equal(
    senzaStato.some((f) => f.id === "stato"),
    false,
    "sopra la soglia lo stato lo sceglie la banda d'archivio",
  );

  const riga = {
    id: "a",
    groupId: "g",
    categoryId: "c1",
    status: "active",
    registrationComplete: false,
    medicalCertExpiry: "",
  };
  assert.equal(filtri[0].apply(riga, "active"), true);
  assert.equal(filtri[0].apply(riga, "loan"), false);
  assert.equal(filtri[1].apply(riga, ["c1"]), true);
  assert.equal(
    filtri[1].apply({ ...riga, categoryId: null }, ["__uncategorized__", "c1"]),
    filtri[1].apply({ ...riga, categoryId: null }, [
      String(
        (await import("../../src/lib/category-utils.ts"))
          .UNCATEGORIZED_CATEGORY_ID,
      ),
    ]),
  );
  assert.equal(filtri[2].apply(riga, "missing"), true);
  assert.equal(filtri[3].apply(riga, false), true);
  assert.equal(filtri[3].apply(riga, true), false);

  assert.ok(
    elenco.includes('placeholder: "Cerca per nome o cognome"'),
    "la ricerca in griglia sotto la soglia",
  );
  assert.ok(
    elenco.includes('placeholder="Cerca per nome o cognome"'),
    "la ricerca del server sopra la soglia",
  );
  assert.ok(elenco.includes('aria-label="Cerca atleti"'));
  assert.match(
    elenco,
    /window\.setTimeout\(\(\) => \{\s*void loadAthletePage\(1\);\s*\}, 250\);/,
    "250ms di pausa prima di chiedere al server",
  );
  assert.match(elenco, /search: searchQuery,/);
  assert.match(elenco, /siteId: selectedGroup\?\.siteId \|\| siteFilter,/);
  assert.match(elenco, /categoryId: selectedGroup\?\.categoryId \|\| "",/);
});

test("§2.4 · i parametri dell'indirizzo: clubId, action=new, action=import", () => {
  assert.match(
    elenco,
    /searchParams\.get\("clubId"\) \|\|\s*searchParams\.get\("organization_id"\) \|\|\s*searchParams\.get\("organizationId"\)/,
  );
  assert.match(
    elenco,
    /if \(action === "new"\) \{[\s\S]{0,200}router\.push\(buildNewAthleteHref\(resolveCurrentClubId\(\)\)\)/,
  );
  assert.match(
    elenco,
    /if \(action === "import"\) \{\s*setShowImportAthletesModal\(true\);/,
  );
  assert.match(elenco, /router\.replace\(nextUrl, \{ scroll: false \}\)/);
});

test("§2.6 · esportazione: PDF e CSV dal menu della griglia, colonne visibili, selezione se c'e", () => {
  assert.match(elenco, /kinds: \["csv", "pdf"\]/);
  assert.match(elenco, /printPeoplePdf\(\{/);
  assert.ok(elenco.includes('title: "Elenco Atleti"'));
  assert.ok(elenco.includes('countLabel: "Atleti esportati"'));
  assert.ok(elenco.includes('csvFileName("Elenco Atleti")'));
  for (const messaggio of [
    "Nessun atleta da esportare",
    "Consenti i popup per generare il PDF",
    "PDF pronto: si apre la finestra di stampa",
    "CSV scaricato",
  ]) {
    assert.ok(
      elenco.includes(`"${messaggio}"`),
      `manca il messaggio ${messaggio}`,
    );
  }
  assert.match(
    elenco,
    /if \(selectedRowIds\.size\) \{\s*return athletes\.filter\(\(athlete\) =>\s*selectedRowIds\.has\(athleteRowKey\(athlete\)\),/,
    "una selezione attiva vince, come nella V1",
  );
  assert.match(
    elenco,
    /request\.columns\.map\(\(column\) =>/,
    "le colonne esportate sono quelle visibili",
  );
});

test("§2.3a · l'import: cassetto largo, quattro passi, stesse parole", () => {
  const dialogo = strip(read(IMPORT));
  assert.match(dialogo, /<Drawer[\s\S]{0,200}width="wide"/);
  assert.ok(dialogo.includes('title="Importa atleti"'));
  for (const testo of [
    "Scegli il file da importare",
    "La prima riga deve contenere i nomi delle colonne.",
    "Seleziona file",
    "Lettura in corso",
    "Cambia file",
    "Righe lette",
    "Importabili",
    "Da scartare",
    "Mappatura colonne",
    "Non assegnata",
    "Solo righe con problemi",
    "Scartata:",
    "Importata con avviso:",
    "Pronta",
    "Scrittura in corso:",
    "Non chiudere la pagina",
    "Importati",
    "Scartati in anteprima",
    "Errori in scrittura",
    "Importa un altro file",
    "Chiudi",
    "Annulla",
  ]) {
    assert.ok(dialogo.includes(testo), `manca «${testo}» nell'import`);
  }
  assert.match(dialogo, /accept="\.csv,\.xls,\.xlsx,\.xml"/);
  assert.match(
    dialogo,
    /locked=\{running\}/,
    "mentre scrive il cassetto non si chiude",
  );
  assert.match(elenco, /addClubAthletesBatch\(/);
});

test("§2.8 · gli stati: scheletro, vuoto, filtrato-vuoto, errore, senza club", () => {
  assert.match(
    elenco,
    /state=\{\s*loadError\s*\? "error"\s*: loading \|\| pageLoading\s*\? "loading"\s*: "ready"\s*\}/,
  );
  assert.match(elenco, /onRetry=\{\(\) => void refreshAthletesData\(\)\}/);
  assert.ok(elenco.includes('title="Club non selezionato"'));
  assert.ok(
    elenco.includes(
      'description="Seleziona un club per visualizzare e gestire gli atleti"',
    ),
  );
  assert.ok(elenco.includes("Vai alla Dashboard"));
  assert.ok(
    elenco.includes('title="Nessun atleta in archivio"'),
    "il modulo vuoto (pattern 8)",
  );
  assert.ok(elenco.includes("Aggiungi il primo atleta"));
  assert.ok(elenco.includes("Errore nel caricamento dei dati"));
  assert.ok(
    elenco.includes(": nessuno in elenco"),
    "vuoto con filtro di stato, senza CTA di creazione",
  );
});

test("§2.7 · nessun permesso client oltre la guardia: l'accesso lo governano ruolo e perimetro", () => {
  assert.equal(/hasPermission|PERMISSIONS\.|can[A-Z]\w+\(/.test(v2), false);
});

/* ═══════════════════════════════════════ /athletes/new — il modulo (§3) */

test("§3.1–3.2 · la pagina: titolo, sottotitolo, ritorno, avviso senza club", () => {
  const nuovo = strip(read(NUOVO));
  assert.match(nuovo, /<PageHeader[\s\S]{0,200}title="Nuovo atleta"/);
  assert.ok(
    nuovo.includes(
      "Obbligatori nome, cognome e data di nascita. Il resto si può compilare ora o dopo.",
    ),
  );
  assert.ok(nuovo.includes('aria-label="Torna agli atleti"'));
  assert.match(
    nuovo,
    /Seleziona prima un club dalla tua area account, poi torna\s+qui/,
  );
  assert.match(
    nuovo,
    /const backHref = clubId \? `\/athletes\?clubId=\$\{clubId\}` : "\/athletes";/,
  );
  assert.match(
    nuovo,
    /router\.push\(saved\?\.id \? `\/athletes\/\$\{saved\.id\}` : backHref\)/,
    "dopo il salvataggio si va sulla scheda",
  );
  for (const messaggio of [
    "Club o utente non trovato",
    "Errore durante la creazione dell'atleta",
    "Atleta ${draft.firstName} ${draft.lastName} iscritto con successo",
  ]) {
    assert.ok(nuovo.includes(messaggio), `manca il messaggio ${messaggio}`);
  }
  assert.match(nuovo, /addClubAthlete\(clubId, \{/);
  assert.match(nuovo, /getClubCategories\(clubId\)/);
  assert.match(nuovo, /getClubFederationOptions\(clubId\)/);
  assert.match(
    nuovo,
    /<DirtyGuardDialog/,
    "la freccia chiede prima di buttare via cio che e scritto",
  );
});

test("§3.3 · il modulo: campi, sezioni, valori di partenza, guardia", () => {
  const form = strip(read(FORM));
  for (const campo of [
    'idPrefix="athlete-create-membership"',
    "AthleteCategoryMembershipEditor",
    "Categoria suggerita in automatico per l&apos;anno di nascita:",
    'id="nationality"',
    'id="email"',
    'id="athlete-create-phone"',
    'id="address"',
    'id="streetNumber"',
    'idPrefix="athlete-create-address"',
    'id="medicalCertExpiry"',
    'id="bloodType"',
    'id="allergies"',
    'id="emergencyContact"',
    'id="athlete-create-emergency-phone"',
    'idPrefix="athlete-create-clothing"',
    "Genitore/tutore ",
    "Togli",
    "Aggiungi genitore/tutore",
    "Parentela",
    "Padre",
    "Madre",
    "Tutore Legale",
    "Nonno",
    "Nonna",
    "Altro",
    'id="registrationFederation"',
    "Nessun tesseramento",
    'id="registrationNumber"',
    'id="registrationStatus"',
    "In corso",
    "Attivo",
    "Scaduto",
    'id="registrationIssueDate"',
    'id="registrationExpiryDate"',
    "Nessuna federazione registrata nel club",
    'id="notes"',
    "Annotazioni sull'atleta",
  ]) {
    assert.ok(form.includes(campo), `manca «${campo}» nel modulo`);
  }
  assert.ok(form.includes('nationality: "Italiana"'));
  assert.ok(form.includes('country: "Italia"'));
  assert.ok(form.includes('registrationStatus: "In corso"'));
  assert.ok(form.includes("Nome, cognome e data di nascita sono obbligatori"));
  assert.match(form, /<ValidationSummary errors=\{validationErrors\} \/>/);
  assert.match(form, /<FormGrid/);
  assert.match(form, /<Panel as="section">/);
  assert.match(form, /sticky bottom-0/, "la barra delle azioni resta in vista");
  assert.ok(form.includes("Modifiche non salvate"));
  assert.ok(form.includes('"Salvataggio…" : "Salva atleta"'));
  assert.match(form, /<DirtyGuardDialog/);
  assert.equal(
    form.includes("jerseyNumber"),
    false,
    "il numero di maglia non si raccoglie qui (ADR-0057)",
  );
});
