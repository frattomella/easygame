/**
 * **Le primitive del dominio dei tutori, e la totalita del censimento.**
 *
 * ---
 *
 * Due cose, e stanno insieme apposta.
 *
 * La prima e il **comportamento** delle primitive: il predicato dell'esclusione,
 * le grafie di un'identita, la fusione della proiezione, chi un documento nuovo
 * puo nominare, chi riceve un avviso. Sono pure, e si provano senza database:
 * sei difetti su questa fusione erano stati trovati da sonde che dovevano prima
 * scrivere un club, un atleta e tre righe.
 *
 * La seconda e la **totalita**: che nessun consumatore si ricostruisca le
 * regole in casa. Non e un elenco scritto qui — sarebbe l'elenco che invecchia
 * — ma la derivazione di `scripts/pp-02-censimento.mjs`, importata. Un
 * consumatore nuovo che nasca domani fa fallire questi test il giorno in cui
 * viene scritto.
 *
 * Contratto: `docs/knowledge-base/49-pp-02-invarianti-tutori.md`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { censimento } from "../../scripts/pp-02-censimento.mjs";
import {
  isGuardianExcluded,
  isGuardianRevoked,
  isGuardianContactOnly,
  foldGuardianExclusionMarks,
} from "../../src/lib/guardians/exclusion.ts";
import {
  resolveGuardianIdentity,
  guardianUserIdText,
  guardianEmailText,
  guardianRowNamedBy,
  readGuardianIdentityRegistry,
} from "../../src/lib/guardians/identity.ts";
import { guardianIdentityCandidates } from "../../src/lib/server/athlete-guardians.ts";
import { projectGuardianEntries } from "../../src/lib/guardians/projection.ts";
import {
  documentGuardianAt,
  resolveDocumentGuardians,
  resolveGuardianSubjectForUser,
} from "../../src/lib/guardians/documents.ts";
import {
  resolveNotificationGuardians,
  resolveNotificationRecipientUserIds,
} from "../../src/lib/guardians/notifications.ts";

/* =========================================================== A. l'esclusione */

test("A1 esclusa e un OR, non due AND: revocata oppure di solo recapito", () => {
  assert.equal(isGuardianExcluded({ accessRevokedAt: "2026-01-01" }), true);
  assert.equal(isGuardianExcluded({ contactOnly: true }), true);
  assert.equal(isGuardianExcluded({ accessRevokedAt: null, contactOnly: false }), false);
  assert.equal(isGuardianExcluded({}), false);
});

test("A2 vale sulla riga come sulla voce: quattro grafie della revoca", () => {
  /*
    Nessuna delle cinque stesure precedenti leggeva le grafie della **riga**:
    passare un `GuardianRow` a `intestabile` rispondeva «intestabile» su una
    riga revocata.
  */
  for (const chiave of [
    "accessRevokedAt",
    "access_revoked_at",
    "revokedAt",
    "revoked_at",
  ]) {
    assert.equal(
      isGuardianRevoked({ [chiave]: new Date("2026-01-01") }),
      true,
      `la grafia ${chiave} deve accendere il marchio`,
    );
    assert.equal(isGuardianExcluded({ [chiave]: "2026-01-01T00:00:00Z" }), true);
  }

  for (const chiave of ["contactOnly", "contact_only"]) {
    assert.equal(isGuardianContactOnly({ [chiave]: true }), true);
    assert.equal(isGuardianContactOnly({ [chiave]: false }), false);
  }
});

test("A3 un segno falso non esclude, in nessuna delle forme che un JSON usa", () => {
  for (const valore of [false, "", "false", "0", null, undefined, 0, "  "]) {
    assert.equal(
      isGuardianExcluded({ contactOnly: valore, accessRevokedAt: valore }),
      false,
      `${JSON.stringify(valore)} non e un marchio`,
    );
  }
});

