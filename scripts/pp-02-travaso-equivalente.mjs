/**
 * **Chi apriva l'area famiglia prima del travaso, la apre anche dopo. E nessun
 * altro.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-travaso-equivalente.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * WP-B ha travasato i tutori da `athletes.data.guardians[]` a
 * `athlete_guardians`, e ha dichiarato «14 identita → 14 righe, 0 perse». Quel
 * conteggio misura che **nessuna riga e sparita**. Non e la proprieta che
 * conta.
 *
 * La proprieta che conta e un'**equivalenza fra due predicati**: la persona
 * che apriva il fascicolo di un minore leggendo il blob deve aprirlo anche
 * leggendo la tabella, e — nell'altro verso, che e quello che nessuno guarda —
 * la persona che il blob **teneva fuori** deve restare fuori.
 *
 * Un travaso puo conservare tutte le righe e sbagliare comunque in due modi
 * opposti:
 *
 * - **perdere una identita**: la riga arriva, ma la chiave con cui quella
 *   persona era riconosciuta non e stata letta, quindi la riga nuova non nomina
 *   nessuno. Un tutore legittimo perde calendario, rate, ricevute, documenti e
 *   certificato, e non c'e nessuna schermata che lo spieghi;
 * - **inventarne una**: il travaso legge una collezione che il predicato
 *   **non** consultava, e crea una riga che apre una porta che prima era
 *   chiusa. Questo e peggio, perche non se ne accorge nessuno.
 *
 * ## Come si misura
 *
 * Per ogni grafia storica si costruisce una scheda che porta **solo quella**,
 * e si fanno due domande sulla stessa persona:
 *
 * 1. **il blob**: `getParentLinkedAthletes`, cioe la porta vera del prodotto
 *    prima del passaggio;
 * 2. **la tabella**: `findGuardianLinks`, cioe la porta dopo.
 *
 * Il travaso viene eseguito sulle schede della sonda con **lo stesso SQL della
 * migrazione**, letto dal file: se la sonda ne riscrivesse una copia,
 * misurerebbe la copia.
 *
 * Le due risposte devono coincidere. Dove non coincidono, la sonda dice in
 * quale verso: `PERSA` (il blob apriva, la tabella no) o `INVENTATA` (la
 * tabella apre, il blob no).
 *
 * La sonda misura, non corregge. Il club viene cancellato in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const CLUB = randomUUID();
const TUTORE = randomUUID();
const PRESIDENTE = randomUUID();
const EMAIL = `tutore-${TUTORE.slice(0, 8)}@sonda.local`;
const ALTRO_EMAIL = `estraneo-${TUTORE.slice(0, 8)}@sonda.local`;
const SENZA_TESSERA = randomUUID();

const esiti = [];

/**
 * I casi. `atteso` e cio che il **blob** concede oggi, e non e un'opinione:
 * viene comunque misurato, e la colonna serve solo a rendere leggibile
 * l'elenco quando una riga fallisce.
 */
