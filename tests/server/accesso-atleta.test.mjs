import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'accesso EasyGame di un atleta** (W6-25, W6-26, W6-27, W6-33, W6-34).
 *
 * Il ruolo `athlete` era modellato da capo a fondo e **nessun percorso
 * scriveva `athletes.user_id`**: un ruolo irraggiungibile. Questi test
 * provano la **classe** del difetto e non l'istanza, e la maggioranza prova
 * il **diniego** — un test che verificasse solo cio che una segretaria puo
 * fare passerebbe anche se tutti potessero tutto.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-6c00-4000-8000-00000000000b";

const SEGRETERIA = "11111111-6c00-4000-8000-000000000aaa";
const ALLENATORE = "22222222-6c00-4000-8000-000000000bbb";
const GENITORE = "33333333-6c00-4000-8000-000000000ccc";
const ESTRANEO = "44444444-6c00-4000-8000-000000000ddd";
const UTENTE_ATLETA = "55555555-6c00-4000-8000-000000000eee";

const ATLETA = "aaaa1111-6c00-4000-8000-00000000aaaa";
const COMPAGNO = "bbbb2222-6c00-4000-8000-00000000bbbb";
const ATLETA_ALTRUI = "cccc3333-6c00-4000-8000-00000000cccc";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = (activeRole, userId = SEGRETERIA, organizationId = CLUB) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  /*
    L'elenco porta **entrambi** i club, ed e voluto: e la forma esatta
    dell'attacco che ADR-0094 chiude. Se il dominio autorizzasse guardando qui
    invece che il club attivo, i test sul confine lo mostrerebbero.
  */
  allowedOrganizationIds: [CLUB, ALTRO_CLUB],
  actorEmail: "segreteria@club.it",
});

const seed = () => ({
  user: [
    { id: SEGRETERIA, email: "segreteria@club.it", email_verified_at: new Date() },
    { id: ALLENATORE, email: "mister@club.it", email_verified_at: new Date() },
    { id: GENITORE, email: "genitore@famiglia.it", email_verified_at: new Date() },
    { id: ESTRANEO, email: "estraneo@altrove.it", email_verified_at: new Date() },
  ],
  club: [
    { id: CLUB, slug: "club", name: "Polisportiva Test" },
    { id: ALTRO_CLUB, slug: "altro", name: "Altro club" },
  ],
  organizationUser: [
    { id: "m1", organization_id: CLUB, user_id: SEGRETERIA, role: "owner", is_primary: true },
    { id: "m2", organization_id: CLUB, user_id: ALLENATORE, role: "trainer" },
    { id: "m3", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: null,
      first_name: "Luca",
      last_name: "Rossi",
      status: "active",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      data: { email: "luca@famiglia.it", phone: "3330000000" },
    },
    {
      id: COMPAGNO,
      organization_id: CLUB,
      user_id: null,
      first_name: "Sara",
      last_name: "Bianchi",
      status: "active",
      created_at: new Date("2026-01-02T00:00:00.000Z"),
      data: {},
    },
    {
      id: ATLETA_ALTRUI,
      organization_id: ALTRO_CLUB,
      user_id: null,
      first_name: "Marco",
      last_name: "Verdi",
      status: "active",
      created_at: new Date("2026-01-03T00:00:00.000Z"),
      data: {},
    },
  ],
  athleteAccountInvite: [],
  auditLog: [],
  authVerificationChallenge: [],
  session: [],
  emailProviderConfig: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const invitiDi = (athleteId) =>
  fake.rows("athleteAccountInvite").filter((riga) => riga.athlete_id === athleteId);

const azioniAudit = () => fake.rows("auditLog").map((riga) => riga.action);

/* ==================================================================== *
 *  Il permesso, e la riga che il diniego lascia
 * ==================================================================== */

test("un ruolo senza la chiave non consegna nessun accesso, e il rifiuto lascia una riga", async () => {
  for (const ruolo of ["trainer", "parent", "athlete", "ruolo-inventato", null]) {
    await assert.rejects(
      () =>
        dominio.sendAthleteAccountInvite(scope(ruolo, ALLENATORE), {
          athleteId: ATLETA,
          email: "luca@famiglia.it",
        }),
      /Accesso negato/,
      `${ruolo} non deve poter invitare`,
    );
  }

  assert.equal(
    invitiDi(ATLETA).length,
    0,
    "nessun invito puo essere nato da un tentativo rifiutato",
  );

  const dinieghi = fake
    .rows("auditLog")
    .filter((riga) => riga.action === "permission.denied");
  assert.equal(dinieghi.length, 5, "ogni diniego lascia la propria riga");
  assert.equal(dinieghi[0].outcome, "denied");
  assert.equal(dinieghi[0].metadata.permission, "accounts.athlete.manage");
});

test("la segreteria consegna l'accesso, e la direzione anche", async () => {
  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    fake = createFakePrisma(seed());
    setPrismaClientForTests(fake.client);

    const esito = await dominio.sendAthleteAccountInvite(scope(ruolo), {
      athleteId: ATLETA,
      email: "luca@famiglia.it",
    });
    assert.ok(esito.inviteId, `${ruolo} deve poter invitare`);
  }
});

test("un atleta di un altro club non si tocca dal club attivo", async () => {
  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope("owner"), {
        athleteId: ATLETA_ALTRUI,
        email: "marco@famiglia.it",
      }),
    /Accesso negato/,
  );
  assert.equal(invitiDi(ATLETA_ALTRUI).length, 0);
});