test("A4 i marchi si piegano con la stessa domanda che li legge", () => {
  /*
    Il difetto del quindicesimo vaglio: due righe escluse in **due modi
    diversi** — una revocata, una di solo recapito — perdevano entrambi i
    marchi perche l'OR era stato ripiegato con due AND indipendenti. La voce
    usciva viva, e la ricevuta nuova si intestava a chi il club aveva escluso.
  */
  const piegati = foldGuardianExclusionMarks([
    { contact_only: true },
    { revoked_at: new Date("2026-02-02") },
  ]);

  assert.equal(piegati.contactOnly, true);
  assert.equal(String(piegati.accessRevokedAt).startsWith("2026-02-02"), true);
});

test("A5 una riga viva fra due escluse tiene viva la voce", () => {
  const piegati = foldGuardianExclusionMarks([
    { contact_only: true },
    { revoked_at: new Date("2026-02-02") },
    {},
  ]);

  assert.equal(piegati.contactOnly, false);
  assert.equal(piegati.accessRevokedAt, null);
});

test("A6 nessuna riga non e «tutte escluse»", () => {
  assert.deepEqual(foldGuardianExclusionMarks([]), {
    accessRevokedAt: null,
    contactOnly: false,
  });
});

/* ============================================================ B. l'identita */

test("B1 le quattro grafie dell'utenza e le tre dell'indirizzo, insieme", () => {
  const identita = resolveGuardianIdentity({
    linkedUserId: "U-1",
    user_id: "U-2",
    email: "Madre@Esempio.IT",
    linked_user_email: "altra@esempio.it",
    legacy_id: "L-9",
  });

  assert.deepEqual(identita.userIds, ["u-1", "u-2"]);
  assert.deepEqual(identita.emails, ["madre@esempio.it", "altra@esempio.it"]);
  assert.equal(identita.handles.includes("l-9"), true);
  assert.equal(identita.all.includes("u-2"), true);
});

test("B2 l'utenza da usare salta quelle che il registro dichiara revocate", () => {
  /*
    Una riga con due utenze — una chiusa e una viva — sopravvive per la viva.
    Restituire la prima delle due significava mandare l'avviso proprio a chi
    era stato escluso: e il buco che i due gemelli avevano tutti e due.
  */
  const revocate = readGuardianIdentityRegistry(["u-vecchia"]);

  assert.equal(
    guardianUserIdText({ linkedUserId: "U-vecchia", userId: "U-viva" }, revocate),
    "U-viva",
  );
  assert.equal(
    guardianUserIdText({ linkedUserId: "U-vecchia", userId: "U-viva" }),
    "U-vecchia",
  );
});

test("B3 l'indirizzo si legge nell'ordine in cui e scritto, senza normalizzarlo", () => {
  assert.equal(
    guardianEmailText({ linkedUserEmail: "b@x.it", email: "A@x.it" }),
    "A@x.it",
  );
});

/* =========================================================== C. la fusione */

const riga = (campi) => ({
  id: campi.id,
  organization_id: "club",
  athlete_id: "atleta",
  identity_key: campi.identity_key ?? campi.email ?? campi.id,
  user_id: campi.user_id ?? null,
  email: campi.email ?? null,
  first_name: campi.first_name ?? null,
  last_name: campi.last_name ?? null,
  phone: campi.phone ?? null,
  relationship: null,
  contact_only: Boolean(campi.contact_only),
  linked_at: null,
  revoked_at: campi.revoked_at ?? null,
  access_token_value: null,
  access_token_status: null,
  access_token_expires_at: null,
  access_token_generated_at: null,
  legacy_id: campi.legacy_id ?? null,
  data: campi.data ?? {},
  position: campi.position ?? 0,
});

test("C1 due righe sulla stessa posizione fanno una voce sola", () => {
  const voci = projectGuardianEntries([
    riga({ id: "a", position: 0, first_name: "Madre" }),
    riga({ id: "b", position: 0, first_name: "Padre" }),
    riga({ id: "c", position: 1, first_name: "Nonna" }),
  ]);

  assert.equal(voci.length, 2);
  assert.equal(voci[0].name, "Madre");
  assert.equal(voci[1].name, "Nonna");
});

