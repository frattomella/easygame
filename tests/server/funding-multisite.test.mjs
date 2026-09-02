import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Contributi e gruppi operativi: **niente contaminazione fra squadre**
 * (ADR-0055).
 *
 * Mario si allena con `Pulcini · Scauri`. L'esistenza di un allenamento di
 * `Pulcini · Santi Cosma` non deve produrgli ne ore ne previsione ne maturato:
 * sono due squadre a trenta chilometri di distanza, e un contributo pubblico
 * si rendiconta sulla frequenza di chi ha frequentato davvero.
 *
 * La riga di presenza sbagliata **puo esistere**: un appello aperto sul
 * gruppo sbagliato la produce, e uno storico puo portarsela dietro. Per questo
 * il filtro sta nel dominio e non solo nell'interfaccia.
 */

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";
const PROGRAMMA = "11111111-0000-4000-8000-00000000000a";
const MARIO = "33333333-0000-4000-8000-00000000000c";

const SITE_SCAURI = "site-scauri";
const SITE_SANTI = "site-santi";
const CATEGORIA = "cat-pulcini";

const GRUPPO_SCAURI = `group:${CATEGORIA}:${SITE_SCAURI}`;
const GRUPPO_SANTI = `group:${CATEGORIA}:${SITE_SANTI}`;

const scope = () => ({
  userId: "user-a",
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let service;
let setPrismaClientForTests;
let fake;

/** Un bando a soglia oraria: nessuna costante vive nel codice. */
const programma = () => ({
  id: PROGRAMMA,
  organization_id: CLUB,
  name: "Contributo frequenza",
  funder_name: "Ente",
  status: "active",
  valid_from: new Date("2026-09-01T00:00:00Z"),
  valid_to: new Date("2026-09-30T00:00:00Z"),
  athlete_plafond: 300,
  accrual_source: "easygame_attendance",
  period_amount: 60,
  period_frequency: "monthly",
  period_length_days: null,
  requirement_unit: "hours",
  requirement_min: 6,
  unmet_behavior: "none",
  max_periods: null,
  max_total_amount: null,
  notes: null,
  data: {},
  created_at: new Date("2026-08-01T00:00:00Z"),
  updated_at: new Date("2026-08-01T00:00:00Z"),
});

const allenamento = (id, date, groupIds) => ({
  id: `row-${id}`,
  organization_id: CLUB,
  kind: "training",
  legacy_id: id,
  status: "scheduled",
  starts_at: new Date(`${date}T17:00:00.000Z`),
  ends_at: new Date(`${date}T19:00:00.000Z`),
  group_ids: groupIds,
  payload: {
    id,
    date,
    startTime: "17:00",
    endTime: "19:00",
    groupIds,
  },
});

const presenza = (trainingId) => ({
  id: `att-${trainingId}`,
  organization_id: CLUB,
  event_id: `row-${trainingId}`,
  legacy_training_id: trainingId,
  athlete_id: MARIO,
  status: "present",
});

/**
 * Mario e di Scauri. Due allenamenti a Scauri (4 ore, sotto la soglia di 6) e
 * due a Santi Cosma, con l'appello sbagliato che lo segna presente anche li.
 */
const seed = ({ marioSiteId = SITE_SCAURI, trainingGroups = true } = {}) => ({
  club: [
    {
      id: CLUB,
      club_sites: [
        { id: SITE_SCAURI, name: "Scauri" },
        { id: SITE_SANTI, name: "Santi Cosma" },
      ],
      category_groups: [
        { categoryId: CATEGORIA, siteId: SITE_SCAURI },
        { categoryId: CATEGORIA, siteId: SITE_SANTI },
      ],
    },
  ],
  athleteCategoryMembership: [
    {
      id: "m-1",
      organization_id: CLUB,
      athlete_id: MARIO,
      category_id: CATEGORIA,
      category_name: "Pulcini",
      is_primary: true,
      site_id: marioSiteId,
    },
  ],
  fundingProgram: [programma()],
  /* Il beneficiario deve esistere nel club del bando. */
  athlete: [
    { id: MARIO, organization_id: CLUB, first_name: "Mario", last_name: "Sonda" },
  ],
  fundingEnrollment: [],
  fundingAccrual: [],
  fundingSettlement: [],
  fundingSettlementLine: [],
  clubEvent: [
    allenamento("sc1", "2026-09-02", trainingGroups ? [GRUPPO_SCAURI] : undefined),
    allenamento("sc2", "2026-09-09", trainingGroups ? [GRUPPO_SCAURI] : undefined),
    allenamento("sa1", "2026-09-03", trainingGroups ? [GRUPPO_SANTI] : undefined),
    allenamento("sa2", "2026-09-10", trainingGroups ? [GRUPPO_SANTI] : undefined),
  ],
  clubEventParticipant: [
    presenza("sc1"),
    presenza("sc2"),
    presenza("sa1"),
    presenza("sa2"),
  ],
});

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  service = await import("../../src/lib/server/funding.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const load = (options) => {
  fake = createFakePrisma(seed(options));
  setPrismaClientForTests(fake.client);
};

beforeEach(() => {
  load();
});

const maturaPerMario = async () => {
  const iscrizione = await service.createFundingEnrollment(
    { programId: PROGRAMMA, athleteId: MARIO, assignedAmount: 300 },
    scope(),
  );

  await service.recomputeEnrollmentAccruals(iscrizione.id, scope(), {
    until: "2026-09-30",
  });

  return fake
    .rows("fundingAccrual")
    .filter((row) => row.enrollment_id === iscrizione.id)
    .sort((left, right) => left.period_index - right.period_index)[0];
};

test("gli allenamenti dell'altra sede non contano le ore", async () => {
  const settembre = await maturaPerMario();

  assert.equal(
    settembre.measured_value,
    4,
    "solo i due allenamenti di Scauri: quelli di Santi Cosma non sono suoi",
  );
});

test("una presenza registrata sull'altra squadra non fa maturare", async () => {
  const settembre = await maturaPerMario();

  assert.equal(settembre.requirement_met, false, "4 ore su 6 richieste");
  assert.equal(
    settembre.accrued_amount,
    0,
    "contando anche Santi Cosma sarebbero state 8 ore e 60 EUR di troppo",
  );
});

test("l'atleta di Santi Cosma matura sui suoi allenamenti, non su quelli di Scauri", async () => {
  load({ marioSiteId: SITE_SANTI });
  const settembre = await maturaPerMario();

  assert.equal(settembre.measured_value, 4, "i due di Santi Cosma");
});

test("un allenamento senza gruppo dichiarato continua a contare", async () => {
  /*
    Dato precedente ai gruppi: escluderlo cancellerebbe frequenza vera da
    stagioni gia rendicontate.
  */
  load({ trainingGroups: false });
  const settembre = await maturaPerMario();

  assert.equal(settembre.measured_value, 8, "tutti e quattro, come prima");
  assert.equal(settembre.accrued_amount, 60);
});

test("un atleta senza sede dichiarata non perde gli allenamenti storici", async () => {
  load({ marioSiteId: "", trainingGroups: false });
  const settembre = await maturaPerMario();

  assert.equal(settembre.measured_value, 8);
});

test("un atleta senza sede non eredita gli allenamenti di una squadra dichiarata", async () => {
  load({ marioSiteId: "" });
  const settembre = await maturaPerMario();

  assert.equal(
    settembre.measured_value,
    0,
    "chi non e in nessuna squadra non ha frequentato nessuna squadra",
  );
});