/* ==================================================================== *
 *  Il token
 * ==================================================================== */

test("in archivio non finisce mai un token utilizzabile", async () => {
  const esito = await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  const riga = invitiDi(ATLETA)[0];
  assert.match(riga.token_hash, /^[0-9a-f]{64}$/, "in colonna c'e un SHA-256");

  /*
    **La prova che l'archivio non riapre la porta.** Non basta guardare che la
    colonna si chiami `token_hash`: il presidio e che il suo **contenuto** non
    funzioni come token. Chi legge il database non entra.
  */
  await assert.rejects(
    () => dominio.acceptAthleteAccountInvite(riga.token_hash),
    /Invito non valido/,
  );

  /* E il token non esce nemmeno dalla risposta della rotta. */
  assert.equal(
    /[0-9a-f]{64}/.test(JSON.stringify(esito)),
    false,
    "nessun segreto lungo nella risposta all'invito",
  );

  const stato = await dominio.readAthleteAccountState(scope("owner"), ATLETA);
  assert.equal(
    /[0-9a-f]{64}/.test(JSON.stringify(stato)),
    false,
    "nessun segreto lungo nello stato mostrato dalla scheda",
  );

  /* Ne dai metadati di audit, che passano da `sanitizeMetadata`. */
  for (const riga of fake.rows("auditLog")) {
    assert.equal(
      /[0-9a-f]{64}/.test(JSON.stringify(riga.metadata || {})),
      false,
      "nessun segreto lungo nell'audit",
    );
  }
});

/* ==================================================================== *
 *  Un solo invito vivo, e a dirlo e il database
 * ==================================================================== */

test("due inviti vivi per lo stesso atleta sono impossibili, e lo impedisce l'indice", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  fake.reset();

  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope("owner"), {
        athleteId: ATLETA,
        email: "altro@famiglia.it",
      }),
    /invito in corso/,
  );

  /*
    **La difesa e l'indice, non un controllo in memoria.** Il dominio *prova*
    a scrivere — la chiamata `create` c'e — e il database rifiuta. Se qui
    comparisse invece un `findFirst` che decide prima, due segretarie che
    premono insieme produrrebbero due token validi per la stessa persona.
  */
  assert.ok(
    fake.lastCall("athleteAccountInvite", "create"),
    "il dominio deve aver tentato la scrittura",
  );
  assert.equal(invitiDi(ATLETA).length, 1);
});

test("il reinvio revoca il precedente e ne emette uno nuovo", async () => {
  const primo = await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  const secondo = await dominio.resendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
  });

  const righe = invitiDi(ATLETA);
  assert.equal(righe.length, 2, "la storia resta leggibile: il vecchio non sparisce");
  assert.notEqual(primo.inviteId, secondo.inviteId);

  const vecchio = righe.find((riga) => riga.id === primo.inviteId);
  const nuovo = righe.find((riga) => riga.id === secondo.inviteId);
  assert.equal(vecchio.status, "revoked");
  assert.equal(nuovo.status, "sent");
  assert.notEqual(vecchio.token_hash, nuovo.token_hash, "un token nuovo, non il vecchio");
  assert.equal(nuovo.email, "luca@famiglia.it", "il reinvio non cambia indirizzo");
});

test("cambiare indirizzo revoca l'invito e ne manda uno al nuovo", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  await dominio.changeAthleteAccountEmail(scope("owner"), {
    athleteId: ATLETA,
    email: "Luca.Nuovo@Famiglia.IT",
  });

  const vivi = invitiDi(ATLETA).filter((riga) => riga.status === "sent");
  assert.equal(vivi.length, 1);
  assert.equal(vivi[0].email, "luca.nuovo@famiglia.it", "l'indirizzo si normalizza");
});