test("C2 in una voce mista vince la riga viva, e i suoi campi vuoti restano vuoti", () => {
  /*
    Il difetto peggiore delle due tornate precedenti: la madre revocata ha
    codice fiscale, indirizzo e telefono; il padre vivo non li ha; la ricevuta
    usciva a nome del **padre** con il **codice fiscale della madre**. Un dato
    personale di una persona esclusa consegnato ad altri, e un documento
    fiscalmente falso.
  */
  const [voce] = projectGuardianEntries([
    riga({
      id: "madre",
      position: 0,
      first_name: "Madre",
      phone: "333",
      revoked_at: new Date("2026-01-01"),
      data: { fiscalCode: "CF-MADRE", address: "Via Madre 1" },
    }),
    riga({ id: "padre", position: 0, first_name: "Padre", data: {} }),
  ]);

  assert.equal(voce.name, "Padre");
  assert.equal(voce.fiscalCode, undefined);
  assert.equal(voce.address, undefined);
  assert.equal(voce.phone, null);
  assert.equal(voce.accessRevokedAt, null, "la voce non e esclusa: una riga e viva");
});

test("C3 con tre righe — recapito, revocata, viva — vince ancora la viva", () => {
  /*
    Il corollario A3 del quindicesimo vaglio: l'accumulatore perdeva i marchi
    al secondo passo, e al terzo la riga viva non vinceva piu. La scheda
    mostrava chi aveva compilato un modulo pubblico, e il genitore vivo
    spariva.
  */
  const [voce] = projectGuardianEntries([
    riga({ id: "estraneo", position: 0, first_name: "Estraneo", contact_only: true }),
    riga({
      id: "revocata",
      position: 0,
      first_name: "Revocata",
      revoked_at: new Date("2026-01-01"),
    }),
    riga({ id: "viva", position: 0, first_name: "Viva" }),
  ]);

  assert.equal(voce.name, "Viva");
  assert.equal(voce.contactOnly, false);
  assert.equal(voce.accessRevokedAt, null);
});

test("C4 tutte escluse in due modi diversi: la voce porta entrambi i marchi", () => {
  const [voce] = projectGuardianEntries([
    riga({ id: "uno", position: 0, first_name: "Uno", contact_only: true }),
    riga({
      id: "due",
      position: 0,
      first_name: "Due",
      revoked_at: new Date("2026-03-03"),
    }),
  ]);

  assert.equal(voce.contactOnly, true);
  assert.equal(String(voce.accessRevokedAt).startsWith("2026-03-03"), true);
  assert.equal(isGuardianExcluded(voce), true);
});

test("C5 la traccia di chi sta dietro non porta i dati della persona esclusa", () => {
  const [voce] = projectGuardianEntries([
    riga({
      id: "madre",
      position: 0,
      first_name: "Madre",
      revoked_at: new Date("2026-01-01"),
      data: { fiscalCode: "CF-MADRE" },
    }),
    riga({ id: "padre", position: 0, first_name: "Padre" }),
  ]);

  assert.equal(Array.isArray(voce.escluseDietro), true);
  assert.equal(voce.escluseDietro.length, 1);
  assert.equal(voce.escluseDietro[0].id, "madre");
  assert.equal(
    JSON.stringify(voce.escluseDietro).includes("CF-MADRE"),
    false,
    "la traccia non porta i dati fiscali dell'esclusa",
  );
});

test("C6 una riga esclusa che sta da sola non ha nessuno dietro", () => {
  const [voce] = projectGuardianEntries([
    riga({ id: "sola", position: 0, contact_only: true }),
  ]);

  assert.equal(voce.escluseDietro, undefined);
});