const CASI = [
  ["linkedUserId", { guardians: [{ linkedUserId: TUTORE }] }, true],
  ["linked_user_id", { guardians: [{ linked_user_id: TUTORE }] }, true],
  ["userId", { guardians: [{ userId: TUTORE }] }, true],
  ["user_id", { guardians: [{ user_id: TUTORE }] }, true],
  ["linkedUserIds[]", { guardians: [{ linkedUserIds: [TUTORE] }] }, true],
  ["linked_user_ids[]", { guardians: [{ linked_user_ids: [TUTORE] }] }, true],
  ["email", { guardians: [{ email: EMAIL }] }, true],
  ["linkedUserEmail", { guardians: [{ linkedUserEmail: EMAIL }] }, true],
  ["linked_user_email", { guardians: [{ linked_user_email: EMAIL }] }, true],
  [
    "email + contactOnly",
    { guardians: [{ email: EMAIL, contactOnly: true }] },
    false,
  ],
  [
    "email + revocata",
    {
      guardians: [{ email: EMAIL }],
      revokedGuardianIdentities: [EMAIL],
    },
    false,
  ],
  [
    "email + registro solo-recapito",
    {
      guardians: [{ email: EMAIL }],
      contactOnlyIdentities: [EMAIL],
    },
    false,
  ],
  [
    "due id dichiarati sulla riga",
    { guardians: [{ linkedUserId: randomUUID(), user_id: TUTORE }] },
    true,
  ],
  [
    "linkedUserEmail diverso da email",
    { guardians: [{ linkedUserEmail: EMAIL, email: ALTRO_EMAIL }] },
    true,
  ],
  ["parent1 senza guardians", { parent1: { linkedUserId: TUTORE } }, true],
  ["parent2 senza guardians", { parent2: { linkedUserId: TUTORE } }, true],
  [
    "guardians vuoto piu parent1",
    { guardians: [], parent1: { linkedUserId: TUTORE } },
    true,
  ],
  /*
    **Il restringimento voluto, e va misurato proprio perche e voluto.**

    Oggi un legame **dichiarato** passa anche quando l'identita e nel registro
    delle revoche: il registro chiude solo il ripiego sull'indirizzo. Regge
    perche lo sweep della revoca **azzera** i campi del legame — ed e proprio
    lo sweep che R-2 dimostra fallire sotto concorrenza. Cioe: quando la revoca
    non riesce del tutto, l'accesso resta aperto.

    Con la tabella la revoca e un fatto sulla riga e vale per tutti e due i
    percorsi. La sonda lo segna come `INVENTATA`/`PERSA` a seconda del verso,
    e qui il verso e **PERSA**: e un restringimento, cioe una porta che si
    chiude. Va dichiarato, non scoperto in produzione.
  */
  [
    "id dichiarato piu registro revoche",
    {
      guardians: [{ linkedUserId: TUTORE }],
      revokedGuardianIdentities: [TUTORE],
    },
    true,
    /* Divergenza dichiarata: il blob apre, la tabella no. E il punto di WP-C. */
    { tabella: false, perche: "restringimento voluto: la revoca vale su tutti e due i percorsi" },
  ],
  [
    "parent1 con guardians pieni di altri",
    {
      guardians: [{ email: ALTRO_EMAIL }],
      parent1: { linkedUserId: TUTORE },
    },
    false,
  ],
  ["parents[] senza guardians", { parents: [{ linkedUserId: TUTORE }] }, true],
  ["tutors[] senza guardians", { tutors: [{ linkedUserId: TUTORE }] }, true],
  ["tutori[] senza guardians", { tutori: [{ linkedUserId: TUTORE }] }, true],
  ["estraneo, nessun legame", { guardians: [{ email: ALTRO_EMAIL }] }, false],
  /*
    **Il tutore collegato che non ha una tessera.**

    L'insieme dei candidati si allargava interrogando `athletes` in SQL grezzo,
    e quella interrogazione leggeva **quattro** grafie dell'identificativo
    mentre il vaglio ne legge sei: un tutore collegato con `linkedUserIds` e
    senza tessera non compariva fra i candidati, quindi il vaglio — che avrebbe
    detto di si — non vedeva mai la sua scheda.

    E l'allargamento **voluto** da `getParentLinkedAthletes` («un tutore
    collegato ma senza tessera non trovava nessun figlio»), applicato a tutte e
    sei le grafie invece che a quattro. Dichiarato qui perche e un verso in cui
    una porta si apre, e una porta che si apre si misura.
  */
  [
    "collegato senza tessera",
    { guardians: [{ linkedUserIds: [SENZA_TESSERA] }] },
    false,
    { tabella: true, perche: "l'allargamento dichiarato, esteso alle sei grafie" },
  ],
];

/**
 * **Il travaso e quello della migrazione, non una sua imitazione.**
 *
 * L'`INSERT ... SELECT` si legge dal file della migrazione e si esegue tale e
 * quale: se questa sonda ne riscrivesse una versione propria, misurerebbe la
 * versione propria e direbbe che va tutto bene.
 *
 * Le due `UPDATE` che portano i registri di scheda sulla riga si eseguono
 * dopo, nello stesso ordine.
 */
const istruzioniDelTravaso = () => {
  /*
    **Il travaso in vigore, non il primo.**

    `20260905120000` lo ha scritto; `20260906100000` lo ha rifatto daccapo dopo
    che questa sonda ha misurato quattro identita perse e quattro inventate. Si
    legge quest'ultimo, perche e quello che una migrazione da zero esegue per
    ultimo ed e quindi lo stato in cui ogni ambiente si trova.
  */
  const sorgente = readFileSync(
    "prisma/migrations/20260906100000_pp02_il_travaso_perdeva_e_inventava/migration.sql",
    "utf8",
  );

  /* Si tengono solo le istruzioni del §3 e del §4: la tabella esiste gia. */
  const senzaCommenti = sorgente
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("--"))
    .join("\n");

  return (
    senzaCommenti
      .split(";")
      .map((istruzione) => istruzione.trim())
      .filter(
        (istruzione) =>
          istruzione.startsWith("INSERT INTO \"athlete_guardians\"") ||
          istruzione.startsWith("UPDATE \"athlete_guardians\""),
      )
      /*
        **Si restringe al club della sonda, e non si riscrive nient'altro.**

        La migrazione gira una volta su tutto l'archivio; qui deve girare solo
        sulle schede appena create, altrimenti riproverebbe a travasare quelle
        che il travaso vero ha gia portato e cadrebbe sulla chiave unica.

        La restrizione e un `AND` in coda al `WHERE` che gia c'e: la logica del
        travaso — quali collezioni legge, come costruisce la chiave, come fonde
        gli ambigui — resta **testualmente quella del file**, che e la sola
        ragione per cui questa misura vale qualcosa.
      */
      .map((istruzione) =>
        istruzione
          .replace(
            `WHERE jsonb_typeof(a."data") = 'object'`,
            `WHERE a."organization_id" = '${CLUB}'::uuid\n    AND jsonb_typeof(a."data") = 'object'`,
          )
          .replace(
            `WHERE a."id" = g."athlete_id"`,
            `WHERE g."organization_id" = '${CLUB}'::uuid\n  AND a."id" = g."athlete_id"`,
          ),
      )
  );
};