test("un indirizzo malformato non parte", async () => {
  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope("owner"), {
        athleteId: ATLETA,
        email: "non-un-indirizzo",
      }),
    /Indirizzo email non valido/,
  );
  assert.equal(invitiDi(ATLETA).length, 0);
});

test("lo stesso indirizzo non collega due atleti", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "condiviso@famiglia.it",
  });
  const token = await accettaUltimo(ATLETA);
  assert.ok(token);

  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope("owner"), {
        athleteId: COMPAGNO,
        email: "condiviso@famiglia.it",
      }),
    /gia collegato alla scheda di un altro atleta/,
  );
});

/* ==================================================================== *
 *  Il riscatto
 * ==================================================================== */

/**
 * Il token in chiaro non esce da nessuna funzione — e il punto del dominio —
 * quindi il test lo ricostruisce come farebbe chi ha in mano l'email: prova i
 * token candidati contro l'impronta in archivio. Qui si legge invece la riga e
 * si accetta forzando lo stesso percorso, sostituendo l'impronta con quella di
 * un token noto: e l'unico modo onesto di provare il riscatto senza aggiungere
 * al codice di produzione una porta che restituisca il segreto.
 */
const { createHash, randomBytes } = await import("node:crypto");

const impronta = (token) =>
  createHash("sha256").update(token).digest("hex");

const accettaUltimo = async (athleteId, options = {}) => {
  const riga = invitiDi(athleteId)
    .slice()
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
  if (!riga) throw new Error("nessun invito");

  const token = randomBytes(32).toString("hex");
  riga.token_hash = impronta(token);
  if (options.expiresAt) riga.expires_at = options.expiresAt;
  if (options.status) riga.status = options.status;

  if (options.soloToken) return token;
  return dominio.acceptAthleteAccountInvite(token);
};

test("accettare scrive il legame e la tessera: da li il ruolo atleta esiste", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  const esito = await accettaUltimo(ATLETA);

  const atleta = fake.rows("athlete").find((riga) => riga.id === ATLETA);
  assert.ok(atleta.user_id, "athletes.user_id e la colonna che nessuno scriveva");

  const tessera = fake
    .rows("organizationUser")
    .find(
      (riga) =>
        riga.organization_id === CLUB &&
        riga.user_id === atleta.user_id &&
        riga.role === "athlete",
    );
  assert.ok(tessera, "senza la tessera il ruolo non si risolve in sessione");

  const invito = invitiDi(ATLETA)[0];
  assert.equal(invito.status, "accepted");
  assert.ok(invito.accepted_at);

  assert.equal(esito.athleteName, "Luca Rossi");
  assert.equal(esito.clubName, "Polisportiva Test");
  assert.ok(
    esito.passwordSetupSent === false || esito.passwordSetupSent === true,
    "la scelta della password e un fatto dichiarato, non taciuto",
  );

  assert.ok(azioniAudit().includes("athlete_account.invite.accepted"));
});

test("l'utenza creata dall'invito non ha credenziali che qualcuno conosca", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  const utente = fake
    .rows("user")
    .find((riga) => riga.email === "luca@famiglia.it");

  assert.ok(utente, "l'invito crea l'utenza destinataria");
  assert.ok(utente.password_hash, "la colonna e non-nullable: c'e un hash");
  assert.equal(
    utente.email_verified_at ?? null,
    null,
    "prima del clic nessuno ha dimostrato di leggere quella casella",
  );

  /*
    **La prova che nessuna password e stata comunicata.** L'invito non
    restituisce credenziali, e la password casuale che riempie la colonna non
    compare da nessuna parte: ne nella risposta, ne nell'audit.
  */
  for (const riga of fake.rows("auditLog")) {
    assert.equal(
      JSON.stringify(riga.metadata || {}).includes("password"),
      false,
    );
  }

  await accettaUltimo(ATLETA);
  const dopo = fake.rows("user").find((riga) => riga.id === utente.id);
  assert.ok(
    dopo.email_verified_at,
    "aprire il link dimostra il controllo della casella",
  );

  const sfide = fake
    .rows("authVerificationChallenge")
    .filter((riga) => riga.purpose === "reset_password");
  assert.equal(
    sfide.length,
    1,
    "la password la sceglie la persona, con il meccanismo che esiste gia (ADR-0015)",
  );
  assert.equal(
    sfide[0].user_id,
    utente.id,
    "e la sceglie per la propria utenza, non per un'altra",
  );
});

test("un invito revocato non si riscatta", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  const token = await accettaUltimo(ATLETA, {
    status: "revoked",
    soloToken: true,
  });

  await assert.rejects(
    () => dominio.acceptAthleteAccountInvite(token),
    /Invito non valido/,
  );

  const atleta = fake.rows("athlete").find((riga) => riga.id === ATLETA);
  assert.equal(atleta.user_id ?? null, null);
});