test("C7 l'indirizzo che apre cade con l'esclusione, quello di recapito no", () => {
  const [viva] = projectGuardianEntries([
    riga({ id: "v", position: 0, email: "viva@x.it" }),
  ]);
  const [esclusa] = projectGuardianEntries([
    riga({ id: "e", position: 0, email: "esclusa@x.it", contact_only: true }),
  ]);

  assert.equal(viva.linkedUserEmail, "viva@x.it");
  assert.equal(esclusa.linkedUserEmail, null);
  assert.equal(esclusa.email, "esclusa@x.it", "al club serve per scriverle");
});

test("C8 le voci escono ordinate per posizione, non per ordine di lettura", () => {
  const voci = projectGuardianEntries([
    riga({ id: "b", position: 2, first_name: "B" }),
    riga({ id: "a", position: 1, first_name: "A" }),
  ]);

  assert.deepEqual(
    voci.map((v) => v.name),
    ["A", "B"],
  );
});

/* ========================================================== D. i documenti */

test("D1 una voce esclusa risponde vuoto, e la posizione non slitta", () => {
  const data = {
    guardians: [
      { id: "0", name: "Escluso", contactOnly: true },
      { id: "1", name: "Vivo" },
    ],
  };

  assert.equal(documentGuardianAt(data, 0), null);
  assert.equal(documentGuardianAt(data, 1).name, "Vivo");
  assert.equal(resolveDocumentGuardians(data).length, 2);
});

test("D2 una posizione che non esiste e una posizione esclusa danno la stessa risposta", () => {
  const data = { guardians: [{ id: "0", accessRevokedAt: "2026-01-01" }] };

  assert.equal(documentGuardianAt(data, 0), null);
  assert.equal(documentGuardianAt(data, 5), null);
  assert.equal(documentGuardianAt(data, -1), null);
  assert.equal(documentGuardianAt(data, Number.NaN), null);
});

test("D3 una persona esclusa non e il soggetto di un modulo che apre", () => {
  /*
    La bozza di rinnovo pescava il tutore dalla proiezione leggendo le quattro
    grafie dell'utenza e **non** i marchi, mentre la sua guardia decideva sulle
    righe: due oggetti diversi per la stessa domanda.
  */
  const data = {
    guardians: [
      { userId: "u-escluso", name: "Escluso", contactOnly: true },
      { linked_user_id: "u-vivo", name: "Vivo" },
    ],
  };

  assert.equal(resolveGuardianSubjectForUser(data, "u-escluso"), null);
  assert.equal(resolveGuardianSubjectForUser(data, "U-VIVO").name, "Vivo");
  assert.equal(resolveGuardianSubjectForUser(data, ""), null);
  assert.equal(resolveGuardianSubjectForUser(data, "u-estraneo"), null);
});

/* ======================================================== E. le notifiche */

test("E1 un legame dichiarato e non revocato vince sul registro", () => {
  /*
    Il caso ordinario di ADR-0114: madre e padre con **un solo indirizzo di
    famiglia**. La revoca della madre mette quell'indirizzo nel registro, e
    senza questa uscita chiudeva i canali anche al padre.
  */
  const destinatari = resolveNotificationGuardians({
    guardians: [
      { userId: "u-padre", email: "famiglia@x.it" },
      { userId: "u-madre", email: "famiglia@x.it" },
    ],
    revokedGuardianIdentities: ["u-madre", "famiglia@x.it"],
  });

  assert.equal(destinatari.length, 1);
  assert.equal(destinatari[0].linkedUserId, "u-padre");
  assert.equal(
    destinatari[0].linkedUserEmail,
    "",
    "l'indirizzo revocato non esce nemmeno da una riga superstite",
  );
});

test("E2 le quattro grafie, e non due: `userId` tiene in piedi il canale", () => {
  /*
    Il difetto misurato: su una riga `{ userId, email }` l'accesso funzionava,
    i solleciti funzionavano, i promemoria funzionavano, e le notifiche
    documentali no.
  */
  const destinatari = resolveNotificationGuardians({
    guardians: [{ userId: "u-1", email: "uno@x.it" }],
  });

  assert.deepEqual(destinatari, [
    { linkedUserId: "u-1", linkedUserEmail: "uno@x.it" },
  ]);
});