const main = async () => {
  const { getParentLinkedAthletes } = await carica(
    "src/lib/server/parent-dashboard.ts",
  );
  const { findGuardianLinks } = await carica(
    "src/lib/server/athlete-guardians.ts",
  );

  await prisma.user.createMany({
    data: [
      {
        id: PRESIDENTE,
        email: `presidente-${PRESIDENTE.slice(0, 8)}@sonda.local`,
        first_name: "Presidente",
        last_name: "Travaso",
        password_hash: "$2b$10$sonda",
        role: "user",
      },
      {
        id: SENZA_TESSERA,
        email: `senza-tessera-${SENZA_TESSERA.slice(0, 8)}@sonda.local`,
        email_verified_at: new Date(),
        first_name: "Senza",
        last_name: "Tessera",
        password_hash: "$2b$10$sonda",
        role: "user",
      },
      {
        id: TUTORE,
        email: EMAIL,
        /* L'indirizzo vale come legame solo se e **verificato**. */
        email_verified_at: new Date(),
        first_name: "Anna",
        last_name: "Travaso",
        password_hash: "$2b$10$sonda",
        role: "user",
      },
    ],
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      name: "Sonda travaso",
      slug: `sonda-travaso-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
    },
  });

  /*
    La tessera serve: l'indirizzo di contatto vale come legame **solo dove
    quella persona ha gia una tessera**, e senza di essa i casi sull'indirizzo
    risponderebbero «no» per la ragione sbagliata.
  */
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: TUTORE,
      role: "parent",
    },
  });

  const schede = [];
  for (const [nome, data, , divergenza] of CASI) {
    const id = randomUUID();
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name: "Figlio",
        last_name: nome.slice(0, 30),
        data,
      },
    });
    schede.push({ nome, id, divergenza });
  }

  /* --- 1. Cosa concede il blob, oggi, dalla porta vera del prodotto. --- */
  const dalBlob = new Set(
    [
      ...(await getParentLinkedAthletes(TUTORE)),
      ...(await getParentLinkedAthletes(SENZA_TESSERA)),
    ].map((atleta) => atleta.id),
  );

  /* --- 2. Il travaso, con lo stesso SQL della migrazione. --- */
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
    for (const istruzione of istruzioniDelTravaso()) {
      await tx.$executeRawUnsafe(istruzione);
    }
  });

  /* --- 3. Cosa concede la tabella. --- */
  const legami = [
    ...(await findGuardianLinks(prisma, {
      userId: TUTORE,
      verifiedEmail: EMAIL,
      organizationIdsForEmail: [CLUB],
    })),
    /* Senza tessera: nessun club per il ripiego sull'indirizzo, solo l'utenza. */
    ...(await findGuardianLinks(prisma, {
      userId: SENZA_TESSERA,
      verifiedEmail: null,
      organizationIdsForEmail: [],
    })),
  ];
  const dallaTabella = new Set(legami.map((legame) => legame.athlete_id));

  console.log("\n  Equivalenza fra il blob e la tabella\n");
  console.log(
    `  ${"caso".padEnd(36)} ${"blob".padEnd(6)} ${"tabella".padEnd(8)} esito`,
  );

  for (const { nome, id, divergenza } of schede) {
    const blob = dalBlob.has(id);
    const tabella = dallaTabella.has(id);

    /*
      **Una divergenza dichiarata resta misurata, non esentata.**

      Dove il passaggio cambia risposta di proposito, la sonda non chiude un
      occhio: pretende **esattamente** la risposta dichiarata. Se domani quella
      cambiasse — nell'uno o nell'altro verso — la riga diventa rossa. Un caso
      esentato non direbbe niente; questo dice «so che cambia, e cambia cosi».
    */
    const atteso = divergenza ? divergenza.tabella : blob;
    const ok = tabella === atteso;
    const verso = tabella === blob
      ? "uguali"
      : divergenza
        ? `voluta: ${divergenza.perche}`
        : blob
          ? "PERSA"
          : "INVENTATA";

    esiti.push({ nome, ok, verso, blob, tabella, voluta: Boolean(divergenza) });
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${nome.padEnd(30)} ${String(blob).padEnd(6)} ` +
        `${String(tabella).padEnd(8)} ${verso}`,
    );
  }

  const perse = esiti.filter((e) => e.verso === "PERSA").length;
  const inventate = esiti.filter((e) => e.verso === "INVENTATA").length;
  const volute = esiti.filter((e) => e.voluta).length;

  console.log(
    `\n      ${perse} identita perse, ${inventate} inventate su ${esiti.length} grafie.`,
  );
  console.log(
    `      Una perdita chiude fuori un tutore legittimo senza spiegazione;`,
  );
  console.log(
    `      una invenzione apre il fascicolo di un minore a chi non lo apriva.\n`,
  );
};

try {
  await main();
} finally {
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
      await tx.athleteGuardian.deleteMany({ where: { organization_id: CLUB } });
    })
    .catch(() => {});
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.organizationUser.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: [TUTORE, PRESIDENTE, SENZA_TESSERA] } } })
    .catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`Esito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
