import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **I due difetti del sesto round** (PP-03 §16).
 *
 * §15.4 aveva invertito la regola su `athletes.data`: chi vede lo stato e non
 * il contenuto legge per elenco di ammessi. Il sesto round ha attaccato la
 * **definizione di quel lettore** e la **profondita** del taglio, e ha vinto
 * due volte.
 *
 * 1. Il lettore era `readerSeesStatusOnly`, cioe «ha `clinical.status_read`
 *    **e non** `clinical.read`». Un ruolo di club derivato da `trainer` a cui
 *    la societa toglie **anche** la chiave dello stato non ha nessuna delle
 *    due, quindi non era «questo lettore», quindi leggeva `data` intera. La
 *    casella tolta dava **piu** dato: un privilegio invertito.
 * 2. I contenitori erano ammessi **per nome** e passavano **interi**. Dentro
 *    `guardians`, `clothingSizes`, `categories` e `payments` qualunque chiave
 *    arrivava all'allenatore — cioe di nuovo il posto in cui il testo libero si
 *    nasconde, che e la ragione stessa per cui i contenitori erano stati messi
 *    su un elenco di ammessi.
 *
 * Come le prove di §15.4, queste **non elencano i nomi noti**: usano nomi
 * inventati qui, che e l'unico modo di misurare un default. E ognuna misura il
 * verso opposto, cioe cosa deve continuare ad arrivare.
 */

let permessi;

before(async () => {
  permessi = await import("../../src/lib/health/permissions.ts");
});

/* --------------------------------------------------- §16.1 — il lettore -- */

test("PP-03 §16.1 · togliere `clinical.status_read` a un ruolo non gli da piu dato", () => {
  const data = {
    name: "Nina",
    /* Due parole decise adesso: un elenco che le conoscesse non proverebbe niente. */
    referenzaDelMedico: "PAROLA-INVENTATA-A",
    schedaDiValutazione: { esito: "PAROLA-INVENTATA-B" },
  };

  /*
    Il gettone di un ruolo di club porta le chiavi dopo `#`. Il primo ha la
    chiave dello stato, il secondo no: prima di §16.1 il **secondo** leggeva di
    piu.
  */
  const conStato = "custom:trainer:vice#events.read,clinical.status_read";
  const senzaStato = "custom:trainer:aiuto#events.read";

  for (const ruolo of ["trainer", conStato, senzaStato]) {
    const uscito = permessi.stripClinicalAthleteFields(data, ruolo);
    const testo = JSON.stringify(uscito);
    assert.ok(
      !testo.includes("PAROLA-INVENTATA-A"),
      `il ruolo ${ruolo} non deve leggere un campo semplice non dichiarato`,
    );
    assert.ok(
      !testo.includes("PAROLA-INVENTATA-B"),
      `il ruolo ${ruolo} non deve leggere un contenitore non dichiarato`,
    );
    assert.equal(uscito.name, "Nina", "il nome resta: e cio per cui la scheda si apre");
  }
});

test("PP-03 §16.1 · il predicato ha un solo termine, e fallisce chiuso", () => {
  /* Chi ha titolo al contenuto clinico non legge per elenco di ammessi. */
  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    assert.equal(
      permessi.readerReadsDeclaredAthleteFieldsOnly(ruolo),
      false,
      `${ruolo} ha clinical.read: legge la colonna intera`,
    );
  }

  /* Chi non ce l'ha, si — qualunque sia la ragione per cui non ce l'ha. */
  for (const ruolo of [
    "trainer",
    "custom:trainer:aiuto#events.read",
    null,
    "",
    "ruolo-che-non-esiste",
  ]) {
    assert.equal(
      permessi.readerReadsDeclaredAthleteFieldsOnly(ruolo),
      true,
      `${String(ruolo)} non ha clinical.read: legge per elenco di ammessi`,
    );
  }
});

/* ---------------------------------------------- §16.2 — i contenitori --- */