test("un invito scaduto non si riscatta, e si marca scaduto", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  const token = await accettaUltimo(ATLETA, {
    expiresAt: new Date(Date.now() - 60_000),
    soloToken: true,
  });

  await assert.rejects(
    () => dominio.acceptAthleteAccountInvite(token),
    /Invito non valido/,
  );

  assert.equal(invitiDi(ATLETA)[0].status, "expired");
  const atleta = fake.rows("athlete").find((riga) => riga.id === ATLETA);
  assert.equal(atleta.user_id ?? null, null);
});

test("un token gia usato non si riusa", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });

  const riga = invitiDi(ATLETA)[0];
  const token = randomBytes(32).toString("hex");
  riga.token_hash = impronta(token);

  await dominio.acceptAthleteAccountInvite(token);
  await assert.rejects(
    () => dominio.acceptAthleteAccountInvite(token),
    /Invito non valido/,
  );
});

test("un token inventato non apre niente", async () => {
  for (const finto of ["", "   ", "abc", randomBytes(32).toString("hex")]) {
    await assert.rejects(
      () => dominio.acceptAthleteAccountInvite(finto),
      /Invito non valido/,
    );
  }
});

/* ==================================================================== *
 *  La revoca
 * ==================================================================== */

test("revocare toglie il legame, la tessera, e lascia traccia", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  await accettaUltimo(ATLETA);

  const atleta = fake.rows("athlete").find((riga) => riga.id === ATLETA);
  const utenteAtleta = atleta.user_id;
  assert.ok(utenteAtleta);

  /* Una seconda tessera nello stesso club: non deve sparire. */
  fake.rows("organizationUser").push({
    id: "m-parent-atleta",
    organization_id: CLUB,
    user_id: utenteAtleta,
    role: "parent",
  });

  const esito = await dominio.revokeAthleteAccess(scope("owner"), {
    athleteId: ATLETA,
    reason: "Uscito dalla societa",
  });

  assert.equal(esito.revokedUserId, utenteAtleta);
  assert.equal(
    fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id ?? null,
    null,
  );
  assert.equal(
    fake
      .rows("organizationUser")
      .filter((riga) => riga.user_id === utenteAtleta && riga.role === "athlete")
      .length,
    0,
    "la tessera atleta se ne va",
  );
  assert.equal(
    fake
      .rows("organizationUser")
      .filter((riga) => riga.user_id === utenteAtleta && riga.role === "parent")
      .length,
    1,
    "le altre tessere restano: la stessa persona puo essere anche un genitore",
  );

  const traccia = fake
    .rows("auditLog")
    .find((riga) => riga.action === "athlete_account.access.revoked");
  assert.ok(traccia, "una revoca senza traccia non e una revoca");
  assert.equal(traccia.metadata.revoked_user_id, utenteAtleta);
  assert.equal(traccia.metadata.reason, "Uscito dalla societa");

  /* E l'utenza resta: revocare un accesso non cancella una persona. */
  assert.ok(fake.rows("user").find((riga) => riga.id === utenteAtleta));
});

test("dopo la revoca si puo invitare di nuovo", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  await accettaUltimo(ATLETA);
  await dominio.revokeAthleteAccess(scope("owner"), { athleteId: ATLETA });

  const nuovo = await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  assert.ok(nuovo.inviteId);
});

test("non si invita un atleta che ha gia un accesso attivo", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  await accettaUltimo(ATLETA);

  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope("owner"), {
        athleteId: ATLETA,
        email: "altro@famiglia.it",
      }),
    /gia un accesso EasyGame attivo/,
  );

  await assert.rejects(
    () =>
      dominio.changeAthleteAccountEmail(scope("owner"), {
        athleteId: ATLETA,
        email: "altro@famiglia.it",
      }),
    /revocalo e manda un nuovo invito/,
  );
});

/* ==================================================================== *
 *  Lo stato che la scheda mostra
 * ==================================================================== */

test("lo stato si deriva: nessun account, invitato, attivo", async () => {
  const prima = await dominio.readAthleteAccountState(scope("owner"), ATLETA);
  assert.equal(prima.status, "none");
  assert.equal(prima.account, null);
  assert.equal(prima.invite, null);

  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  const invitato = await dominio.readAthleteAccountState(scope("owner"), ATLETA);
  assert.equal(invitato.status, "invited");
  assert.equal(invitato.invite.email, "luca@famiglia.it");

  await accettaUltimo(ATLETA);
  const attivo = await dominio.readAthleteAccountState(scope("owner"), ATLETA);
  assert.equal(attivo.status, "active");
  assert.equal(attivo.account.email, "luca@famiglia.it");
  assert.equal(attivo.history.length, 1);
  assert.equal(attivo.history[0].status, "accepted");
});

