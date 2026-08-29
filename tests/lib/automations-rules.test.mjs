import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * Il dominio puro delle automazioni (W2-A, G-03/G-04/G-58).
 *
 * Qui non c'e database, non c'e rete e non c'e orologio: sono le regole che
 * decidono **se** un messaggio parte oggi. Sbagliarle non produce una
 * schermata storta, produce trecento email a famiglie reali — o, peggio,
 * nessuna email il giorno in cui contava.
 */

let catalogo;
let regole;
let riepilogo;

before(async () => {
  catalogo = await import("../../src/lib/automations/catalog.ts");
  regole = await import("../../src/lib/automations/rules.ts");
  riepilogo = await import("../../src/lib/automations/digest.ts");
});

/* ----------------------------------------------------------- il catalogo */

test("i trigger sono quattro e il catalogo e chiuso", () => {
  assert.deepEqual(
    [...catalogo.AUTOMATION_TRIGGER_KINDS],
    ["installment_due", "installment_overdue", "certificate", "event_rsvp"],
  );

  assert.throws(
    () => catalogo.getAutomationTrigger("contratto_in_scadenza"),
    /Automazione sconosciuta/,
    "un trigger inventato deve fallire, non salvare una regola che non parte mai",
  );
});

test("gli anticipi predefiniti sono quelli del planning", () => {
  const attesi = {
    installment_due: [7, 3],
    installment_overdue: [1, 15],
    certificate: [30, 7, 0],
    event_rsvp: [2],
  };

  for (const [kind, giorni] of Object.entries(attesi)) {
    assert.deepEqual(
      catalogo.AUTOMATION_TRIGGERS[kind].defaultOffsetDays,
      giorni,
      `${kind} non ha gli anticipi del §4.1`,
    );
  }
});

/* ------------------------------------------------------------ le regole */

test("una regola nasce spenta", () => {
  for (const rule of regole.buildDefaultAutomationRules()) {
    assert.equal(
      rule.enabled,
      false,
      "accendere un'automazione e una decisione del club, non un default",
    );
  }
});

test("gli anticipi rifiutano cio che non e un anticipo", () => {
  const casi = [
    [[-1], /non possono essere negativi/],
    [[7, 7], /ripetuto/],
    [[7, 3, 1, 0], /Troppi anticipi/],
    [[7.5], /numero intero/],
    [[], /almeno un anticipo/],
    [[400], /troppo grande/],
  ];

  for (const [valori, atteso] of casi) {
    assert.throws(
      () => regole.normalizeAutomationOffsets(valori, "before"),
      atteso,
      `${JSON.stringify(valori)} doveva essere rifiutato`,
    );
  }
});

test("gli anticipi si ordinano come scattano, non per numero", () => {
  assert.deepEqual(
    regole.normalizeAutomationOffsets([3, 30, 7], "before"),
    [30, 7, 3],
    "su una scadenza futura parte prima il piu lontano",
  );
  assert.deepEqual(
    regole.normalizeAutomationOffsets([15, 1], "after"),
    [1, 15],
    "su una rata gia scaduta parte prima il piu vicino",
  );
});

test("il riepilogo non si applica alla famiglia", () => {
  const rule = regole.normalizeAutomationRule({
    trigger: "installment_due",
    enabled: true,
    audience: "family",
    delivery: "digest",
  });

  assert.equal(
    rule.delivery,
    "immediate",
    "una famiglia riceve il messaggio che la riguarda, non l'elenco del club",
  );
});

test("le quattro regole ci sono sempre tutte, anche se in archivio ce n'e una", () => {
  const lette = regole.normalizeAutomationRules([
    { trigger: "certificate", enabled: true },
  ]);

  assert.equal(lette.length, 4);
  assert.equal(lette.find((r) => r.trigger === "certificate").enabled, true);
  assert.equal(lette.find((r) => r.trigger === "event_rsvp").enabled, false);
});

/* --------------------------------------------------------- gli anticipi */

test("un anticipo scatta il giorno esatto, e non recupera all'indietro", () => {
  const scelta = (daysToDate, direction = "before", offsetDays = [7, 3]) =>
    regole.selectFiringOffset({ offsetDays, direction, daysToDate });

  assert.equal(scelta(7), 7, "il giorno dei sette giorni prima");
  assert.equal(scelta(3), 3, "il giorno dei tre giorni prima");
  assert.equal(scelta(5), null, "in mezzo non parte niente");
  assert.equal(
    scelta(2),
    null,
    "accendere la regola dopo il settimo giorno non recupera il messaggio dei sette",
  );
  assert.equal(scelta(-1), null, "una scadenza passata non e un anticipo");
});