test("E3 il marchio di riga e il registro dei soli recapiti chiudono entrambi", () => {
  const perMarchio = resolveNotificationGuardians({
    guardians: [{ email: "estraneo@x.it", contactOnly: true }],
  });
  const perRegistro = resolveNotificationGuardians({
    guardians: [{ email: "estraneo@x.it" }],
    contactOnlyIdentities: ["estraneo@x.it"],
  });

  assert.deepEqual(perMarchio, []);
  assert.deepEqual(perRegistro, []);
});

test("E4 la scelta fra elenco e coppia storica si fa sul contenuto grezzo", () => {
  /*
    Guardandola **dopo** il filtro, un atleta i cui tutori fossero tutti
    revocati ricadeva su `parent1`/`parent2`: cioe la revoca faceva
    **comparire** destinatari invece di toglierli.
  */
  const tuttiRevocati = resolveNotificationGuardians({
    guardians: [{ email: "madre@x.it", accessRevokedAt: "2026-01-01" }],
    parent1: { email: "storico@x.it" },
  });

  assert.deepEqual(tuttiRevocati, []);

  const soloStorici = resolveNotificationGuardians({
    parent1: { email: "storico@x.it" },
  });

  assert.equal(soloStorici.length, 1);
  assert.equal(soloStorici[0].linkedUserEmail, "storico@x.it");
});

test("E5 la coppia storica onora le stesse tre difese dell'elenco", () => {
  assert.deepEqual(
    resolveNotificationGuardians({
      parent1: { email: "storico@x.it", contact_only: true },
      parent2: { email: "altro@x.it", access_revoked_at: "2026-01-01" },
    }),
    [],
  );
});

test("E6 l'utenza dell'atleta entra fra i destinatari, e il registro la filtra", () => {
  const conAtleta = resolveNotificationRecipientUserIds({
    user_id: "u-atleta",
    data: { guardians: [{ userId: "u-padre" }] },
  });

  assert.deepEqual(conAtleta, ["u-atleta", "u-padre"]);

  const atletaRevocato = resolveNotificationRecipientUserIds({
    user_id: "u-atleta",
    data: {
      guardians: [{ userId: "u-padre" }],
      revokedGuardianIdentities: ["u-atleta"],
    },
  });

  assert.deepEqual(atletaRevocato, ["u-padre"]);
});

/* ============================ G. i reperti della revisione indipendente */

test("G1 un residuo dentro `data` non marca una riga viva (R6)", () => {
  /*
    `projectGuardianRow` non riemette le grafie della **riga**, e il predicato
    unico — totale sulle due forme, e deve esserlo — le leggeva dal residuo.
    Un tutore vivo risultava escluso: spariva dal destinatario fiscale, dai
    segnaposto e dal soggetto di una pratica, e con `billingGuardianIndex`
    puntato su di lui chi paga cambiava persona.
  */
  for (const chiave of ["revoked_at", "revokedAt", "contact_only", "contactOnly"]) {
    const [voce] = projectGuardianEntries([
      riga({
        id: "vivo",
        position: 0,
        first_name: "Vivo",
        data: { fiscalCode: "CF-VIVO", [chiave]: "2020-01-01T00:00:00.000Z" },
      }),
    ]);

    assert.equal(
      isGuardianExcluded(voce),
      false,
      `un residuo \`${chiave}\` non e un marchio`,
    );
    assert.equal(voce.fiscalCode, "CF-VIVO", "e il dato utile resta");
  }
});

test("G2 il residuo non presta nemmeno un'utenza o una chiave (R6)", () => {
  const [voce] = projectGuardianEntries([
    riga({
      id: "vivo",
      position: 0,
      data: { user_id: "u-fantasma", identity_key: "chiave-fantasma" },
    }),
  ]);

  assert.equal(voce.linkedUserId, null);
  assert.equal(voce.identity_key, undefined);
  assert.equal(voce.user_id, undefined);
});