test("dallo stato non escono ne l'hash della password ne i metadati dell'utenza", async () => {
  await dominio.sendAthleteAccountInvite(scope("owner"), {
    athleteId: ATLETA,
    email: "luca@famiglia.it",
  });
  await accettaUltimo(ATLETA);

  const stato = await dominio.readAthleteAccountState(scope("owner"), ATLETA);
  assert.deepEqual(Object.keys(stato.account).sort(), [
    "email",
    "emailVerifiedAt",
    "name",
    "userId",
  ]);

  const testo = JSON.stringify(stato);
  for (const proibito of ["password_hash", "user_metadata", "token_hash"]) {
    assert.equal(testo.includes(proibito), false, `${proibito} non deve uscire`);
  }
});

test("un allenatore non legge nemmeno lo stato dell'accesso", async () => {
  await assert.rejects(
    () => dominio.readAthleteAccountState(scope("trainer", ALLENATORE), ATLETA),
    /Accesso negato/,
  );
});

/* ==================================================================== *
 *  L'area dell'atleta
 * ==================================================================== */

test("un utente senza scheda collegata non ha nessuna area atleta", async () => {
  for (const utente of [ESTRANEO, GENITORE, ALLENATORE, ""]) {
    await assert.rejects(
      () => dominio.readAthleteAreaOverview(utente),
      /Accesso negato/,
      `${utente || "(vuoto)"} non deve entrare nell'area atleta`,
    );
    await assert.rejects(
      () => dominio.updateOwnAthleteContacts(utente, { phone: "3331111111" }),
      /Accesso negato/,
    );
  }
});

test("il legame e `athletes.user_id`, non l'indirizzo email", async () => {
  /*
    L'estraneo ha lo **stesso indirizzo** che la scheda porta in anagrafica.
    Se il legame passasse dall'email, entrerebbe: e la strada che l'area
    famiglia ha gia chiuso pretendendo la verifica dell'indirizzo, e qui non
    esiste affatto perche la domanda e un'altra.
  */
  fake.rows("user").find((riga) => riga.id === ESTRANEO).email =
    "luca@famiglia.it";

  const profilo = await dominio.findAthleteProfileForUser(ESTRANEO);
  assert.equal(profilo, null);
});

test("i propri recapiti si correggono, l'anagrafica della societa no", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id =
    UTENTE_ATLETA;

  const esito = await dominio.updateOwnAthleteContacts(UTENTE_ATLETA, {
    phone: "3339999999",
    city: "Modena",
    /* Cio che segue non e suo: non deve entrare in archivio. */
    fiscalCode: "RSSLCU10A01F257X",
    first_name: "Impostore",
    status: "inactive",
    jerseyNumber: "99",
  });

  assert.deepEqual(esito.updated.sort(), ["city", "phone"]);

  const atleta = fake.rows("athlete").find((riga) => riga.id === ATLETA);
  assert.equal(atleta.data.phone, "3339999999");
  assert.equal(atleta.data.city, "Modena");
  assert.equal(atleta.data.fiscalCode, undefined, "il codice fiscale non e suo");
  assert.equal(atleta.data.jerseyNumber, undefined, "il numero di maglia nemmeno");
  assert.equal(atleta.first_name, "Luca", "il nome resta della societa");
  assert.equal(atleta.status, "active", "e lo stato pure");

  const traccia = fake
    .rows("auditLog")
    .find((riga) => riga.action === "anagrafica.updated");
  assert.ok(traccia, "chi ha cambiato i dati di chi resta scritto");
  assert.deepEqual(traccia.metadata.fields.sort(), ["city", "phone"]);
});

test("un indirizzo di contatto malformato non entra in anagrafica", async () => {
  fake.rows("athlete").find((riga) => riga.id === ATLETA).user_id =
    UTENTE_ATLETA;

  await assert.rejects(
    () =>
      dominio.updateOwnAthleteContacts(UTENTE_ATLETA, { email: "non-valido" }),
    /Indirizzo email non valido/,
  );
  assert.equal(
    fake.rows("athlete").find((riga) => riga.id === ATLETA).data.email,
    "luca@famiglia.it",
    "l'anagrafica resta com'era",
  );
});

/* ==================================================================== *
 *  L'elenco chiuso, provato a runtime
 * ==================================================================== */

