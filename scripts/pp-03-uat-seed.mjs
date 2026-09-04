/**
 * **Il club di collaudo per la UAT a schermo dell'allenatore.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-03-uat-seed.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le sonde di PP-03 attaccano le rotte e non aprono nessuna schermata. La
 * verifica di responsivita chiesta dal mandato — **375 / 768 / 1280 / 1440 px**
 * — si fa invece con un browser e una sessione vera, e per averla serve un club
 * con dentro qualcosa: se le pagine sono vuote non si misura niente, perche una
 * tabella senza righe non trabocca mai.
 *
 * Semina quindi un club **pieno abbastanza da fare male**: nomi lunghi,
 * categorie con etichette che non stanno su una riga, atleti a sufficienza da
 * far scorrere l'elenco, allenamenti passati **con l'appello gia fatto** e
 * futuri, una gara con le convocazioni, avvisi in bacheca, un appuntamento e
 * qualche notifica.
 *
 * ## Le due utenze
 *
 * | Ruolo | Email | Password |
 * |---|---|---|
 * | Proprietario | `pp03-uat-presidente@example.invalid` | `CollaudoPP03!` |
 * | Allenatore (solo Under 15) | `pp03-uat-mister@example.invalid` | `CollaudoPP03!` |
 *
 * L'allenatore ha **una sola** categoria nella scheda dentro `clubs.trainers`:
 * e il perimetro, e serve a vedere a schermo che l'elenco atleti e il
 * calendario si fermano dove devono.
 *
 * Rieseguirlo **rifa da capo** il proprio club (slug `pp03-uat`) e lascia stare
 * tutto il resto del database.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();

const SLUG = "pp03-uat";
const PASSWORD = "CollaudoPP03!";

const CAT_U15 = "cat-pp03uat-u15";
const CAT_U17 = "cat-pp03uat-u17";
const CAT_PRIMA = "cat-pp03uat-prima";
const SEDE_NORD = "sede-pp03uat-nord";
const SEDE_SUD = "sede-pp03uat-sud";
const STRUTTURA = "struttura-pp03uat-1";

const giorno = (delta) => {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + delta);
  return data;
};

const iso = (data) => data.toISOString().slice(0, 10);

const utente = async (email, first_name, last_name) => {
  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const esistente = await prisma.user.findUnique({ where: { email } });
  if (esistente) {
    return prisma.user.update({
      where: { id: esistente.id },
      data: { password_hash, first_name, last_name, email_verified_at: new Date() },
    });
  }
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name,
      last_name,
      password_hash,
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/**
 * Venti atleti, dieci per categoria, con **nomi lunghi**: un elenco di «Rossi
 * Marco» non trova mai il punto in cui la colonna trabocca.
 */
const NOMI = [
  ["Alessandro", "Della Valle Buonocore"],
  ["Benedetta", "Sciarrillo Mastrogiovanni"],
  ["Cristiano", "Rapisarda Lo Giudice"],
  ["Daniela", "Fontanarosa Di Bartolomeo"],
  ["Emanuele", "Castagnaviz Pellegrini"],
  ["Federica", "Montecchiari Salvadori"],
  ["Gianmarco", "Squarcialupi Bonaventura"],
  ["Helena", "Vanderbeken Scognamiglio"],
  ["Iacopo", "Malaspina Della Rovere"],
  ["Ludovica", "Fiorentino Barracchia"],
];

const eventi_dominio = await import(
  pathToFileURL(path.resolve("src/lib/server/events.ts")).href,
);