test("G3 una voce non-oggetto occupa il suo posto e non fa slittare (R12)", () => {
  const data = { guardians: [null, { id: "1", name: "Padre" }] };

  assert.equal(documentGuardianAt(data, 0), null, "il posto 0 non e il padre");
  assert.equal(documentGuardianAt(data, 1)?.name, "Padre");
  assert.equal(resolveDocumentGuardians(data).length, 2);
});

test("G4 il marchio della riga vince sul legame dichiarato (R3)", () => {
  /*
    La §3 del travaso marca `contact_only` **per identita** senza azzerare
    `user_id`: nasce una riga esclusa che porta un'utenza. L'uscita «un legame
    dichiarato vince» stava prima del marchio, e quella riga riceveva su tutti
    e tre i canali — promemoria, notifiche documentali e solleciti degli
    insoluti con il link per pagare.
  */
  assert.deepEqual(
    resolveNotificationGuardians({
      guardians: [{ userId: "u-madre", email: "madre@x.it", contactOnly: true }],
    }),
    [],
  );

  assert.deepEqual(
    resolveNotificationGuardians({
      guardians: [
        { userId: "u-madre", email: "madre@x.it", accessRevokedAt: "2026-01-01" },
      ],
    }),
    [],
  );
});

test("G5 ma vince ancora sul registro, che e per identita (R3, ADR-0114)", () => {
  /*
    L'uscita resta dov'e per la ragione per cui era nata: madre e padre con un
    solo indirizzo di famiglia, e la revoca di uno che mette quell'indirizzo
    nel registro. La riga viva del padre non porta marchi, e non deve perdere
    i propri canali.
  */
  const destinatari = resolveNotificationGuardians({
    guardians: [
      { userId: "u-padre", email: "famiglia@x.it" },
      { userId: "u-madre", email: "famiglia@x.it", accessRevokedAt: "2026-01-01" },
    ],
    revokedGuardianIdentities: ["u-madre", "famiglia@x.it"],
  });

  assert.equal(destinatari.length, 1);
  assert.equal(destinatari[0].linkedUserId, "u-padre");
});

test("G6 se la proiezione ha girato, il blob storico e morto (R5)", () => {
  /*
    «Ogni lettore storico consulta la coppia solo quando `guardians` e vuoto, e
    dopo il travaso non lo e piu» era falso: torna vuoto appena si toglie
    l'ultima riga — il gesto piu ordinario che ci sia — e il travaso non
    cancella `parent1`/`parent2`. L'ex tutore continuava a ricevere per sempre.
  */
  assert.deepEqual(
    resolveNotificationGuardians({
      guardians: [],
      parent1: { email: "storica@x.it", linkedUserId: "u-storica" },
    }),
    [],
    "l'autorita ha parlato, e ha detto «nessuno»",
  );

  /* Senza la chiave, invece, la proiezione non ha mai girato: il blob vale. */
  const maiProiettato = resolveNotificationGuardians({
    parent1: { email: "storica@x.it", linkedUserId: "u-storica" },
  });
  assert.equal(maiProiettato.length, 1);
});

test("G7 la maniglia di un gettone nomina la riga in tutte e tre le forme (R1)", () => {
  /*
    «Cio che la revoca chiude deve contenere cio che il riscatto collega.» Le
    due porte se lo chiedevano con due predicati diversi: un invito coniato
    sull'indirizzo era riscattabile e **non** chiudibile.
  */
  const r = {
    id: "11111111-1111-4111-8111-111111111111",
    legacy_id: "guardian-0-vecchio",
    identity_key: "madre@x.it",
  };

  assert.equal(guardianRowNamedBy(r, r.id), true);
  assert.equal(guardianRowNamedBy(r, "guardian-0-vecchio"), true);
  assert.equal(guardianRowNamedBy(r, "Madre@X.IT"), true, "la chiave si normalizza");
  assert.equal(guardianRowNamedBy(r, "estraneo@x.it"), false);
  assert.equal(guardianRowNamedBy(r, ""), false);
  assert.equal(guardianRowNamedBy({ identity_key: "" }, ""), false);
});

