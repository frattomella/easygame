/**
 * Prova di concorrenza **sul database vero** della conversione di una persona
 * in prova (ADR-0188, D-RD-22).
 *
 * Crea una persona in prova in un club di prova, lancia N «Converti»
 * simultanei sulla stessa riga e verifica che:
 *   - una sola conversione riesce, le altre falliscono con il messaggio
 *     della presa;
 *   - esiste **una** scheda atleta con `data.trialOriginId` = la prova;
 *   - la riga di prova e `enrolled` con quella scheda;
 *   - le appartenenze della scheda sono una e la proiezione la cita per id.
 * Poi cancella cio che ha creato (scheda, appartenenze, prova, audit).
 *
 * Gira solo contro il ramo `web-redesign-staging` (endpoint
 * ep-dry-block-alkxdiiu): su qualunque altro database si ferma prima di
 * scrivere.
 *
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *        scripts/prova-conversione-concorrente.mjs <clubId> [concorrenti]
 */
import assert from "node:assert/strict";

const ENDPOINT_CONSENTITO = "ep-dry-block-alkxdiiu";
const url = process.env.DATABASE_URL || "";
if (!url.includes(ENDPOINT_CONSENTITO)) {
  console.error(`STOP: DATABASE_URL non punta a ${ENDPOINT_CONSENTITO} (web-redesign-staging).`);
  process.exit(2);
}

const clubId = process.argv[2];
const concorrenti = Number(process.argv[3] || 4);
/*
  Con una categoria la conversione scrive anche l'appartenenza dentro la
  stessa transazione: il vaglio del padre deve leggere la scheda appena
  creata **dalla transazione**, e solo il database vero lo misura (il doppio
  esegue la transazione sullo stesso client). Senza, l'UAT di ADR-0194
  fermava ogni conversione con «la riga a cui si collega non esiste».
*/
const categoryId = process.argv[4] || "";
if (!clubId) {
  console.error("Uso: prova-conversione-concorrente.mjs <clubId> [concorrenti] [categoryId]");
  process.exit(2);
}

const { prisma } = await import("../src/lib/server/prisma.ts");
const dominio = await import("../src/lib/server/trial-athletes.ts");

const proprietario = await prisma.organizationUser.findFirst({
  where: { organization_id: clubId, role: "owner" },
  select: { user_id: true },
});
assert.ok(proprietario, "il club ha un proprietario");
const scope = {
  userId: proprietario.user_id,
  activeOrganizationId: clubId,
  activeRole: "owner",
  allowedOrganizationIds: [clubId],
  accessScopes: [],
};

const marca = `CONC-${Date.now()}`;
const trial = await dominio.createTrialAthlete(scope, {
  firstName: "Prova",
  lastName: marca,
  birthDate: "2015-05-05",
  ...(categoryId ? { categoryId } : {}),
});
console.log("prova creata", trial.id);

try {
  const esiti = await Promise.allSettled(
    Array.from({ length: concorrenti }, () =>
      dominio.convertTrialAthlete(scope, trial.id, { create: {} }, { userId: scope.userId }),
    ),
  );
  const riusciti = esiti.filter((e) => e.status === "fulfilled");
  const falliti = esiti.filter((e) => e.status === "rejected");
  console.log(`riusciti ${riusciti.length} · falliti ${falliti.length}`);
  for (const f of falliti) console.log("  -", f.reason?.message);

  const schede = await prisma.athlete.findMany({
    where: { organization_id: clubId, last_name: marca },
    select: { id: true, data: true },
  });
  const riga = await prisma.trialAthlete.findUnique({ where: { id: trial.id } });
  const appartenenze = schede.length
    ? await prisma.athleteCategoryMembership.findMany({ where: { athlete_id: schede[0].id } })
    : [];

  assert.equal(riusciti.length, 1, "una sola conversione riesce");
  assert.equal(falliti.length, concorrenti - 1, "le altre falliscono");
  assert.ok(
    falliti.every((f) => /gia in corso o completata|gia iscritta/.test(String(f.reason?.message))),
    "e falliscono per la presa o perche la trovano gia iscritta, non per altro",
  );
  assert.equal(schede.length, 1, "una scheda sola");
  assert.equal(schede[0].data?.trialOriginId, trial.id, "la scheda dice da dove viene");
  assert.equal(riga.status, "enrolled");
  assert.equal(riga.athlete_id, schede[0].id, "la prova e collegata alla scheda");
  const proiezione = Array.isArray(schede[0].data?.categoryMemberships) ? schede[0].data.categoryMemberships : [];
  assert.deepEqual(
    proiezione.map((m) => m.id).sort(),
    appartenenze.map((m) => m.id).sort(),
    "la proiezione cita le righe vere",
  );
  if (categoryId) {
    assert.equal(appartenenze.length, 1, "una appartenenza: la scheda si e letta dalla transazione");
    assert.equal(appartenenze[0].category_id, categoryId);
    assert.equal(appartenenze[0].is_primary, true, "ed e la primaria");
    console.log("appartenenza", appartenenze[0].category_id, "sede", appartenenze[0].site_id || "(nessuna)");
  } else {
    assert.ok(appartenenze.length <= 1, "al piu una appartenenza (la prova non aveva categoria)");
  }

  /* Ripetere la conversione dopo il successo non crea niente. */
  await assert.rejects(
    dominio.convertTrialAthlete(scope, trial.id, { create: {} }, { userId: scope.userId }),
    /gia iscritta/,
  );
  const dopo = await prisma.athlete.count({ where: { organization_id: clubId, last_name: marca } });
  assert.equal(dopo, 1, "idempotente");
  console.log("OK: conversione concorrente sicura sul database vero");
} finally {
  /* Pulizia di cio che la prova ha creato. */
  const schede = await prisma.athlete.findMany({ where: { organization_id: clubId, last_name: marca }, select: { id: true } });
  await prisma.athleteCategoryMembership.deleteMany({ where: { athlete_id: { in: schede.map((s) => s.id) } } });
  await prisma.trialAttendance.deleteMany({ where: { trial_athlete_id: trial.id } });
  await prisma.trialAthlete.deleteMany({ where: { id: trial.id } });
  await prisma.athlete.deleteMany({ where: { id: { in: schede.map((s) => s.id) } } });
  await prisma.auditLog.deleteMany({ where: { resource: "trial_athletes", resource_id: trial.id } });
  await prisma.auditLog.deleteMany({ where: { resource_id: { in: schede.map((s) => s.id) } } });
  console.log(`pulizia: ${schede.length} schede, 1 prova`);
  await prisma.$disconnect();
}