/**
 * Il seme dell'area: `getParentDashboardData` legge la scheda con un
 * `include`, che questo doppio non implementa — e infatti le relazioni si
 * seminano **sulla riga**, che e quanto Prisma restituirebbe. Non e una
 * scorciatoia: e la stessa forma del dato, e senza, la prova piu importante
 * di questa lane non sarebbe scrivibile affatto.
 */
const CLUB_ROW = {
  id: CLUB,
  slug: "club",
  name: "Polisportiva Test",
  categories: [],
  trainings: [],
  matches: [],
  settings: {},
  opening_hours: null,
};

const semeArea = () => ({
  user: [
    {
      id: UTENTE_ATLETA,
      email: "luca@famiglia.it",
      first_name: "Luca",
      last_name: "Rossi",
      email_verified_at: new Date(),
    },
  ],
  club: [CLUB_ROW],
  organizationUser: [
    {
      id: "m-atleta",
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      role: "athlete",
    },
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB,
      user_id: UTENTE_ATLETA,
      first_name: "Luca",
      last_name: "Rossi",
      status: "active",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      data: {
        phone: "3330000000",
        /* Contenuto clinico: sta nella riga, e non deve uscire di qui. */
        allergies: ["polline"],
        medicalNotes: "SEGRETO-CLINICO",
        bloodType: "A+",
        guardians: [{ name: "Anna Rossi", email: "anna@famiglia.it" }],
      },
      organization: CLUB_ROW,
      category_memberships: [],
    },
    {
      id: COMPAGNO,
      organization_id: CLUB,
      user_id: null,
      first_name: "Sara",
      last_name: "COMPAGNA-DI-SQUADRA",
      status: "active",
      created_at: new Date("2026-01-02T00:00:00.000Z"),
      data: {},
      organization: CLUB_ROW,
      category_memberships: [],
    },
  ],
  athletePayment: [
    {
      id: "rata-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      amount: 300,
      status: "pending",
      description: "QUOTA-ANNUALE",
    },
  ],
  receipt: [],
  invoice: [],
  medicalCertificate: [],
  clubEventParticipant: [],
  notification: [],
  /*
    W6-58. L'appuntamento non e piu una lista vuota: su una lista vuota questa
    prova non poteva vedere ne cio che esce di troppo — le note della
    segreteria — ne cio che non usciva affatto, cioe la data e lo stato, che
    l'elenco chiedeva con nomi che la sorgente non ha.
  */
  appointment: [
    {
      id: "appuntamento-1",
      organization_id: CLUB,
      athlete_id: ATLETA,
      starts_at: new Date("2026-09-10T15:00:00.000Z"),
      ends_at: new Date("2026-09-10T15:30:00.000Z"),
      status: "cancelled_by_family",
      reason: "Colloquio con la segreteria",
      notes: "Portare il modulo",
      internal_notes: "NOTA-DI-SEGRETERIA",
      decision_note: "La famiglia ha disdetto",
      version: 1,
    },
  ],
  appointmentSlot: [],
});

test("l'area atleta e un elenco chiuso: niente denaro, niente tutori, niente altri atleti", async () => {
  fake = createFakePrisma(semeArea());
  setPrismaClientForTests(fake.client);

  const area = await dominio.readAthleteAreaOverview(UTENTE_ATLETA);

  assert.deepEqual(
    Object.keys(area).sort(),
    [
      "appointments",
      "attendance",
      "categories",
      "club",
      "documents",
      "health",
      "matches",
      "me",
      "notifications",
      "notificationsUnread",
      "rsvp",
      "season",
      "trainings",
    ],
    "l'elenco delle sezioni e dichiarato, e cresce solo di proposito",
  );

  const testo = JSON.stringify(area);

  /* Il denaro non e in elenco: la famiglia lo vede nella propria area. */
  for (const chiave of ["payments", "receipts", "invoices", "enrollment"]) {
    assert.equal(area[chiave], undefined, `${chiave} non appartiene a quest'area`);
  }
  assert.equal(testo.includes("QUOTA-ANNUALE"), false);

  /* Ne i tutori, ne gli altri atleti della squadra. */
  assert.equal(testo.includes("COMPAGNA-DI-SQUADRA"), false);
  assert.equal(testo.includes(COMPAGNO), false);
  assert.equal(testo.includes("anna@famiglia.it"), false);
  assert.equal(testo.includes("guardians"), false);

  /* Ne il contenuto clinico, che pure sta nella riga appena letta. */
  assert.equal(testo.includes("SEGRETO-CLINICO"), false);
  assert.equal(testo.includes("polline"), false);
  assert.equal(testo.includes("A+"), false);
  assert.deepEqual(Object.keys(area.health).sort(), [
    "expiryDate",
    "status",
    "statusLabel",
  ]);

  /* E `athletes.data` intero non esce: escono i campi dichiarati. */
  assert.equal(area.me.data, undefined);
  assert.equal(area.me.id, ATLETA);
  assert.equal(area.me.phone, "3330000000");

  /*
    W6-58. **I campi dichiarati arrivano davvero.** L'elenco chiedeva
    `startsAt` e `decisionNote` a un oggetto che li chiama `starts_at` e
    `decision_note`: usciva `undefined`, e la schermata scriveva «Data da
    definire» sotto ogni appuntamento. La classe di questo difetto la presidia
    `tests/server/area-atleta-campi-sorgente.test.mjs`, che confronta ogni
    elenco con l'oggetto che la sorgente vera produce.
  */
  const appuntamento = area.appointments[0];
  assert.ok(appuntamento, "l'appuntamento dell'atleta compare nella sua area");
  assert.equal(appuntamento.startsAt, "2026-09-10T15:00:00.000Z");
  assert.equal(appuntamento.statusLabel, "Annullato dalla famiglia");
  assert.equal(appuntamento.decisionNote, "La famiglia ha disdetto");

  /* E le note che restano in segreteria non sono fra i campi dichiarati. */
  assert.equal(testo.includes("NOTA-DI-SEGRETERIA"), false);
});