test("G8 la guardia vede tutte le identita che la riga si portera (R2)", () => {
  /*
    `guardianIdentityKey` sceglie l'utenza quando c'e, e l'indirizzo usciva dal
    vaglio: una riga nasceva viva con l'indirizzo verificato di un terzo, e
    `findGuardianLinks` apriva a quella persona l'area famiglia del minore.
  */
  assert.deepEqual(
    guardianIdentityCandidates({ userId: "U-1", email: "Madre@X.IT" }),
    ["u-1", "madre@x.it"],
  );
  assert.deepEqual(guardianIdentityCandidates({ email: "Madre@X.IT" }), [
    "madre@x.it",
  ]);
  assert.deepEqual(guardianIdentityCandidates({ legacyId: "L-9" }), ["riga:L-9"]);
  assert.deepEqual(guardianIdentityCandidates({}), []);
});

/* ===================================================== F. la totalita */

const CENSIMENTO = censimento();

test("F1 il censimento e verde: cinque proprieta, nessuna eccezione", () => {
  const rossi = CENSIMENTO.esiti.filter((esito) => !esito.ok);

  assert.deepEqual(
    rossi.map((esito) => ({ titolo: esito.titolo, trovato: esito.trovato })),
    [],
  );
});

test("F2 ogni percorso che tocca il dominio e classificato, e nessuno di piu", () => {
  /*
    Derivato: l'elenco lo produce l'albero, non questa riga. Un consumatore
    nuovo fa fallire questo test il giorno in cui viene scritto.
  */
  const nonClassificati = CENSIMENTO.percorsi.filter(
    (percorso) => !CENSIMENTO.tabella[percorso],
  );
  const invecchiati = Object.keys(CENSIMENTO.tabella).filter(
    (percorso) => !CENSIMENTO.percorsi.includes(percorso),
  );

  assert.deepEqual(nonClassificati, []);
  assert.deepEqual(invecchiati, []);
});

test("F3 ogni canonico importa una primitiva che il modulo esporta davvero", () => {
  /*
    Non «il testo contiene la parola»: la stesura precedente lo faceva, e un
    **commento** che citasse `revokeGuardianRow` bastava a dichiarare canonico
    un file che si ricostruiva le regole in casa.
  */
  const canonici = Object.entries(CENSIMENTO.tabella).filter(
    ([, voce]) => voce.canonico,
  );

  assert.equal(canonici.length > 0, true, "il censimento deve avere canonici");

  for (const [percorso] of canonici) {
    const primitive = CENSIMENTO.primitiveImportate(percorso);
    assert.equal(
      primitive.length > 0,
      true,
      `${percorso} non importa nessuna primitiva canonica`,
    );
  }
});

test("F4 chi decide chi riceve o chi compare e dichiarato canonico", () => {
  /*
    La classificazione e un giudizio, e un giudizio sbagliato costa: questo
    file era «dominio puro lato client, presentazione», e da li escono i
    solleciti degli insoluti con un collegamento a gettone per pagare. Era il
    terzo gemello, e nessuno lo contava fra i lettori che decidono.
  */
  for (const percorso of [
    "src/lib/athlete-guardians.ts",
    "src/lib/documents/fiscal-recipient.ts",
    "src/lib/server/document-placeholders.ts",
    "src/lib/server/document-requests.ts",
    "src/lib/server/medical-certificate-reminders.ts",
    "src/lib/server/form-submissions.ts",
    "src/lib/server/enrollment-requests.ts",
  ]) {
    assert.equal(
      CENSIMENTO.tabella[percorso]?.canonico,
      true,
      `${percorso} decide chi riceve o chi compare: deve essere canonico`,
    );
  }
});
