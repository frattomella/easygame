/**
 * Prova di concorrenza **sul database vero** del cambio di appartenenza
 * (ADR-0194 §30): due amministratori che cambiano insieme la primaria dello
 * stesso atleta non possono produrre due primarie.
 *
 * Crea un atleta di prova nel club indicato con una primaria, lancia N
 * comandi simultanei che alternano due destinazioni diverse (U-A e U-B in
 * questo club: le prime due squadre configurate) e verifica che:
 *   - a ogni istante e alla fine c'e **una** primaria (l'indice parziale non
 *     ha mai rifiutato: nessun comando fallisce per `P2002`);
 *   - l'insieme finale coincide con l'esito di **uno** dei comandi (l'ultimo
 *     a ottenere il blocco), non con un miscuglio;
 *   - la proiezione dell'anagrafica dice la stessa cosa delle righe;
 *   - c'e una riga di audit per ogni comando che ha scritto.
 * Poi cancella cio che ha creato (scheda, appartenenze, audit).
 *
 * Gira solo contro il ramo `web-redesign-staging` (endpoint
 * ep-dry-block-alkxdiiu): su qualunque altro database si ferma prima.
 *
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *        scripts/prova-appartenenze-concorrenti.mjs <clubId> [concorrenti]
 */
import assert from "node:assert/strict";

const ENDPOINT_CONSENTITO = "ep-dry-block-alkxdiiu";
const url = process.env.DATABASE_URL || "";
if (!url.includes(ENDPOINT_CONSENTITO)) {
  console.error(`STOP: DATABASE_URL non punta a ${ENDPOINT_CONSENTITO} (web-redesign-staging).`);
  process.exit(2);
}

const clubId = process.argv[2];
const concorrenti = Number(process.argv[3] || 6);
if (!clubId) {
  console.error("Uso: prova-appartenenze-concorrenti.mjs <clubId> [concorrenti]");
  process.exit(2);
}

const { prisma } = await import("../src/lib/server/prisma.ts");
const dominio = await import("../src/lib/server/athlete-category-memberships.ts");

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

const index = await dominio.loadMembershipTargetIndex(clubId);
const [squadraA, squadraB, squadraC] = index.targets;
assert.ok(squadraA && squadraB, "il club ha almeno due squadre configurate");
console.log("squadre:", squadraA.label, "|", squadraB.label, squadraC ? `| ${squadraC.label}` : "");

const marca = `CONC-${Date.now()}`;
const scheda = await prisma.athlete.create({
  data: {
    organization_id: clubId,
    first_name: "Prova",
    last_name: marca,
    birth_date: new Date("2014-03-03T00:00:00.000Z"),
    status: "active",
    category_id: squadraA.categoryId,
    category_name: squadraA.categoryName,
    data: { category: squadraA.categoryId, categoryName: squadraA.categoryName },
  },
});
await prisma.athleteCategoryMembership.create({
  data: {
    organization_id: clubId,
    athlete_id: scheda.id,
    category_id: squadraA.categoryId,
    category_name: squadraA.categoryName,
    is_primary: true,
    site_id: squadraA.siteId || null,
  },
});
if (squadraC) {
  await prisma.athleteCategoryMembership.create({
    data: {
      organization_id: clubId,
      athlete_id: scheda.id,
      category_id: squadraC.categoryId,
      category_name: squadraC.categoryName,
      is_primary: false,
      site_id: squadraC.siteId || null,
    },
  });
}
console.log("atleta creato", scheda.id);

try {
  const comandi = Array.from({ length: concorrenti }, (_, i) => {
    const target = i % 2 === 0 ? squadraB : squadraA;
    return dominio
      .applyMembershipChange(scope, {
        athleteIds: [scheda.id],
        command: { kind: "assign", targetId: target.id, role: "primary", previousPrimaryPolicy: "remove", otherSecondariesPolicy: "keep" },
      })
      .then((r) => ({ ok: true, target: target.id, status: r.athletes[0].status, after: r.athletes[0].after }))
      .catch((error) => ({ ok: false, target: target.id, error: String(error?.message || error) }));
  });
  const esiti = await Promise.all(comandi);
  for (const esito of esiti) console.log(esito.ok ? `ok   ${esito.target} → ${esito.status}` : `FAIL ${esito.target}: ${esito.error}`);

  const falliti = esiti.filter((e) => !e.ok);
  assert.equal(falliti.length, 0, "nessun comando e caduto: il blocco li ha messi in fila, l'indice non ha rifiutato niente");

  const righe = await prisma.athleteCategoryMembership.findMany({ where: { athlete_id: scheda.id }, orderBy: { created_at: "asc" } });
  const primarie = righe.filter((r) => r.is_primary);
  assert.equal(primarie.length, 1, "una primaria sola");
  assert.ok([squadraA.categoryId, squadraB.categoryId].includes(primarie[0].category_id), "la primaria e una delle due destinazioni");
  const nonPrimarieAB = righe.filter((r) => !r.is_primary && [squadraA.categoryId, squadraB.categoryId].includes(r.category_id));
  assert.equal(nonPrimarieAB.length, 0, "la destinazione perdente e stata rimossa, non declassata: nessun miscuglio");
  if (squadraC) {
    assert.ok(righe.some((r) => r.category_id === squadraC.categoryId && !r.is_primary), "la secondaria estranea e rimasta");
  }

  const riletta = await prisma.athlete.findUnique({ where: { id: scheda.id } });
  assert.equal(riletta.category_id, primarie[0].category_id, "la colonna dice la primaria");
  assert.equal(riletta.data.category, primarie[0].category_id, "la proiezione dice la primaria");
  assert.equal(riletta.data.categoryMemberships.length, righe.length, "la proiezione ha tante righe quante l'archivio");
  assert.ok(riletta.data.categoryMemberships.every((m) => righe.some((r) => r.id === m.id)), "la proiezione cita le righe per id");

  const audit = await prisma.auditLog.findMany({ where: { resource_id: scheda.id, action: "athlete.memberships.changed" } });
  const scritti = esiti.filter((e) => e.ok && e.status === "updated").length;
  assert.equal(audit.length, scritti, "una riga di audit per ogni comando che ha scritto");
  assert.ok(scritti >= 1, "almeno un comando ha scritto");
  console.log(`\nOK: ${concorrenti} comandi concorrenti → ${scritti} scritti, ${concorrenti - scritti} gia a posto, 1 primaria (${primarie[0].category_id}), audit ${audit.length}`);
} finally {
  await prisma.athleteCategoryMembership.deleteMany({ where: { athlete_id: scheda.id } });
  await prisma.auditLog.deleteMany({ where: { resource_id: scheda.id } });
  await prisma.athlete.deleteMany({ where: { id: scheda.id } });
  await prisma.$disconnect();
  console.log("pulizia fatta");
}
