/**
 * **Un tutore ha un solo scrittore, e a dirlo e l'archivio.**
 *
 *     EASYGAME_DB_ENV=development node scripts/pp-02-proprietario-tutore.mjs
 *
 * ---
 *
 * ## Che cosa misura
 *
 * Non «i file che oggi scrivono i tutori sono questi». Quella e la forma di
 * prova che PP-02 ha gia sbagliato cinque volte: il censimento e passato da
 * quattro scrittori a sedici, e ogni elenco era completo il giorno in cui e
 * stato scritto. La rotta generica scrive attraverso un delegato **calcolato a
 * runtime**, quindi un elenco derivato da una ricerca testuale non puo essere
 * completo per costruzione.
 *
 * Questa sonda misura una proprieta diversa, che non ha elenchi: **qualunque**
 * scrittura su `athlete_guardians` che non venga dal modulo proprietario viene
 * rifiutata dall'archivio. Non importa da quale file arrivi, con quale
 * strumento, o se il file esistesse quando la sonda e stata scritta.
 *
 * ## Le sei prove, e cosa dimostra ciascuna
 *
 * | # | Prova | Dimostra |
 * |---|---|---|
 * | 1 | `prisma.athleteGuardian.create` diretta | un `INSERT` estraneo non passa |
 * | 2 | `$executeRaw` con `INSERT` | non e Prisma a difendere: e l'archivio |
 * | 3 | la stessa scrittura dal modulo proprietario | il permesso funziona, cioe la difesa **discrimina** |
 * | 4 | `prisma.athleteGuardian.updateMany` diretta | una `UPDATE` estranea non passa |
 * | 5 | una `UPDATE` nella transazione **successiva** | il permesso non sopravvive al `COMMIT` |
 * | 6 | `prisma.athlete.delete` | la cascata del diritto all'oblio resta possibile |
 *
 * La prova 3 e la piu importante e va letta insieme alle altre: una difesa che
 * rifiuta tutto non e una difesa, e un guasto. Senza la 3, le prove 1, 2, 4 e 5
 * passerebbero anche con una tabella in sola lettura.
 *
 * ## Verifica per mutazione
 *
 * Togliendo il vaglio dall'archivio:
 *
 *     DROP TRIGGER "athlete_guardians_solo_il_proprietario" ON "athlete_guardians";
 *
 * le prove 1, 2, 4 e 5 diventano rosse e la 3 e la 6 restano verdi. E la
 * dimostrazione che a rifiutare e il vaglio e non qualcos'altro.
 *
 * La sonda misura, non corregge. Il club viene cancellato in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const ATLETA = randomUUID();
const PRESIDENTE = randomUUID();

/**
 * Il rifiuto si riconosce dal codice SQLSTATE, non dal testo del messaggio:
 * un messaggio si traduce, un codice no. `42501` e `insufficient_privilege`,
 * che e cio che il vaglio dichiara.
 */
const rifiutato = async (azione) => {
  try {
    await azione();
    return "passata";
  } catch (error) {
    const testo = String(error?.message || "");
    if (
      testo.includes("fuori dal modulo proprietario") ||
      String(error?.meta?.code || "") === "42501"
    ) {
      return "rifiutata";
    }
    return `errore diverso: ${testo.split("\n")[0].slice(0, 90)}`;
  }
};

