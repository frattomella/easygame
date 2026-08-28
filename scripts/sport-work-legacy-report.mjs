/**
 * Cosa fare dei dati che assomigliano al modulo compensi e non lo sono.
 *
 * Tre archivi esistevano prima: `trainer_payments`, `clubs.procure` e le
 * anagrafiche JSON di allenatori e staff. Questo script li legge, li
 * classifica e stampa un rapporto con tre esiti:
 *
 *   MIGRATED              importabile senza scelte: le anagrafiche
 *   NEEDS_CLASSIFICATION  serve una persona: promemoria di pagamento
 *   LEGACY_ONLY           resta dov'e: le procure
 *
 * **Il valore predefinito e la sola lettura.** Senza `--import-people` non
 * scrive niente. Una migrazione di dati che parte per sbaglio e peggio di una
 * migrazione che non parte.
 *
 * **`--import-people` importa soltanto le anagrafiche**, e non tocca la voce
 * di origine: crea una persona nel modulo compensi con il collegamento debole
 * verso `clubs.trainers` o `clubs.staff_members`. Non converte nessun
 * pagamento e nessuna procura, e non lo fara mai: un promemoria che diventa
 * erogazione dichiarerebbe zero contributi su un compenso su cui i contributi
 * possono benissimo essere stati versati, e sarebbe un numero falso con
 * l'aria di un numero storico.
 *
 * **E ripetibile.** Una persona gia importata si riconosce dal collegamento di
 * origine — o dal codice fiscale — e viene saltata.
 *
 *     node scripts/sport-work-legacy-report.mjs                     # rapporto
 *     node scripts/sport-work-legacy-report.mjs --club=<uuid>
 *     node scripts/sport-work-legacy-report.mjs --json
 *     node scripts/sport-work-legacy-report.mjs --import-people     # scrive
 *
 * **Prima di eseguirlo con `--import-people`** vanno verificate due cose, e
 * nessuna delle due la puo verificare questo file: che l'ambiente puntato sia
 * quello che si crede, e che ci sia l'autorizzazione a scriverci (CLAUDE.md,
 * sez. 8). Lo script si rifiuta di scrivere se `EASYGAME_DB_ENV` non e
 * `development`, a meno di `EASYGAME_ALLOW_SHARED_DB_WRITE=1`.
 */

import { PrismaClient } from "@prisma/client";
import {
  buildLegacyMigrationReport,
  listImportCandidates,
} from "../src/lib/sport-work/legacy-migration.ts";

const args = process.argv.slice(2);
const IMPORT_PEOPLE = args.includes("--import-people");
const AS_JSON = args.includes("--json");
const CLUB = (args.find((arg) => arg.startsWith("--club=")) || "").split("=")[1];

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
const OVERRIDE = process.env.EASYGAME_ALLOW_SHARED_DB_WRITE === "1";

if (IMPORT_PEOPLE && DB_ENV !== "development" && !OVERRIDE) {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const asArray = (value) => (Array.isArray(value) ? value : []);

const euro = (value) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value) || 0);

const run = async () => {
  const clubs = await prisma.club.findMany({
    where: CLUB ? { id: CLUB } : {},
    select: {
      id: true,
      name: true,
      trainers: true,
      staff_members: true,
      procure: true,
    },
  });

  const reports = [];

  for (const club of clubs) {
    const trainerPayments = await prisma.trainerPayment.findMany({
      where: { organization_id: club.id },
    });

    const report = buildLegacyMigrationReport({
      organizationId: club.id,
      trainers: asArray(club.trainers),
      staffMembers: asArray(club.staff_members),
      trainerPayments,
      procure: asArray(club.procure),
    });

    const candidates = listImportCandidates(report);
    let imported = 0;
    let skipped = 0;

    if (IMPORT_PEOPLE) {
      for (const candidate of candidates) {
        const existing = await prisma.sportWorkPerson.findFirst({
          where: {
            organization_id: club.id,
            OR: [
              {
                origin_type: candidate.originType,
                origin_id: candidate.originId,
              },
              ...(candidate.fiscalCode
                ? [{ fiscal_code: candidate.fiscalCode }]
                : []),
            ],
          },
        });

        if (existing) {
          skipped += 1;
          continue;
        }

        await prisma.sportWorkPerson.create({
          data: {
            organization_id: club.id,
            origin_type: candidate.originType,
            origin_id: candidate.originId,
            first_name: candidate.firstName,
            last_name: candidate.lastName,
            fiscal_code: candidate.fiscalCode,
            email: candidate.email,
            phone: candidate.phone,
            iban: candidate.iban,
          },
        });
        imported += 1;
      }
    }

    reports.push({
      club: { id: club.id, name: club.name },
      summary: report.summary,
      amountsAtStake: report.amountsAtStake,
      importCandidates: candidates.length,
      imported,
      skipped,
      findings: report.findings,
    });
  }

  if (AS_JSON) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  console.log("LAVORO SPORTIVO — RAPPORTO SUI DATI LEGACY");
  console.log(
    IMPORT_PEOPLE
      ? "Modo: IMPORTAZIONE ANAGRAFICHE (scrive)"
      : "Modo: SOLA LETTURA",
  );
  console.log("");

  for (const entry of reports) {
    console.log(`── ${entry.club.name} (${entry.club.id})`);
    console.log(`   MIGRATED              ${entry.summary.MIGRATED}`);
    console.log(`   NEEDS_CLASSIFICATION  ${entry.summary.NEEDS_CLASSIFICATION}`);
    console.log(`   LEGACY_ONLY           ${entry.summary.LEGACY_ONLY}`);
    console.log(
      `   promemoria pagamenti: ${euro(entry.amountsAtStake.trainerPayments)}`,
    );
    console.log(`   pagamenti procura:    ${euro(entry.amountsAtStake.procure)}`);

    if (IMPORT_PEOPLE) {
      console.log(
        `   persone importate: ${entry.imported}, gia presenti: ${entry.skipped}`,
      );
    } else if (entry.importCandidates > 0) {
      console.log(
        `   ${entry.importCandidates} anagrafiche importabili con --import-people`,
      );
    }

    const daGuardare = entry.findings.filter(
      (finding) => finding.outcome !== "MIGRATED",
    );

    if (daGuardare.length > 0) {
      console.log("   voci che richiedono una decisione:");
      for (const finding of daGuardare.slice(0, 20)) {
        console.log(
          `     [${finding.outcome}] ${finding.source} · ${finding.label}`,
        );
      }
      if (daGuardare.length > 20) {
        console.log(`     … e altre ${daGuardare.length - 20}`);
      }
    }

    console.log("");
  }

  console.log(
    "Nessun promemoria di pagamento e nessuna procura viene convertito, ne ora ne mai:",
  );
  console.log(
    "quelle righe non dichiarano rapporto, regole e contributi, e ricostruirle sarebbe inventarli.",
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
