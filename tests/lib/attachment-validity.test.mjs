import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * La validita di un documento (Wave 3, W3-G).
 *
 * **Perche questi test contano.** Lo stato di un documento non e scritto da
 * nessuna parte: si ricava da due date e da oggi, e da quello stato dipende se
 * una famiglia riceve un promemoria. Sbagliare un bordo di un giorno non
 * produce una schermata storta — produce un promemoria che **non parte mai**,
 * perche il motore delle automazioni pretende la corrispondenza esatta con
 * l'anticipo e non recupera all'indietro.
 *
 * I casi sono i bordi: oggi, ieri, domani, il giorno esatto della soglia,
 * l'assenza di scadenza, l'intervallo rovesciato, e l'ora del giorno in cui il
 * giro notturno gira.
 */

let modello;
let regole;

before(async () => {
  modello = await import("../../src/lib/attachments.ts");
  regole = await import("../../src/lib/automations/rules.ts");
});

/* Un giovedi qualunque, alle sei del mattino come il giro notturno. */
const OGGI = new Date("2026-11-23T06:00:00.000Z");

const stato = (validUntil, options, validFrom = null) =>
  modello.deriveAttachmentValidity(
    { validFrom, validUntil },
    OGGI,
    options || {},
  ).state;

/* ------------------------------------------------------------ i bordi */

test("il giorno della scadenza il documento vale ancora", () => {
  const validita = modello.deriveAttachmentValidity(
    { validUntil: "2026-11-23" },
    OGGI,
  );

  assert.equal(
    validita.state,
    "expiring",
    "«fino a quando il documento vale» include quel giorno: e l'ultimo buono, non il primo scaduto",
  );
  assert.equal(validita.daysToExpiry, 0);
});

test("il giorno dopo la scadenza il documento e scaduto", () => {
  const validita = modello.deriveAttachmentValidity(
    { validUntil: "2026-11-22" },
    OGGI,
  );

  assert.equal(validita.state, "expired");
  assert.equal(validita.daysToExpiry, -1);
});

test("domani e in scadenza, non scaduto", () => {
  assert.equal(stato("2026-11-24"), "expiring");
});

test("la soglia dell'anticipo e inclusiva, e il giorno dopo no", () => {
  /* Trenta giorni esatti: 23 novembre + 30 = 23 dicembre. */
  assert.equal(
    stato("2026-12-23", { expiringWithinDays: 30 }),
    "expiring",
    "il giorno della soglia rientra nella soglia",
  );
  assert.equal(
    stato("2026-12-24", { expiringWithinDays: 30 }),
    "valid",
    "un giorno oltre la soglia il documento e semplicemente valido",
  );
});

test("la soglia la dichiara chi chiede, non una costante", () => {
  assert.equal(stato("2026-12-01", { expiringWithinDays: 7 }), "valid");
  assert.equal(stato("2026-12-01", { expiringWithinDays: 60 }), "expiring");
  assert.equal(
    stato("2026-12-01"),
    "expiring",
    `senza soglia vale il predefinito di ${modello.ATTACHMENT_EXPIRY_WARNING_DAYS} giorni`,
  );
});

/* --------------------------------------------------- l'assenza di date */

test("senza scadenza lo stato e «senza scadenza», non «valido»", () => {
  const validita = modello.deriveAttachmentValidity({ validUntil: null }, OGGI);

  assert.equal(
    validita.state,
    "unknown",
    "chiamarlo valido sarebbe una promessa che nessuno ha fatto",
  );
  assert.equal(validita.daysToExpiry, null);
  assert.equal(validita.validUntil, null);
});

test("un allegato senza nessuna delle due date non e un errore", () => {
  assert.equal(modello.deriveAttachmentValidity({}, OGGI).state, "unknown");
});

test("un documento che entra in vigore dopo non e valido, qualunque scadenza abbia", () => {
  assert.equal(
    stato("2027-06-30", null, "2026-12-01"),
    "not_yet_valid",
    "«non ancora valido» e un fatto piu forte della scadenza lontana",
  );
  assert.equal(
    stato(null, null, "2026-12-01"),
    "not_yet_valid",
    "vale anche senza scadenza dichiarata",
  );
  assert.equal(
    stato("2027-06-30", null, "2026-11-23"),
    "valid",
    "il giorno stesso in cui entra in vigore il documento vale",
  );
});

/* ------------------------------------------------- mezzanotte e i fusi */