const main = async () => {
  const { upsertGuardianRows } = await carica(
    "src/lib/server/athlete-guardians.ts",
  );

  await prisma.user.create({
    data: {
      id: PRESIDENTE,
      email: `proprietario-${PRESIDENTE.slice(0, 8)}@sonda.local`,
      first_name: "Presidente",
      last_name: "Sonda",
      password_hash: "$2b$10$sonda",
      role: "user",
    },
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: "Sonda proprietario",
      slug: `sonda-proprietario-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
    },
  });
  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Figlio",
      last_name: "Sonda",
      data: {},
    },
  });

  console.log("\n  Il vaglio dell'archivio\n");

  prova(
    "1. una create di Prisma da fuori il modulo",
    "rifiutata",
    await rifiutato(() =>
      prisma.athleteGuardian.create({
        data: {
          id: randomUUID(),
          organization_id: CLUB,
          athlete_id: ATLETA,
          identity_key: "intruso@esempio.it",
          email: "intruso@esempio.it",
        },
      }),
    ),
    "senza questo, la rotta generica potrebbe ricreare un tutore revocato",
  );

  prova(
    "2. un INSERT in SQL grezzo da fuori il modulo",
    "rifiutata",
    await rifiutato(
      () => prisma.$executeRaw`
        INSERT INTO "athlete_guardians"
          ("id","organization_id","athlete_id","identity_key","email","updated_at")
        VALUES (gen_random_uuid(), ${CLUB}::uuid, ${ATLETA}::uuid,
                'grezzo@esempio.it', 'grezzo@esempio.it', now())
      `,
    ),
    "a difendere non e Prisma: e l'archivio, e SQL grezzo lo incontra uguale",
  );

  /*
    **La prova che rende leggibili le altre.**

    Le prove 1, 2, 4 e 5 passerebbero tutte anche se la tabella fosse
    semplicemente in sola lettura. Questa dice che la difesa distingue chi ha
    il diritto di scrivere da chi non ce l'ha, che e la sola cosa che voglia
    dire «difesa».
  */
  const scritte = await upsertGuardianRows(prisma, {
    organizationId: CLUB,
    athleteId: ATLETA,
    rows: [{ email: "madre@esempio.it", firstName: "Anna", lastName: "Sonda" }],
  });

  prova(
    "3. la stessa scrittura, dal modulo proprietario",
    1,
    scritte.length,
    "senza questa, la difesa non discrimina: rifiuterebbe tutto",
  );

  prova(
    "4. una updateMany di Prisma da fuori il modulo",
    "rifiutata",
    await rifiutato(() =>
      prisma.athleteGuardian.updateMany({
        where: { athlete_id: ATLETA },
        data: { revoked_at: null },
      }),
    ),
    "e la mossa che riaccenderebbe un accesso revocato",
  );

  /*
    **Il permesso vive nella transazione, non nella connessione.**

    Prisma serve richieste diverse dalla stessa connessione. Se il permesso
    sopravvivesse al `COMMIT`, la prima scrittura legittima del modulo lo
    lascerebbe acceso per tutto cio che quella connessione serve dopo — cioe
    non sarebbe piu un permesso. La prova 3 e appena passata su questa stessa
    connessione: se il permesso fosse rimasto, questa passerebbe.
  */
  prova(
    "5. una UPDATE nella transazione successiva a una legittima",
    "rifiutata",
    await rifiutato(
      () => prisma.$executeRaw`
        UPDATE "athlete_guardians" SET "revoked_at" = NULL
        WHERE "athlete_id" = ${ATLETA}::uuid
      `,
    ),
    "SET LOCAL si spegne al COMMIT: se non fosse cosi, il permesso resterebbe acceso",
  );

  /*
    La cancellazione della scheda e la strada del diritto all'oblio: i tutori
    devono poterla seguire, e il vaglio riconosce quel caso dal fatto che la
    scheda non esiste piu.
  */
  await prisma.athlete.delete({ where: { id: ATLETA } });
  const rimaste = await prisma.athleteGuardian.count({
    where: { athlete_id: ATLETA },
  });

  prova(
    "6. la cascata dalla cancellazione della scheda",
    0,
    rimaste,
    "senza questa, il diritto all'oblio fallirebbe sull'atleta con un tutore",
  );

  console.log(
    `\n      L'invariante non e un elenco di file: e una proprieta dell'archivio.`,
  );
  console.log(
    `      Uno scrittore nuovo, in un file che oggi non esiste, la incontra uguale.\n`,
  );
};

try {
  await main();
} finally {
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: PRESIDENTE } }).catch(() => {});
  await prisma.$disconnect();
}

const ko = esiti.filter((e) => !e.ok).length;
console.log(`Esito: ${esiti.length - ko}/${esiti.length}`);
process.exit(ko ? 1 : 0);