/* ==================================================================== *
 *  L'elenco chiuso, letto dal sorgente
 * ==================================================================== */

const RADICE = path.join(process.cwd(), "src");

test("la proiezione dell'area atleta e un elenco chiuso, e il denaro non e in elenco", () => {
  const sorgente = readFileSync(
    path.join(RADICE, "lib", "server", "athlete-accounts.ts"),
    "utf8",
  );

  /*
    La lettura parte dagli **elenchi** e non dalla funzione: da W6-58 i campi
    ammessi sono dichiarati in `CAMPI_AREA_ATLETA`, sopra la proiezione, e
    leggere solo la funzione lascerebbe fuori dal controllo proprio il punto in
    cui si decide cosa esce.
  */
  const proiezione = sorgente.slice(
    sorgente.indexOf("export const CAMPI_AREA_ATLETA"),
    sorgente.indexOf("export type AthleteAreaOverview"),
  );
  assert.ok(proiezione.length > 500, "la proiezione deve esistere");

  /*
    **Non «tolgo cio che non deve uscire», ma «dichiaro cio che esce».** La
    differenza si vede qui: nella proiezione non compare nessuno spread di
    `dati`, quindi un campo nuovo su `getParentDashboardData` nasce invisibile
    a quest'area invece di comparirci il giorno dopo.
  */
  assert.equal(
    /\.\.\.\s*dati\b/.test(proiezione),
    false,
    "uno spread dell'oggetto sorgente vanificherebbe l'elenco chiuso",
  );
  assert.equal(/\.\.\.\s*atleta\b/.test(proiezione), false);
  assert.equal(/\.\.\.\s*salute\b/.test(proiezione), false);
  assert.equal(/\.\.\.\s*club\b/.test(proiezione), false);

  for (const proibito of [
    "payments",
    "receipts",
    "invoices",
    "enrollment",
    "guardians",
    "linkedAthletes",
    "allergies",
    "certificates",
  ]) {
    assert.equal(
      proiezione.includes(proibito),
      false,
      `${proibito} non appartiene all'area di chi gioca`,
    );
  }
});

test("del certificato l'atleta vede lo stato, non il contenuto", () => {
  const sorgente = readFileSync(
    path.join(RADICE, "lib", "server", "athlete-accounts.ts"),
    "utf8",
  );
  const salute = sorgente.slice(
    sorgente.indexOf("health: {"),
    sorgente.indexOf("trainings: {"),
  );

  assert.ok(salute.includes("status"));
  assert.ok(salute.includes("expiryDate"));
  for (const clinico of ["allergies", "notes", "certificates", "file_url"]) {
    assert.equal(salute.includes(clinico), false, `${clinico} e contenuto clinico`);
  }
});

/* ==================================================================== *
 *  W6-33 e W6-34: le due porte della lane
 * ==================================================================== */