test("su una rata scaduta gli anticipi si contano dopo la data", () => {
  const scelta = (daysToDate) =>
    regole.selectFiringOffset({
      offsetDays: [1, 15],
      direction: "after",
      daysToDate,
    });

  assert.equal(scelta(-1), 1, "il giorno dopo la scadenza");
  assert.equal(scelta(-15), 15);
  assert.equal(scelta(-7), null);
  assert.equal(scelta(3), null, "una rata non ancora scaduta non e in ritardo");
});

test("i giorni si contano sul calendario, non sulle ore", () => {
  const from = new Date("2026-11-23T23:30:00");
  const to = new Date("2026-11-30T00:10:00");
  assert.equal(regole.daysBetween(from, to), 7);
});

/* --------------------------------------------------------- la deduplica */

test("la chiave di deduplica si legge, e cambia con l'anticipo", () => {
  const base = {
    ruleId: "AUT-01",
    triggerKind: "installment_due",
    subjectId: "atleta-9",
    occurrenceId: "rata-99",
  };

  assert.equal(
    regole.buildAutomationDedupKey({ ...base, offsetDays: 7 }),
    "automation:AUT-01:installment_due:atleta-9:rata-99:7",
  );

  assert.notEqual(
    regole.buildAutomationDedupKey({ ...base, offsetDays: 7 }),
    regole.buildAutomationDedupKey({ ...base, offsetDays: 3 }),
    "senza l'anticipo nella chiave il promemoria dei tre giorni non partirebbe mai",
  );

  assert.notEqual(
    regole.buildAutomationDedupKey({ ...base, offsetDays: 7 }),
    regole.buildAutomationDedupKey({
      ...base,
      subjectId: "atleta-10",
      offsetDays: 7,
    }),
    "due atleti sono due occorrenze",
  );
});

test("il giorno del riepilogo e una chiave sola per club", () => {
  assert.equal(regole.toDayKey(new Date("2026-11-30T22:00:00")), "2026-11-30");
  assert.equal(
    regole.buildAutomationDigestDedupKey("2026-11-30"),
    "automation:digest:2026-11-30",
  );
});

/* -------------------------------------------------------- il riepilogo */

test("il riepilogo raggruppa per fatto e non manda nulla se e vuoto", () => {
  assert.equal(
    riepilogo.buildDailyDigest({
      clubName: "ASD Alfa",
      dayLabel: "30/11/2026",
      entries: [],
    }),
    null,
    "un riepilogo vuoto insegna a ignorare le email",
  );

  const digest = riepilogo.buildDailyDigest({
    clubName: "ASD Alfa",
    dayLabel: "30/11/2026",
    entries: [
      {
        triggerKind: "certificate",
        subjectName: "Rossi Luca",
        detail: "Certificato in scadenza",
        when: "15/12/2026",
      },
      {
        triggerKind: "installment_due",
        subjectName: "Bianchi Marco",
        detail: "Rata di novembre: 130,00 euro da versare",
        when: "30/11/2026",
      },
      {
        triggerKind: "installment_due",
        subjectName: "Alberti Sara",
        detail: "Rata di novembre: 90,00 euro da versare",
        when: "30/11/2026",
      },
    ],
  });

  assert.equal(digest.total, 3);
  assert.deepEqual(
    digest.groups.map((group) => group.triggerKind),
    ["installment_due", "certificate"],
    "l'ordine e quello del catalogo, cosi il riepilogo di martedi ha la forma di quello di lunedi",
  );
  assert.deepEqual(
    digest.groups[0].entries.map((entry) => entry.subjectName),
    ["Alberti Sara", "Bianchi Marco"],
  );
  assert.match(digest.subject, /3 avvisi/);
  assert.match(digest.text, /Rata di novembre: 90,00 euro/);
});

test("il riepilogo neutralizza cio che qualcuno ha scritto in anagrafica", () => {
  const digest = riepilogo.buildDailyDigest({
    clubName: "ASD <script>alert(1)</script>",
    dayLabel: "30/11/2026",
    entries: [
      {
        triggerKind: "certificate",
        subjectName: "<b>Rossi</b>",
        detail: "Certificato scaduto",
        when: "",
      },
    ],
  });

  assert.equal(digest.html.includes("<script>"), false);
  assert.equal(digest.html.includes("<b>Rossi</b>"), false);
  assert.match(digest.html, /&lt;b&gt;Rossi&lt;\/b&gt;/);
});