test("PP-03 §16.2 · un contenitore ammesso non e un lasciapassare per cio che ha dentro", () => {
  const data = {
    name: "Nina",
    guardians: [
      {
        name: "Mara",
        surname: "Sonda",
        phone: "+39 333 1111111",
        relationship: "madre",
        /* Il nome del campo lo decidiamo qui: e il punto della prova. */
        promemoriaRiservato: "PAROLA-DENTRO-TUTORE",
      },
    ],
    clothingSizes: {
      shirtSize: "M",
      esitoVisita: "PAROLA-DENTRO-TAGLIE",
    },
    categories: [{ id: "cat-a", name: "Under 12", appunto: "PAROLA-DENTRO-CATEGORIE" }],
    payments: [
      {
        id: "p1",
        amount: 120,
        description: "Quota annuale",
        annotazione: "PAROLA-DENTRO-PAGAMENTI",
      },
    ],
  };

  const uscito = permessi.stripClinicalAthleteFields(data, "trainer");
  const testo = JSON.stringify(uscito);

  for (const parola of [
    "PAROLA-DENTRO-TUTORE",
    "PAROLA-DENTRO-TAGLIE",
    "PAROLA-DENTRO-CATEGORIE",
    "PAROLA-DENTRO-PAGAMENTI",
  ]) {
    assert.ok(!testo.includes(parola), `${parola} non deve uscire da un contenitore`);
  }

  /* E il verso opposto: cio che la scheda dell'allenatore disegna resta. */
  assert.equal(uscito.guardians[0].name, "Mara");
  assert.equal(
    uscito.guardians[0].phone,
    "+39 333 1111111",
    "chi allena deve poter chiamare una famiglia: e la ragione per cui `guardians` non e clinico",
  );
  assert.equal(uscito.guardians[0].relationship, "madre");
  assert.equal(uscito.clothingSizes.shirtSize, "M");
  assert.equal(uscito.categories[0].name, "Under 12");
  assert.equal(uscito.payments[0].amount, 120);
  assert.equal(uscito.payments[0].description, "Quota annuale");
});

test("PP-03 §16.2 · un valore composto dentro un contenitore non esce mai", () => {
  /*
    Il secondo posto in cui nascondere un referto: non una chiave nuova accanto
    al telefono, ma un oggetto sotto un nome **ammesso**. E la stessa forma che
    §15.4 ha chiuso su `medical_certificates.data.source`.
  */
  const data = {
    guardians: [
      {
        name: "Mara",
        phone: "+39 333 1111111",
        /* `name` e dichiarato per `guardians`, ma qui e un oggetto. */
        relationship: { testo: "PAROLA-COMPOSTA" },
      },
    ],
  };

  const uscito = permessi.stripClinicalAthleteFields(data, "trainer");
  assert.ok(!JSON.stringify(uscito).includes("PAROLA-COMPOSTA"));
  assert.equal(uscito.guardians[0].name, "Mara");
  assert.equal(uscito.guardians[0].phone, "+39 333 1111111");
});

test("PP-03 §16.2 · un contenitore di sole stringhe passa com'e", () => {
  /*
    `categoryIds` e `category_names` sono elenchi di parole, non di voci: non
    hanno campi da vagliare, e vagliarli li svuoterebbe. E il modo piu facile di
    sbagliare questa correzione — e la stessa trappola di §15.3, dove la prima
    stesura filtrava la forma sbagliata e faceva sparire la nota legittima.
  */
  const data = {
    categoryIds: ["cat-a", "cat-b"],
    category_names: ["Under 12", "Under 14"],
  };

  const uscito = permessi.stripClinicalAthleteFields(data, "trainer");
  assert.deepEqual(uscito.categoryIds, ["cat-a", "cat-b"]);
  assert.deepEqual(uscito.category_names, ["Under 12", "Under 14"]);
});

test("PP-03 §16.2 · dentro le appartenenze resta la sede, che e il perimetro stesso", () => {
  /*
    **La trappola della correzione, e vale piu del difetto.**

    `filterTrainerDashboardRecords` gira sulla riga **gia proiettata**: il ramo
    dei gruppi ricade su `record.category_memberships`, che `serializeRecord`
    compone da `data.categoryMemberships`. La prima stesura dell'elenco non
    aveva `site_id`, e l'allenatore dei `Pulcini · Scauri` ha smesso di vedere
    **i propri** atleti — la proiezione gli aveva tolto il campo con cui il suo
    stesso recinto lo riconosce. Non un dato che esce: un atleta che sparisce.
  */
  const data = {
    categoryMemberships: [
      { category_id: "pulcini", site_id: "sede-scauri", is_primary: true },
    ],
  };

  const uscito = permessi.stripClinicalAthleteFields(data, "trainer");
  assert.equal(uscito.categoryMemberships[0].category_id, "pulcini");
  assert.equal(
    uscito.categoryMemberships[0].site_id,
    "sede-scauri",
    "senza la sede il perimetro di gruppo non riconosce piu i propri atleti",
  );
  assert.equal(uscito.categoryMemberships[0].is_primary, true);
});

test("PP-03 §16.2 · senza un ruolo dichiarato i contenitori restano interi", () => {
  /*
    Il taglio piu profondo vale per il **lettore ristretto**, non per chiunque:
    `parent-dashboard` e `auth/athlete-profile` chiamano questa funzione senza
    ruolo, e li dentro c'e la scheda che una famiglia legge del proprio figlio.
  */
  const data = {
    guardians: [{ name: "Mara", promemoriaDelClub: "VALORE-DEL-CLUB" }],
  };

  const uscito = permessi.stripClinicalAthleteFields(data, undefined);
  assert.equal(uscito.guardians[0].promemoriaDelClub, "VALORE-DEL-CLUB");
});