test("W6-33 · l'area atleta non monta la sidebar gestionale, e la guardia c'e", () => {
  const layout = readFileSync(
    path.join(RADICE, "app", "athlete-dashboard", "layout.tsx"),
    "utf8",
  );
  assert.ok(layout.includes("AccessAreaGuard"), "l'area e guardata");
  assert.ok(layout.includes("AthleteAreaShell"));

  /*
    Si cerca l'**import**, non la stringa: i commenti di questi file nominano
    la sidebar gestionale per spiegare perche non c'e, e un test che contasse
    le occorrenze punirebbe la spiegazione invece del difetto.
  */
  const montaLaSidebarDelClub = (sorgente) =>
    /from\s+"@\/components\/dashboard\/Sidebar"/.test(sorgente);

  const guscio = readFileSync(
    path.join(RADICE, "components", "athlete", "athlete-area-shell.tsx"),
    "utf8",
  );
  assert.equal(
    montaLaSidebarDelClub(guscio),
    false,
    "la sidebar del club elenca trenta voci che per un atleta rimbalzano",
  );

  /* Nessuna pagina dell'area monta per conto proprio la sidebar gestionale. */
  const pagine = [];
  const visita = (cartella) => {
    for (const voce of readdirSync(cartella)) {
      const completo = path.join(cartella, voce);
      if (statSync(completo).isDirectory()) visita(completo);
      else if (voce.endsWith(".tsx")) pagine.push(completo);
    }
  };
  visita(path.join(RADICE, "app", "athlete-dashboard"));
  assert.ok(pagine.length >= 10, "l'area ha le sue pagine");

  for (const pagina of pagine) {
    assert.equal(
      montaLaSidebarDelClub(readFileSync(pagina, "utf8")),
      false,
      `${path.basename(path.dirname(pagina))} monta la sidebar gestionale`,
    );
  }

  /*
    **La pagina profilo non impersona piu l'area atleta.** Montava
    `components/dashboard/Sidebar`: ora rinvia, e non disegna piu niente.
  */
  const profilo = readFileSync(
    path.join(RADICE, "app", "athletes", "[id]", "profile", "page.tsx"),
    "utf8",
  );
  assert.equal(montaLaSidebarDelClub(profilo), false);
  assert.ok(profilo.includes("/athlete-dashboard"));
});

test("W6-34 · la porta del profilo atleta passa dalla proiezione clinica", () => {
  const rotta = readFileSync(
    path.join(
      RADICE,
      "app",
      "api",
      "v1",
      "auth",
      "athlete-profile",
      "[athleteId]",
      "route.ts",
    ),
    "utf8",
  );

  assert.ok(
    rotta.includes("stripClinicalCertificateFields"),
    "era l'unica lettura di certificati che non proiettava",
  );
  assert.ok(rotta.includes("stripClinicalAthleteFields"));
  assert.ok(
    rotta.includes('"clinical.read"'),
    "il taglio lo decide la chiave del dominio sanitario, non il ruolo cablato",
  );
});

test("«Invia credenziali» non e piu un pulsante che mente", () => {
  const intestazione = readFileSync(
    path.join(
      RADICE,
      "components",
      "athletes",
      "profile",
      "athlete-profile-header.tsx",
    ),
    "utf8",
  );
  /*
    Il pulsante si cerca dal **codice** e non dal testo: il commento di quel
    file racconta il difetto per nome, ed e giusto che lo faccia.
  */
  assert.equal(intestazione.includes("onShareCredentials"), false);
  assert.equal(intestazione.includes("Share2"), false);

  const sezione = readFileSync(
    path.join(
      RADICE,
      "components",
      "athletes",
      "profile",
      "athlete-account-section.tsx",
    ),
    "utf8",
  );
  assert.ok(sezione.includes("accounts.athlete.manage"));
  assert.ok(sezione.includes("/api/v1/athlete-accounts/"));
  /* Nessun ramo mostra una password: non ne esiste una da mostrare. */
  assert.equal(/password[A-Za-z]*\s*[:=]/.test(sezione), false);
});

test("ogni rotta dell'accesso atleta chiede la sessione, tranne il riscatto", () => {
  const cartella = path.join(RADICE, "app", "api", "v1", "athlete-accounts");
  const rotte = [];
  const visita = (corrente) => {
    for (const voce of readdirSync(corrente)) {
      const completo = path.join(corrente, voce);
      if (statSync(completo).isDirectory()) visita(completo);
      else if (voce === "route.ts") rotte.push(completo);
    }
  };
  visita(cartella);

  assert.ok(rotte.length >= 5, "le rotte del dominio ci sono tutte");

  for (const rotta of rotte) {
    const sorgente = readFileSync(rotta, "utf8");
    const eIlRiscatto = rotta.includes(`${path.sep}accept${path.sep}`);

    if (eIlRiscatto) {
      assert.equal(
        sorgente.includes("requireAuthenticatedUser"),
        false,
        "il riscatto e pubblico per progetto: chi lo apre non ha ancora una password",
      );
      continue;
    }

    assert.ok(
      sorgente.includes("requireAuthenticatedUser") ||
        sorgente.includes("risolviScope"),
      `${rotta} non chiede una sessione`,
    );
  }
});