const main = async () => {
  const presidente = await utente(
    "pp03-uat-presidente@example.invalid",
    "Annamaria",
    "Presidente",
  );
  const mister = await utente(
    "pp03-uat-mister@example.invalid",
    "Gianfranco",
    "Allenatore",
  );

  const vecchio = await prisma.club.findUnique({ where: { slug: SLUG } });
  if (vecchio) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: vecchio.id } })
      .catch(() => {});
    await prisma.club.delete({ where: { id: vecchio.id } });
  }

  const CLUB = randomUUID();

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: SLUG,
      name: "A.S.D. Polisportiva Collaudo Responsivita",
      creator_id: presidente.id,
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
      categories: [
        { id: CAT_U15, name: "Under 15 maschile — girone provinciale B" },
        { id: CAT_U17, name: "Under 17 femminile — girone regionale" },
        { id: CAT_PRIMA, name: "Prima squadra — serie C silver" },
      ],
      club_sites: [
        { id: SEDE_NORD, name: "Palestra comunale di via dei Tigli", active: true },
        { id: SEDE_SUD, name: "Centro sportivo Sud", active: true },
      ],
      structures: [
        {
          id: STRUTTURA,
          name: "Palestra comunale di via dei Tigli — campo 1",
          siteId: SEDE_NORD,
          fields: [{ id: "campo-1", name: "Campo 1" }],
        },
      ],
      category_groups: [],
      trainers: [
        {
          id: "trainer-pp03uat-1",
          first_name: "Gianfranco",
          last_name: "Allenatore",
          email: mister.email,
          linkedUserId: mister.id,
          /* Il perimetro: **una sola** categoria. */
          categories: [CAT_U15],
          groups: [],
          role: "Allenatore",
        },
      ],
      staff_members: [],
      matches: [],
      trainings: [],
    },
  });

  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: presidente.id,
        role: "owner",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: mister.id,
        role: "trainer",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  const atleti = [];
  for (let indice = 0; indice < 20; indice += 1) {
    const [nome, cognome] = NOMI[indice % NOMI.length];
    const categoria = indice % 2 === 0 ? CAT_U15 : CAT_U17;
    atleti.push({
      id: randomUUID(),
      organization_id: CLUB,
      first_name: nome,
      last_name: `${cognome}${indice >= NOMI.length ? " jr." : ""}`,
      category_id: categoria,
      status: "active",
      birth_date: new Date(2010 - (indice % 4), (indice % 12) + 1, 12),
      data: {
        categoryIds: [categoria],
        siteId: indice % 3 === 0 ? SEDE_SUD : SEDE_NORD,
        medicalCertificateExpiry: iso(giorno(indice * 7 - 30)),
        allergies: "arachidi",
        bloodType: "0+",
        medicalNotes: "riservato: non deve uscire verso l'allenatore",
      },
      updated_at: new Date(),
    });
  }
  await prisma.athlete.createMany({ data: atleti });

  const eventi = [
    {
      titolo: "Allenamento congiunto Under 15 + Under 17",
      quando: giorno(-3),
      categorie: [CAT_U15, CAT_U17],
      tipo: "training",
    },
    {
      titolo: "Allenamento tecnico Under 15",
      quando: giorno(-1),
      categorie: [CAT_U15],
      tipo: "training",
    },
    {
      titolo: "Allenamento atletico Under 15",
      quando: giorno(1),
      categorie: [CAT_U15],
      tipo: "training",
    },
    {
      titolo: "Allenamento Prima squadra (fuori perimetro dell'allenatore)",
      quando: giorno(2),
      categorie: [CAT_PRIMA],
      tipo: "training",
    },
    {
      titolo: "Gara di campionato contro Polisportiva Sant'Antonio Abate",
      quando: giorno(5),
      categorie: [CAT_U15],
      tipo: "match",
    },
  ];

  /*
    **Gli eventi passano dal dominio, non da Prisma.** `clubs.trainings` e
    `clubs.matches` sono una proiezione in sola lettura con un solo scrittore
    (ADR-0098): un seed che scrivesse `club_events` a mano lascerebbe le due
    colonne indietro, e la schermata che le legge mostrerebbe un club vuoto.
  */
  const owner = {
    userId: presidente.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };
  const attore = { userId: presidente.id, email: presidente.email };

  for (const evento of eventi) {
    const riga = await eventi_dominio.createClubEvent(owner, evento.tipo, {
      id: `pp03uat-${randomUUID().slice(0, 8)}`,
      title: evento.titolo,
      date: iso(evento.quando),
      time: "18:30",
      endTime: "20:00",
      categoryId: evento.categorie[0],
      categories: evento.categorie,
      siteId: SEDE_NORD,
      opponent: evento.tipo === "match" ? "Polisportiva Sant'Antonio Abate" : undefined,
    });

    const dentro = atleti.filter((atleta) =>
      evento.categorie.includes(atleta.category_id),
    );

    /* L'appello gia fatto sugli allenamenti passati: e cio che rende
       osservabile lo stato «concluso» e il congelamento dei campi (ADR-0112). */
    if (evento.quando < new Date()) {
      await eventi_dominio.saveEventAttendance(
        owner,
        riga.id,
        dentro.slice(0, 8).map((atleta, indice) => ({
          athleteId: atleta.id,
          status: indice % 4 === 0 ? "absent" : "present",
        })),
        attore,
      );
    } else if (evento.tipo === "match") {
      await eventi_dominio.saveEventConvocations(
        owner,
        riga.id,
        dentro.slice(0, 10).map((atleta) => ({ athleteId: atleta.id })),
        attore,
      );
    }
  }

  console.log("");
  console.log("  Club di collaudo PP-03 seminato.");
  console.log(`  slug: ${SLUG}   id: ${CLUB}`);
  console.log("");
  console.log("  Proprietario  pp03-uat-presidente@example.invalid");
  console.log("  Allenatore    pp03-uat-mister@example.invalid");
  console.log(`  Password      ${PASSWORD}`);
  console.log("");
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