test("l'ora del giorno non sposta lo stato", () => {
  const ore = [
    "2026-11-23T00:00:00.000Z",
    "2026-11-23T06:00:00.000Z",
    "2026-11-23T23:59:59.999Z",
  ];

  for (const ora of ore) {
    assert.equal(
      modello.deriveAttachmentValidity(
        { validUntil: "2026-11-30" },
        new Date(ora),
      ).daysToExpiry,
      7,
      `alle ${ora} mancano ancora sette giorni`,
    );
  }
});

test("un istante con fuso e la sua data resa in giorno danno lo stesso esito", () => {
  /*
    La scadenza salvata come `DateTime` torna da Prisma come mezzanotte UTC.
    Se il confronto passasse dalla mezzanotte **locale** del processo, a New
    York la distanza sarebbe 6 invece di 7 — e con la corrispondenza esatta
    degli anticipi un 6 non e «un giorno di ritardo», e un promemoria che non
    parte mai.
  */
  const daGiorno = modello.deriveAttachmentValidity(
    { validUntil: "2026-11-30" },
    OGGI,
  );
  const daIstante = modello.deriveAttachmentValidity(
    { validUntil: new Date("2026-11-30T00:00:00.000Z") },
    OGGI,
  );

  assert.deepEqual(daIstante, daGiorno);
  assert.equal(daGiorno.validUntil, "2026-11-30", "esce come giorno, non come istante");
});

test("l'aritmetica dei giorni e la stessa del motore delle automazioni", () => {
  /*
    Le due funzioni sono scritte due volte di proposito — importare le regole
    dentro Attachment Core trascinerebbe il catalogo dei segnaposto in ogni
    schermata con un campo di caricamento — ma **non possono divergere**: un
    giorno di scarto fra le due sposterebbe l'anticipo di un giorno.
  */
  const casi = [
    ["2026-11-23T06:00:00.000Z", "2026-11-30T00:00:00.000Z"],
    ["2026-11-23T23:00:00.000Z", "2026-11-23T00:00:00.000Z"],
    ["2026-12-31T12:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["2026-03-28T12:00:00.000Z", "2026-04-04T00:00:00.000Z"],
  ];

  for (const [da, a] of casi) {
    assert.equal(
      modello.attachmentDaysBetween(new Date(da), new Date(a)),
      regole.daysBetween(new Date(da), new Date(a)),
      `le due misure divergono fra ${da} e ${a}`,
    );
  }
});

/* ---------------------------------------------------- la validazione */

test("un intervallo rovesciato viene rifiutato e dice cosa fare", () => {
  const esito = modello.validateAttachmentValidity({
    validFrom: "2026-12-01",
    validUntil: "2026-11-30",
  });

  assert.equal(esito.ok, false);
  assert.match(esito.message, /precedente all'inizio della validita/);
  assert.match(esito.message, /Correggi una delle due date/);
});

test("un intervallo di un giorno solo e valido", () => {
  const esito = modello.validateAttachmentValidity({
    validFrom: "2026-11-30",
    validUntil: "2026-11-30",
  });

  assert.equal(esito.ok, true);
  assert.equal(esito.validUntil.toISOString(), "2026-11-30T00:00:00.000Z");
});

test("una data illeggibile non passa in silenzio", () => {
  const esito = modello.validateAttachmentValidity({ validUntil: "trenta novembre" });

  assert.equal(esito.ok, false);
  assert.match(esito.message, /Scadenza non valida/);
  assert.match(esito.message, /AAAA-MM-GG/);
});

test("l'assenza delle date e un caso valido, non un errore", () => {
  const esito = modello.validateAttachmentValidity({});

  assert.equal(esito.ok, true);
  assert.equal(esito.validFrom, null);
  assert.equal(esito.validUntil, null);
});

/* ----------------------------------------------------- le categorie */

test("la categoria si riduce come in caricamento", () => {
  assert.equal(modello.normalizeAttachmentCategory("BLSD"), "blsd");
  assert.equal(
    modello.normalizeAttachmentCategory("Primo soccorso"),
    "primo-soccorso",
  );
  assert.equal(
    modello.normalizeAttachmentCategory("Documento d'identita"),
    "documento-d-identita",
  );
  assert.equal(modello.normalizeAttachmentCategory("  "), "");
});

test("le categorie del certificato medico si riconoscono comunque scritte", () => {
  for (const scritto of [
    "certificato-medico",
    "Certificato medico",
    "visita-medica",
    "Visita Medica",
    "medical-certificate",
  ]) {
    assert.equal(
      modello.isMedicalCertificateAttachmentCategory(scritto),
      true,
      `«${scritto}» deve restare fuori dall'innesco documentale`,
    );
  }

  assert.equal(modello.isMedicalCertificateAttachmentCategory("blsd"), false);
  assert.equal(modello.isMedicalCertificateAttachmentCategory(null), false);
});
