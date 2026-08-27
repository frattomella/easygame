import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il sistema anagrafico e completo? (Blocco 8, punto A)
 *
 * Il Blocco 7 aveva introdotto il campo telefono condiviso, la
 * capitalizzazione e il codice fiscale assistito — ma solo nei **moduli di
 * creazione**. Chi apriva una scheda esistente e correggeva un numero
 * ritrovava il campo di testo libero di prima: due comportamenti diversi per
 * lo stesso dato, a seconda di come ci si era arrivati.
 *
 * Questi test elencano le superfici una per una. Un elenco esplicito e piu
 * noioso di una regola generica, ed e l'unico modo perche l'aggiunta di una
 * sesta anagrafica non passi inosservata: chi la aggiunge deve venire qui.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

/** Tutte le superfici in cui una persona ha un recapito telefonico. */
const PHONE_SURFACES = [
  ["app/athletes/[id]/page.tsx", "scheda atleta (atleta e genitore)"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  ["app/soci/[id]/page.tsx", "scheda socio"],
  ["app/organization/page.tsx", "scheda club"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["components/forms/AthleteCreateForm.tsx", "nuovo atleta"],
];

test("il campo telefono condiviso e su ogni anagrafica, creazione e modifica", () => {
  for (const [file, label] of PHONE_SURFACES) {
    const source = read(file);
    assert.match(
      source,
      /<PhoneField/,
      `${label} (${file}) deve usare PhoneField, non un input libero`,
    );
  }
});

test("nessuna anagrafica ha piu un input di telefono fatto in casa", () => {
  for (const [file, label] of PHONE_SURFACES) {
    const source = read(file);

    /*
      Un `<Input>` il cui valore e un campo `phone`. Il campo condiviso monta
      il proprio `<Input type="tel">` dentro di se, ma questi file non lo
      contengono: montano il componente.
    */
    const homemade =
      /<Input\s[^>]*value=\{[^}]*(phone|Phone)\b/.test(source);

    assert.equal(
      homemade,
      false,
      `${label} (${file}): resta un campo telefono scritto a mano`,
    );
  }
});

/**
 * Le nove anagrafiche di **persona fisica**.
 *
 * Da RC Fix 2 (punto 1) non montano piu nome, cognome, data, luogo, sesso e
 * codice fiscale una per una: montano il blocco condiviso
 * `PersonIdentityFields`, che li disegna sempre nello stesso ordine. Questo
 * elenco resta esplicito — piu noioso di una regola generica, e l'unico modo
 * perche l'aggiunta di una decima anagrafica non passi inosservata.
 */
const PERSON_IDENTITY_SURFACES = [
  ["app/athletes/[id]/page.tsx", "scheda atleta (atleta e genitore)"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  /*
    La scheda socio era l'ultima anagrafica di persona senza codice fiscale:
    il modulo di creazione lo raccoglieva, la scheda non lo mostrava e non lo
    modificava, quindi un codice sbagliato alla creazione era definitivo
    (Blocco A, punto 10).
  */
  ["app/soci/[id]/page.tsx", "scheda socio"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["components/forms/AthleteCreateForm.tsx", "nuovo atleta e genitore/tutore"],
];

test("ogni anagrafica di persona monta il blocco di identita condiviso", () => {
  for (const [file, label] of PERSON_IDENTITY_SURFACES) {
    assert.match(
      read(file),
      /<PersonIdentityFields/,
      `${label} (${file}) deve montare PersonIdentityFields, non sei campi propri`,
    );
  }
});

/**
 * Nessuna anagrafica di persona rimonta per conto suo i campi del blocco.
 *
 * E la meta che conta: montare il blocco **e anche** tenersi la vecchia
 * casella «Luogo di Nascita» accanto produce due controlli per lo stesso dato,
 * ed e esattamente cio che le schede allenatore e staff avevano prima.
 */
test("nessuna anagrafica di persona duplica i campi del blocco", () => {
  for (const [file, label] of PERSON_IDENTITY_SURFACES) {
    const source = read(file);

    assert.equal(
      /<AssistedFiscalCodeField/.test(source),
      false,
      `${label} (${file}): il codice fiscale arriva dal blocco, non montato a parte`,
    );
    assert.equal(
      /<BirthPlaceField/.test(source),
      false,
      `${label} (${file}): il luogo di nascita arriva dal blocco`,
    );
    assert.equal(
      /Luogo di Nascita<\/Label>/.test(source),
      false,
      `${label} (${file}): resta una seconda casella per il luogo di nascita`,
    );
  }
});

/**
 * Il blocco condiviso contiene davvero cio che le nove schede si aspettano.
 *
 * L'elenco sopra verifica che le schede lo montino; questo verifica che
 * montarlo basti. Senza, un blocco svuotato passerebbe entrambi i controlli.
 */
test("il blocco di identita porta capitalizzazione, comune e codice fiscale", () => {
  const block = read("components/forms/person-identity-fields.tsx");

  assert.match(
    block,
    /<CapitalizedInput/,
    "nome e cognome devono avere la maiuscola automatica condivisa",
  );
  assert.match(
    block,
    /<BirthPlaceField/,
    "il luogo di nascita e cio che produce il codice catastale",
  );
  assert.match(
    block,
    /<AssistedFiscalCodeField/,
    "il codice fiscale deve restare assistito, non un campo nudo",
  );
  assert.match(
    block,
    /normalizeGenderLetter\(values\.gender\)/,
    "il sesso passa dal normalizzatore condiviso",
  );
  assert.match(
    block,
    /<SelectItem value="M">Maschio<\/SelectItem>/,
    "il sesso e una scelta fra due lettere, non testo libero",
  );
});

/**
 * Il codice fiscale del club resta un caso a parte, e dichiarato.
 *
 * Il legale rappresentante ha un codice che si puo **verificare** ma non
 * calcolare: la scheda club non raccoglie ne data di nascita ne sesso. Monta
 * quindi il solo campo assistito, con il calcolo spento.
 */
test("la scheda club verifica il codice fiscale del rappresentante senza calcolarlo", () => {
  const source = read("app/organization/page.tsx");

  assert.match(source, /<AssistedFiscalCodeField/);
  assert.match(
    source,
    /enableCompute=\{false\}/,
    "senza data e sesso il calcolo sarebbe una promessa che il form non mantiene",
  );
  assert.match(
    source,
    /<CapitalizedInput/,
    "nome e cognome del rappresentante vogliono la maiuscola automatica",
  );
});

/**
 * Il sesso serve al codice fiscale, e serve **normalizzato**.
 *
 * Nelle schede di allenatore e staff era un campo di testo libero: ci finiva
 * «M», «maschio», «Maschile», e il calcolo non poteva funzionare su tre
 * grafie diverse dello stesso dato.
 */
test("il sesso e una scelta, non testo libero, dove serve al codice fiscale", () => {
  for (const file of [
    "app/trainers/[id]/page.tsx",
    "app/staff/[id]/page.tsx",
    "app/soci/[id]/page.tsx",
  ]) {
    const source = read(file);
    const freeText =
      /<Input\s+value=\{editFormData\.gender[^}]*\}/.test(source);

    assert.equal(freeText, false, `${file}: il sesso e ancora testo libero`);
  }
});

/* ------------------------------------------- lettura documenti (Blocco 8, C) */

/**
 * Dove si compila un'anagrafica a partire da un documento.
 *
 * Il Blocco 7 aveva costruito il flusso; il Blocco 8 lo porta anche sul
 * **genitore/tutore**, che era l'anagrafica rimasta fuori — e non per una
 * ragione tecnica: un genitore ha un documento d'identita come chiunque
 * altro, e trascriverlo a mano e lo stesso lavoro che si e tolto agli altri.
 */
const DOCUMENT_READER_SURFACES = [
  ["components/forms/AthleteCreateForm.tsx", "nuovo atleta"],
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["app/athletes/[id]/page.tsx", "genitore/tutore"],
];

test("la lettura documenti e su tutte le anagrafiche di persona", () => {
  for (const [file, label] of DOCUMENT_READER_SURFACES) {
    assert.match(
      read(file),
      /<DocumentExtractionField/,
      `${label} (${file}) deve poter compilare da un documento`,
    );
  }
});

/**
 * La regola che non cambia mai: **si propone, non si scrive.**
 *
 * Un OCR sbaglia, e in un'anagrafica sportiva un dato sbagliato che nessuno
 * ha guardato finisce su un tesseramento. Se un giorno il componente
 * applicasse da solo, questo test lo direbbe.
 */
test("nessuna superficie applica i dati letti senza passare dalla conferma", () => {
  const field = read("components/forms/document-extraction-field.tsx");

  assert.match(
    field,
    /disabled=\{!accepted\.size\}/,
    "il pulsante «Applica» deve dipendere da una scelta esplicita",
  );
  assert.match(
    field,
    /acceptExtractedFields\(result\.fields, Array\.from\(accepted\)\)/,
    "si applicano solo i campi accettati, non tutto il risultato",
  );

  for (const [file, label] of DOCUMENT_READER_SURFACES) {
    const source = read(file);
    const mounts = source.match(/<DocumentExtractionField[\s\S]*?\/>/g) || [];

    for (const mount of mounts) {
      assert.match(
        mount,
        /onApply=/,
        `${label}: il campo deve ricevere onApply, non scrivere da solo`,
      );
      assert.match(
        mount,
        /currentValues=/,
        `${label}: senza currentValues non si sa cosa si sta per sovrascrivere`,
      );
    }
  }
});

/* ------------------------------------------- taglie di persona (Blocco A, 13) */

/**
 * Le taglie di una persona non sono un dato di sola scrittura.
 *
 * **Il difetto.** Il Blocco 7 aveva aggiunto profilo, maglia, pantalone e
 * scarpe ai moduli di creazione di allenatore, staff e socio. Nessuna delle
 * tre schede di dettaglio le mostrava: un dato raccolto una volta e mai piu
 * raggiungibile, che pero `person-export.ts` continuava a stampare in una
 * colonna dell'export. Chi aveva sbagliato la taglia al primo inserimento non
 * aveva nessun modo di correggerla, e chi la leggeva nell'export non sapeva
 * da dove venisse.
 *
 * L'elenco e esplicito per la stessa ragione degli altri di questo file: una
 * quarta anagrafica con le taglie deve passare di qui.
 */
const CLOTHING_SIZE_SURFACES = [
  ["app/trainers/new/page.tsx", "nuovo allenatore", "create"],
  ["app/staff/new/page.tsx", "nuovo staff", "create"],
  ["app/soci/new/page.tsx", "nuovo socio", "create"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore", "detail"],
  ["app/staff/[id]/page.tsx", "scheda staff", "detail"],
  ["app/soci/[id]/page.tsx", "scheda socio", "detail"],
];

test("le taglie si raccolgono alla creazione e si correggono dalla scheda", () => {
  for (const [file, label] of CLOTHING_SIZE_SURFACES) {
    assert.match(
      read(file),
      /<ClothingSizesFields/,
      `${label} (${file}) deve montare il campo taglie condiviso`,
    );
  }
});

test("ogni scheda di persona mostra le taglie che ha in archivio", () => {
  for (const [file, label, kind] of CLOTHING_SIZE_SURFACES) {
    if (kind !== "detail") continue;

    assert.match(
      read(file),
      /<ClothingSizesSummary/,
      `${label} (${file}): le taglie si salvano ma non si leggono`,
    );
  }
});

/**
 * Nessun numero di maglia sulle persone che non scendono in campo.
 *
 * Il numero appartiene all'atleta e vive nei gruppi di numerazione (WP-44).
 * Darlo a un dirigente creerebbe conflitti dentro un gruppo per un dato che
 * non serve a nessuno.
 */
test("le taglie di allenatore, staff e socio non portano un numero di maglia", () => {
  const field = read("components/forms/clothing-sizes-fields.tsx");

  assert.equal(
    /jerseyNumber|numero di maglia.*<(Input|select)/i.test(field),
    false,
    "il campo taglie non deve raccogliere un numero di maglia",
  );
});

/**
 * Una regola sola per il sesso, non una copia per scheda.
 *
 * Era una tripla condizione ricopiata dentro il `value` di due `select`. Tre
 * copie della stessa regola sono tre occasioni di scriverla diversa, ed e
 * esattamente cosi che in archivio erano finite «M», «maschio» e «Maschile».
 */
test("il sesso si normalizza in un posto solo", () => {
  const registry = read("lib/italian-registry.ts");

  assert.match(
    registry,
    /export const normalizeGenderLetter/,
    "il normalizzatore del sesso deve essere condiviso, non privato",
  );

  /*
    Da RC Fix 2 la normalizzazione sta nel blocco condiviso e non piu in tre
    schede: le copie da controllare sono zero, e questo test verifica che
    restino zero.
  */
  for (const file of [
    "app/trainers/[id]/page.tsx",
    "app/staff/[id]/page.tsx",
    "app/soci/[id]/page.tsx",
    "components/forms/person-identity-fields.tsx",
  ]) {
    const source = read(file);

    assert.equal(
      /toUpperCase\(\)\.startsWith\('M'\)/.test(source),
      false,
      `${file}: resta una copia inline della normalizzazione del sesso`,
    );
  }

  assert.match(
    read("components/forms/person-identity-fields.tsx"),
    /normalizeGenderLetter/,
    "il blocco condiviso deve usare il normalizzatore, non riscriverlo",
  );
});

/* ------------------------------------------------ CAP assistito (Blocco A, 9) */

/**
 * Il CAP si propone e non si impone.
 *
 * E la stessa regola del codice fiscale, per la stessa ragione: un CAP gia
 * digitato viene da una busta o da un documento in mano all'operatore, e
 * sovrascriverlo con un valore di tabella significa perdere il dato piu
 * affidabile dei due.
 */
test("il CAP si compila solo se il campo e vuoto", () => {
  const source = read("components/forms/assisted-anagrafica.tsx");

  assert.match(
    source,
    /if \(!currentPostalCode\) patch\.postalCode = comune\.postalCode;/,
    "il CAP proposto sovrascrive quello inserito a mano",
  );
});

/**
 * E si propone **solo** dove il comune ne ha uno solo.
 *
 * Per i comuni con piu CAP il dataset sa che ce n'e piu d'uno e non sa quale
 * sia quello dell'indirizzo: riempire il campo lo riempirebbe male, e in
 * silenzio.
 */
test("il CAP non si compila dove il comune ne ha piu di uno", () => {
  const source = read("components/forms/assisted-anagrafica.tsx");

  assert.match(
    source,
    /comune\.postalCodeStatus === "unique"/,
    "il CAP si compila senza verificare che sia univoco",
  );
  assert.match(
    source,
    /comune\.postalCodeStatus === "ambiguous"/,
    "un comune con piu CAP deve dirlo all'operatore, non tacere",
  );
});

/**
 * Un punto di lettura non deve avere un elenco chiuso di campi.
 *
 * **Il difetto che questo test impedisce di ripetere.** La scheda socio
 * costruiva il proprio stato con dodici chiavi scritte a mano. Il modulo di
 * creazione ne scriveva ventuno: data di nascita, sesso, comune, codice
 * catastale, codice fiscale, indirizzo, citta, CAP e taglie non arrivavano
 * mai alla scheda. Il dato non si perdeva — `updateClubDataItem` fonde
 * l'elemento invece di sostituirlo — ma restava invisibile, e quindi
 * incorreggibile.
 *
 * E un difetto che si vede solo a schermo, con un socio vero davanti: i
 * campi *esistono* nel JSX, e nessuna invariante statica sul JSX se ne
 * accorge. Questo test guarda l'altro lato — che i campi mostrati siano anche
 * quelli caricati.
 */
test("la scheda socio carica tutti i campi che la creazione scrive", () => {
  const detail = read("app/soci/[id]/page.tsx");
  const create = read("app/soci/new/page.tsx");

  /* I campi che il modulo di creazione mette nel record del socio. */
  const written = [
    "fiscalCode",
    "birthDate",
    "gender",
    "birthPlace",
    "birthPlaceCode",
    "clothingSizes",
    "address",
    "city",
    "postalCode",
  ];

  for (const field of written) {
    assert.match(
      create,
      new RegExp(`${field}:`),
      `il modulo di creazione non scrive piu ${field}: aggiorna questo elenco`,
    );
    assert.match(
      detail,
      new RegExp(`${field}: memberData\.${field}`),
      `la scheda socio non carica ${field}: il campo si scrive e non si legge`,
    );
  }
});

/**
 * La residenza di una persona passa da un componente solo.
 *
 * **Il difetto.** `AssistedAddressFields` — con provincia, regione e nazione —
 * stava sulla scheda del club e su quella dell'atleta. Le sei anagrafiche di
 * persona chiedono tre campi soli, e per questo ne avevano tre `<Input>`
 * liberi ciascuna: sei copie dello stesso blocco, nessuna con la ricerca del
 * comune, nessuna con il CAP. L'assistenza anagrafica arrivava dove il form
 * era gia complesso e mancava dove era semplice, cioe dove si digita di piu.
 */
const RESIDENCE_SURFACES = [
  ["app/trainers/new/page.tsx", "nuovo allenatore"],
  ["app/staff/new/page.tsx", "nuovo staff"],
  ["app/soci/new/page.tsx", "nuovo socio"],
  ["app/trainers/[id]/page.tsx", "scheda allenatore"],
  ["app/staff/[id]/page.tsx", "scheda staff"],
  ["app/soci/[id]/page.tsx", "scheda socio"],
];

test("la residenza di una persona usa il campo condiviso, non tre input liberi", () => {
  for (const [file, label] of RESIDENCE_SURFACES) {
    const source = read(file);

    assert.match(
      source,
      /<PersonResidenceFields/,
      `${label} (${file}) deve montare il campo residenza condiviso`,
    );

    /*
      Un `<Input>` o un `<CapitalizedInput>` il cui valore e un `postalCode`:
      il componente condiviso monta il proprio dentro di se, ma questi file
      non lo contengono — montano il componente.
    */
    assert.equal(
      /<(Capitalized)?Input\s[^>]*(id="postalCode"|value=\{[^}]*postalCode)/.test(source),
      false,
      `${label} (${file}): resta un campo CAP scritto a mano`,
    );
  }
});

/**
 * Dove si sceglie un comune, il CAP lo porta il comune.
 *
 * Il componente condiviso e l'unico posto in cui questa regola vive: se un
 * domani qualcuno rimettesse un input libero, il test sopra lo direbbe, e se
 * togliesse la proposta dal componente lo direbbe questo.
 */
test("il campo residenza propone il CAP dal comune scelto", () => {
  const source = read("components/forms/assisted-anagrafica.tsx");
  const component = source.slice(source.indexOf("export function PersonResidenceFields"));

  assert.match(component, /<ComuneAutocomplete/);
  assert.match(
    component,
    /comune\.postalCodeStatus === "unique"/,
    "il CAP si compila senza verificare che sia univoco",
  );
  assert.match(
    component,
    /if \(!current\) patch\.postalCode = comune\.postalCode;/,
    "il CAP proposto sovrascrive quello inserito a mano",
  );
});
